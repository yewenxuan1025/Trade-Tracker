import { LookupSheetData, TransactionData, padHkTicker } from '../types';

export interface OcrWordBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLineBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: OcrWordBox[];
}

export interface IbScreenshotTradeCandidate {
  id: string;
  assetType: 'Stock' | 'Option';
  transaction: Omit<TransactionData, 'id'>;
  selected: boolean;
  duplicate: boolean;
  confidence: number;
  warnings: string[];
  sourceFile: string;
  rawText: string;
  venue: string;
  currency: string;
  grossAmount: number;
}

export type ActionColorDetector = (top: number, bottom: number) => 'Buy' | 'Sell' | null;
export type LeadingMinusDetector = (line: OcrLineBox, imageWidth: number) => boolean;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const DATE_PATTERN = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*,?\s*(20\d{2})\b/i;
const OPTION_PATTERN = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s+(\d{1,2})\s*['’]?\s*(\d{2,4})\s+([\d,.]+)\s*(Call|Put)\b/i;
const TIME_PATTERN = /\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/;
const KNOWN_VENUES = ['IBKRATS', 'NASDAQ', 'EMERALD', 'PEARL', 'ARCA', 'AMEX', 'DARK', 'SEHK', 'HKEX', 'ASX', 'SGX'];

const round = (value: number, precision = 6): number => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const parseDateHeader = (text: string): string => {
  const match = text.replace(/\s+/g, ' ').match(DATE_PATTERN);
  if (!match) return '';
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return '';
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
};

const parseNumber = (text: string): number | null => {
  const cleaned = String(text || '')
    .replace(/\s+/g, '')
    .replace(/[,$]/g, '')
    .replace(/[^−0-9.+-]/g, '')
    .replace(/−/g, '-');
  const match = cleaned.match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
};

const lineColumnText = (line: OcrLineBox, minX: number, maxX: number): string => line.words
  .filter(word => {
    const center = (word.bbox.x0 + word.bbox.x1) / 2;
    return center >= minX && center <= maxX;
  })
  .sort((a, b) => a.bbox.x0 - b.bbox.x0)
  .map(word => word.text)
  .join(' ');

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const splitMergedTickerVenue = (value: string): { ticker: string; venue: string } | null => {
  const cleaned = value.replace(/[^A-Za-z0-9.+]/g, '');
  const candidates: Array<{ ticker: string; venue: string; score: number }> = [];
  for (let split = 1; split < Math.min(cleaned.length, 9); split++) {
    const ticker = cleaned.slice(0, split);
    const rawVenue = cleaned.slice(split).replace(/\+\d*$/, '');
    if (!/^(?:[A-Z][A-Z0-9.]{0,7}|\d{1,6})$/.test(ticker) || rawVenue.length < 3) continue;
    const venue = rawVenue.toUpperCase();
    for (const knownVenue of KNOWN_VENUES) {
      const distance = editDistance(venue, knownVenue);
      const isExact = distance === 0;
      const isFuzzyMixedCase = /[a-z]/.test(rawVenue)
        && distance <= 2
        && venue[0] === knownVenue[0];
      if (!isExact && !isFuzzyMixedCase) continue;
      candidates.push({
        ticker: ticker.toUpperCase(),
        venue: knownVenue,
        score: distance * 10 + Math.abs(venue.length - knownVenue.length),
      });
    }
  }
  return candidates.sort((a, b) => a.score - b.score || a.ticker.length - b.ticker.length)[0] || null;
};

const extractTickerAndVenue = (line: OcrLineBox, imageWidth: number): { ticker: string; venue: string } | null => {
  const leftWords = [...line.words]
    .filter(word => word.bbox.x0 < imageWidth * 0.43)
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (leftWords.length === 0) return null;

  const firstRaw = leftWords[0].text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, '');
  if (!firstRaw) return null;

  let ticker = '';
  let joinedVenue = '';
  const mergedTickerVenue = splitMergedTickerVenue(firstRaw);
  const merged = firstRaw.match(/^([A-Z0-9.]{1,8})([a-z][A-Za-z0-9+]*)$/);
  if (mergedTickerVenue) {
    ticker = mergedTickerVenue.ticker;
    joinedVenue = mergedTickerVenue.venue;
  } else if (merged) {
    ticker = merged[1];
    joinedVenue = merged[2].toUpperCase();
  } else if (/^(?:[A-Z][A-Z0-9.]{0,7}|\d{1,6})$/.test(firstRaw)) {
    ticker = firstRaw.toUpperCase();
  } else {
    return null;
  }

  if (MONTHS[ticker.toLowerCase()] || ['BUY', 'SELL', 'LIMIT', 'DAY'].includes(ticker)) return null;

  const venueWords = leftWords.slice(1)
    .map(word => word.text.replace(/[^A-Za-z0-9+]/g, ''))
    .filter(Boolean)
    .filter(value => !TIME_PATTERN.test(value));
  return { ticker, venue: [joinedVenue, ...venueWords].filter(Boolean).join(' ').toUpperCase() };
};

