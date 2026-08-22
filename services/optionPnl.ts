import { LookupSheetData, PnLData } from '../types';

export const OPTION_CONTRACT_MULTIPLIER = 100;

const round2 = (value: number): number => parseFloat(value.toFixed(2));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatDateParts = (year: number, month: number, day: number): string => {
  if (!year || year < 1900 || year > 2999 || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return '';
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

const normalizeDateKey = (value: string | undefined): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const yearFirst = raw.match(/(\d{4})[\-/.\s年](\d{1,2})[\-/.\s月](\d{1,2})/);
  if (yearFirst) return formatDateParts(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  const compact = raw.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (compact) return formatDateParts(Number(compact[1]), Number(compact[2]), Number(compact[3]));

  return raw;
};

const getTickerCandidates = (value: string | undefined): Set<string> => {
  const raw = String(value || '').trim().toUpperCase();
  const candidates = new Set<string>();
  if (!raw) return candidates;

  candidates.add(raw);
  candidates.add(raw.replace(/\s+/g, ''));

  const withoutKnownSuffix = raw.replace(/\.(HK|N|O|AX|SI|SS|SZ)$/i, '');
  candidates.add(withoutKnownSuffix);

  if (/^\d{1,4}$/.test(withoutKnownSuffix)) {
    candidates.add(withoutKnownSuffix.padStart(4, '0'));
  }

  return candidates;
};

const lookupMatchesTicker = (recordTicker: string | undefined, lookupTicker: string | undefined, tradingCode: string | undefined): boolean => {
  const recordCandidates = getTickerCandidates(recordTicker);
  const lookupCandidates = new Set([...getTickerCandidates(lookupTicker), ...getTickerCandidates(tradingCode)]);
  return Array.from(recordCandidates).some(candidate => lookupCandidates.has(candidate));
};

export const isOptionPnlRecord = (record: PnLData): boolean =>
  !!record.option && ['Call', 'Put'].includes(record.option);

export const isAssignmentOptionRecord = (record: PnLData): boolean =>
  isOptionPnlRecord(record) && (record.optionAction || '').trim().toLowerCase() === 'assignment';

const inferAssignmentDate = (record: PnLData): string => {
  if (record.assignmentDate) return record.assignmentDate;
  if (record.buyDate) return record.buyDate;
  if (record.sellDate) return record.sellDate;
  return '';
};

const getLookupClosePrice = (record: PnLData, lookupData?: LookupSheetData | null): number | undefined => {
  const assignmentDate = normalizeDateKey(inferAssignmentDate(record));
  const lookupDate = normalizeDateKey(lookupData?.lookupDate);
  if (!assignmentDate || !lookupDate || lookupDate !== assignmentDate) return undefined;
  const lookup = lookupData?.stocks.find(s => lookupMatchesTicker(record.stock, s.ticker, s.tradingCode));
  return lookup && isFiniteNumber(lookup.closePrice) && lookup.closePrice > 0 ? lookup.closePrice : undefined;
};

export const calculateAssignmentImpact = (
  optionType: string | undefined,
  strike: number | undefined,
  closePrice: number | undefined,
  assignedShares: number | undefined,
): number | undefined => {
  if (!isFiniteNumber(strike) || !isFiniteNumber(closePrice) || !isFiniteNumber(assignedShares)) return undefined;
  const type = (optionType || '').toLowerCase();
  if (type === 'call') return round2(-Math.max(closePrice - strike, 0) * assignedShares);
  if (type === 'put') return round2(-Math.max(strike - closePrice, 0) * assignedShares);
  return undefined;
};

export const getOptionOpeningAmount = (record: PnLData): number => {
  const action = (record.optionAction || '').trim().toLowerCase();
  if (action === 'buy to cover' || action === 'assignment' || action === 'expire') {
    return Math.abs(record.totalSell || 0);
  }
  if (action === 'close position') return Math.abs(record.totalBuy || 0);
  return Math.max(Math.abs(record.totalBuy || 0), Math.abs(record.totalSell || 0));
};

const getReturnPercent = (pnl: number | undefined, record: PnLData): number | undefined => {
  if (!isFiniteNumber(pnl)) return undefined;
  const openingAmount = getOptionOpeningAmount(record);
  return openingAmount !== 0 ? (pnl / openingAmount) * 100 : 0;
};

export const buildOptionPnlFields = (
  record: PnLData,
  lookupData?: LookupSheetData | null,
): Partial<PnLData> => {
  if (!isOptionPnlRecord(record)) return {};

  const premiumPnl = round2(record.realizedPnL || 0);

  if (!isAssignmentOptionRecord(record)) {
    return {
      premiumPnl,
      assignmentDate: undefined,
      assignmentClosePrice: undefined,
      assignedShares: undefined,
      assignmentImpact: 0,
      optionEconomicPnL: premiumPnl,
      optionEconomicReturnPercent: getReturnPercent(premiumPnl, record),
      assignmentPriceStatus: 'Not Required',
    };
  }

  const assignmentDate = normalizeDateKey(inferAssignmentDate(record));
  const assignedShares = isFiniteNumber(record.assignedShares) && record.assignedShares > 0
    ? record.assignedShares
    : Math.abs(record.quantity || 0) * OPTION_CONTRACT_MULTIPLIER;
  const existingClosePrice = isFiniteNumber(record.assignmentClosePrice) && record.assignmentClosePrice > 0
    ? record.assignmentClosePrice
    : undefined;
  const lookupClosePrice = existingClosePrice === undefined ? getLookupClosePrice(record, lookupData) : undefined;
  const assignmentClosePrice = existingClosePrice ?? lookupClosePrice;
  const assignmentPriceStatus: PnLData['assignmentPriceStatus'] = assignmentClosePrice === undefined
    ? 'Pending'
    : lookupClosePrice !== undefined
      ? 'Lookup Data'
      : record.assignmentPriceStatus === 'Lookup Data'
        ? 'Lookup Data'
        : 'Manual';
  const assignmentImpact = calculateAssignmentImpact(
    record.option,
    record.strike,
    assignmentClosePrice,
    assignedShares,
  );
  const optionEconomicPnL = assignmentImpact !== undefined ? round2(premiumPnl + assignmentImpact) : undefined;

  return {
    premiumPnl,
    assignmentDate,
    assignmentClosePrice,
    assignedShares,
    assignmentImpact,
    optionEconomicPnL,
    optionEconomicReturnPercent: getReturnPercent(optionEconomicPnL, record),
    assignmentPriceStatus,
  };
};

export const getOptionPnlValue = (record: PnLData): number | undefined => {
  if (isAssignmentOptionRecord(record) && record.assignmentPriceStatus === 'Pending') return undefined;
  if (isOptionPnlRecord(record) && isFiniteNumber(record.optionEconomicPnL)) return record.optionEconomicPnL;
  return record.realizedPnL;
};

export const getOptionReturnPercentValue = (record: PnLData): number | undefined => {
  if (isAssignmentOptionRecord(record) && record.assignmentPriceStatus === 'Pending') return undefined;
  if (isOptionPnlRecord(record) && isFiniteNumber(record.optionEconomicReturnPercent)) {
    return record.optionEconomicReturnPercent;
  }
  return record.returnPercent;
};