const parseOptionDescription = (lines: OcrLineBox[]): { option: 'Call' | 'Put'; expiration: string; strike: number } | null => {
  for (const line of lines) {
    const match = line.text.replace(/[|]/g, 'I').replace(/\s+/g, ' ').match(OPTION_PATTERN);
    if (!match) continue;
    const month = MONTHS[match[1].toLowerCase()];
    const rawYear = Number(match[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const strike = parseNumber(match[4]);
    if (!month || strike === null) continue;
    return {
      option: match[5].toLowerCase() === 'put' ? 'Put' : 'Call',
      expiration: `${year}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`,
      strike,
    };
  }
  return null;
};

const detectActionLine = (
  lines: OcrLineBox[],
  imageWidth: number,
  actionColorDetector?: ActionColorDetector,
): { action: 'Buy' | 'Sell'; line: OcrLineBox } | null => {
  for (const line of lines) {
    const compact = lineColumnText(line, 0, imageWidth * 0.38).replace(/\s+/g, '');
    if (/(买入|买进|BUY)/i.test(compact)) return { action: 'Buy', line };
    if (/(卖出|已卖|SELL)/i.test(compact)) return { action: 'Sell', line };
  }
  if (actionColorDetector) {
    for (const line of lines) {
      const action = actionColorDetector(line.bbox.y0 - 3, line.bbox.y1 + 3);
      if (action) return { action, line };
    }
  }
  return null;
};

const extractQuantity = (line: OcrLineBox, imageWidth: number): number | null => {
  const left = lineColumnText(line, 0, imageWidth * 0.38);
  const matches = left.replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;
  const value = Number(matches[matches.length - 1]);
  return Number.isFinite(value) ? value : null;
};

const inferCurrency = (text: string): string => {
  if (/\bHKD\b/i.test(text)) return 'HKD';
  if (/\bAUD\b/i.test(text)) return 'AUD';
  if (/\bSGD\b/i.test(text)) return 'SGD';
  return 'USD';
};

const inferMarket = (currency: string, venue: string): string => {
  const normalizedVenue = venue.toUpperCase();
  if (currency === 'HKD' || /SEHK|HKEX/.test(normalizedVenue)) return 'HK';
  if (currency === 'AUD' || /ASX/.test(normalizedVenue)) return 'AUS';
  if (currency === 'SGD' || /SGX/.test(normalizedVenue)) return 'SG';
  return 'US';
};

const hasExecutionTimeColumn = (line: OcrLineBox, imageWidth: number): boolean => {
  if (TIME_PATTERN.test(line.text)) return true;
  return line.words.some(word => {
    const compact = word.text.replace(/\s+/g, '');
    return word.bbox.x0 >= imageWidth * 0.8 && /^\d{4,6}$/.test(compact);
  });
};

export const buildIbTradeFingerprint = (
  transaction: Partial<TransactionData>,
  includeTime = true,
): string => [
  String(transaction.date || '').slice(0, 10),
  includeTime ? String(transaction.executionTime || '') : '',
  String(transaction.stock || '').toUpperCase().trim(),
  String(transaction.action || '').toLowerCase().trim(),
  round(Math.abs(Number(transaction.shares) || 0), 6),
  round(Number(transaction.price) || 0, 6),
  String(transaction.option || '').toLowerCase().trim(),
  String(transaction.expiration || '').slice(0, 10),
  round(Number(transaction.strike) || 0, 6),
  round(Number(transaction.commission) || 0, 6),
].join('|');

export const parseIbOcrPage = (
  sourceLines: OcrLineBox[],
  imageWidth: number,
  sourceFile: string,
  lookupData: LookupSheetData | null,
  actionColorDetector?: ActionColorDetector,
  leadingMinusDetector?: LeadingMinusDetector,
): IbScreenshotTradeCandidate[] => {
  const lines = [...sourceLines]
    .filter(line => line.text.trim())
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  const dateAtLine = new Map<number, string>();
  let currentDate = '';
  lines.forEach((line, index) => {
    const parsedDate = parseDateHeader(line.text);
    if (parsedDate) currentDate = parsedDate;
    dateAtLine.set(index, currentDate);
  });

  const tickerLines: Array<{ index: number; ticker: string; venue: string }> = [];
  lines.forEach((line, index) => {
    if (!dateAtLine.get(index)) return;
    // On IB's filled-orders screen every real security header has an execution
    // time at the far right. Requiring it prevents amount/action rows from
    // becoming phantom securities when OCR turns Chinese text into A-Z text.
    if (!hasExecutionTimeColumn(line, imageWidth)) return;
    const tickerInfo = extractTickerAndVenue(line, imageWidth);
    if (!tickerInfo) return;
    tickerLines.push({ index, ...tickerInfo });
  });

  return tickerLines.map((tickerLine, tickerIndex): IbScreenshotTradeCandidate | null => {
    const nextIndex = tickerLines[tickerIndex + 1]?.index ?? lines.length;
    const nextDateIndex = lines.findIndex((line, index) => index > tickerLine.index && index < nextIndex && !!parseDateHeader(line.text));
    const blockEnd = nextDateIndex >= 0 ? nextDateIndex : nextIndex;
    const block = lines.slice(tickerLine.index, blockEnd);
    const date = dateAtLine.get(tickerLine.index) || '';
    if (!date || block.length === 0) return null;

    const actionResult = detectActionLine(block.slice(1), imageWidth, actionColorDetector);
    const warnings: string[] = [];
    const action = actionResult?.action || 'Buy';
    const recognizedShares = actionResult ? extractQuantity(actionResult.line, imageWidth) : null;
    if (!actionResult) warnings.push('Could not identify Buy/Sell; defaulted to Buy');

    const middleEntries = block
      .map(line => ({
        line,
        value: parseNumber(lineColumnText(line, imageWidth * 0.45, imageWidth * 0.76)),
      }))
      .filter((entry): entry is { line: OcrLineBox; value: number } => entry.value !== null);
    const price = Math.abs(middleEntries[0]?.value || 0);
    let grossAmount = Math.abs(middleEntries[1]?.value || 0);
    const commissionFound = middleEntries.length >= 3;
    let commission = commissionFound ? middleEntries[2].value : 0;
    const commissionText = commissionFound
      ? lineColumnText(middleEntries[2].line, imageWidth * 0.45, imageWidth * 0.76).trim()
      : '';
    // A standalone dollar sign is occasionally recognized as the digit 9.
    // IB always displays a currency marker here, so values such as 92.92 are
    // safely recoverable as $2.92 when the marker itself disappeared.
    const dollarAsNine = commissionText.match(/^9(\d+\.\d{2})$/);
    if (dollarAsNine) commission = Number(dollarAsNine[1]);
    if (commission > 0 && leadingMinusDetector?.(middleEntries[2].line, imageWidth)) commission *= -1;
    const optionDescription = parseOptionDescription(block);
    const assetType: IbScreenshotTradeCandidate['assetType'] = optionDescription ? 'Option' : 'Stock';
    const multiplier = assetType === 'Option' ? 100 : 1;
    const calculatedShares = price > 0 && grossAmount > 0 ? grossAmount / price / multiplier : 0;
    const roundedCalculatedShares = Math.round(calculatedShares);
    const hasReliableCalculatedShares = roundedCalculatedShares > 0
      && Math.abs(calculatedShares - roundedCalculatedShares) <= Math.max(0.02, calculatedShares * 0.002);
    let quantity = Math.abs(recognizedShares || 0);
    if (hasReliableCalculatedShares && (
      !quantity
      || (assetType === 'Option' && Math.abs(quantity - roundedCalculatedShares) > 0.02)
    )) {
      quantity = roundedCalculatedShares;
      warnings.push('Quantity was inferred from the execution amount');
    }
    if (!quantity) warnings.push('Quantity needs review');
    if (!price) warnings.push('Execution price needs review');
    if (!grossAmount && price && quantity) {
      grossAmount = price * quantity * multiplier;
      warnings.push('Gross amount was calculated from price and quantity');
    }
    if (!commissionFound) warnings.push('Commission was not recognized and was set to 0');

    const fullText = block.map(line => line.text).join(' ');
    const currency = inferCurrency(fullText);
    const lookup = lookupData?.stocks.find(stock => stock.ticker.toUpperCase() === tickerLine.ticker.toUpperCase());
    const market = lookup?.market || inferMarket(currency, tickerLine.venue);
    const stock = padHkTicker(tickerLine.ticker.toUpperCase(), market);
    const executionTime = block[0].text.match(TIME_PATTERN)?.[0] || '';
    const total = action === 'Buy'
      ? -grossAmount - commission
      : grossAmount - commission;
    const lastPrice = assetType === 'Stock' ? (lookup?.closePrice || price) : 0;
    const baseTransaction: Omit<TransactionData, 'id'> = {
      stock,
      name: lookup?.companyName || stock,
      market,
      action,
      price,
      shares: quantity,
      date,
      commission,
      total: round(total),
      source: 'IB AUS',
      lastPrice,
      lastMv: assetType === 'Stock' ? round(lastPrice * quantity) : 0,
      option: optionDescription?.option || '',
      expiration: optionDescription?.expiration || '',
      strike: optionDescription?.strike || 0,
      exercise: assetType === 'Option' ? 'No' : undefined,
      executionTime,
    };
    const fingerprint = buildIbTradeFingerprint(baseTransaction);
    baseTransaction.importFingerprint = fingerprint;

    const relevantConfidence = block.reduce((sum, line) => sum + (Number(line.confidence) || 0), 0) / block.length;
    const confidence = Math.max(0, Math.min(100, Math.round(relevantConfidence - warnings.length * 8)));
    return {
      id: `ib-ocr-${stableHash(`${sourceFile}|${fingerprint}|${block[0].bbox.y0}`)}`,
      assetType,
      transaction: baseTransaction,
      selected: warnings.length === 0 || (actionResult !== null && !!quantity && !!price),
      duplicate: false,
      confidence,
      warnings,
      sourceFile,
      rawText: block.map(line => line.text.trim()).join('\n'),
      venue: tickerLine.venue,
      currency,
      grossAmount: round(grossAmount),
    };
  }).filter((candidate): candidate is IbScreenshotTradeCandidate => candidate !== null);
};

export const markIbScreenshotDuplicates = (
  candidates: IbScreenshotTradeCandidate[],
  existingTransactions: TransactionData[],
): IbScreenshotTradeCandidate[] => {
  const existingExact = new Set(existingTransactions
    .map(transaction => transaction.importFingerprint || buildIbTradeFingerprint(transaction))
    .filter(Boolean));
  const legacyExisting = new Set(existingTransactions
    .filter(transaction => !transaction.importFingerprint)
    .map(transaction => buildIbTradeFingerprint(transaction, false)));
  const seenCandidates = new Set<string>();

  return candidates.map(candidate => {
    const fingerprint = buildIbTradeFingerprint(candidate.transaction);
    const legacyFingerprint = buildIbTradeFingerprint(candidate.transaction, false);
    const duplicate = existingExact.has(fingerprint)
      || legacyExisting.has(legacyFingerprint)
      || seenCandidates.has(fingerprint);
    seenCandidates.add(fingerprint);
    return {
      ...candidate,
      duplicate,
      selected: duplicate ? false : candidate.selected,
      warnings: duplicate
        ? Array.from(new Set([...candidate.warnings, 'Duplicate of an existing or selected screenshot record']))
        : candidate.warnings,
    };
  });
};
