import { LookupSheetData, MarketConstants, PnLData, TradeEventData } from '../types';

export type AIProvider = 'openai' | 'anthropic' | 'volcengine';
export type AICredentialMode = 'shared' | 'personal';

export interface AIAnalysisPeriod {
  startDate: string;
  endDate: string;
  label: string;
}

export interface AIAnalysisConfig {
  gatewayUrl: string;
  provider: AIProvider;
  model: string;
  credentialMode: AICredentialMode;
  apiKey?: string;
  gatewayAccessToken?: string;
  includeMarketContext: boolean;
  includeNews: boolean;
  analysisFocus?: string;
}

export interface TradingAnalysisPayload {
  period: AIAnalysisPeriod;
  generatedAt: string;
  summary: {
    eventCount: number;
    stockEventCount: number;
    optionEventCount: number;
    buyEventCount: number;
    sellEventCount: number;
    linkedPnlEventCount: number;
    uniqueTickers: number;
    totalCommission: number;
    realizedTradeCount: number;
    realizedPnlUsd: number;
    winningTrades: number;
    losingTrades: number;
  };
  tickerActivity: Array<{
    ticker: string;
    name: string;
    market: string;
    events: number;
    buyShares: number;
    sellShares: number;
    grossBuyValue: number;
    grossSellValue: number;
    commission: number;
    linkedPnlEvents: number;
  }>;
  executions: Array<{
    date: string;
    assetType: string;
    stock: string;
    name: string;
    market: string;
    action: string;
    price: number;
    shares: number;
    commission: number;
    total: number;
    source: string;
    option?: string;
    expiration?: string;
    strike?: number;
    linkedPnlTradeNumber?: number;
  }>;
  realizedTrades: Array<{
    tradeNumber?: number;
    stock: string;
    name?: string;
    market?: string;
    option?: string;
    quantity: number;
    buyDate: string;
    sellDate: string;
    realizedPnl: number;
    realizedPnlUsd: number;
    returnPercent: number;
    holdingDays?: number;
  }>;
  marketContext?: {
    asOfDate: string;
    exchangeRates: { usdHkd: number; usdAud: number; usdSgd: number };
    securities: Array<{
      ticker: string;
      name: string;
      market: string;
      closePrice: number;
      marketCap: number;
      peTtm: number;
      pb: number;
      dividendYield: number;
      roeTtm: number;
      type: string;
      category: string;
      class: string;
    }>;
  };
}

export interface AIAnalysisResult {
  report: string;
  provider: AIProvider;
  model: string;
  period: AIAnalysisPeriod;
  createdAt: string;
  sources?: Array<{ title?: string; url: string }>;
  warning?: string;
}

export interface AIModelOption {
  id: string;
  label: string;
  generation: string;
  accessNote?: string;
}

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  volcengine: 'Volcano Engine',
};

export const AI_PROVIDER_MODELS: Record<AIProvider, AIModelOption[]> = {
  openai: [
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', generation: 'GPT-6' },
    { id: 'gpt-5.6', label: 'GPT-5.6 (automatic routing)', generation: 'GPT-5.6' },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', generation: 'GPT-5.6' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', generation: 'GPT-5.6' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', generation: 'GPT-5.6' },
  ],
  anthropic: [
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', generation: 'Claude 5' },
    { id: 'claude-mythos-5-1', label: 'Claude Mythos 5.1', generation: 'Claude 5', accessNote: 'Limited access' },
    { id: 'claude-opus-5', label: 'Claude Opus 5', generation: 'Claude 5' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', generation: 'Claude 5' },
    { id: 'claude-fable-5', label: 'Claude Fable 5', generation: 'Claude 5' },
    { id: 'claude-mythos-5', label: 'Claude Mythos 5', generation: 'Claude 5', accessNote: 'Limited access' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', generation: 'Claude 4' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', generation: 'Claude 4' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', generation: 'Claude 4' },
    { id: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5', generation: 'Claude 4' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', generation: 'Claude 4' },
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', generation: 'Claude 4' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', generation: 'Claude 4' },
  ],
  volcengine: [
    { id: 'doubao-seed-2-1-pro-260628', label: 'Doubao Seed 2.1 Pro', generation: 'Doubao Seed 2.1' },
    { id: 'doubao-seed-2-1-turbo-260628', label: 'Doubao Seed 2.1 Turbo', generation: 'Doubao Seed 2.1' },
    { id: 'doubao-seed-2-0-pro-260215', label: 'Doubao Seed 2.0 Pro', generation: 'Doubao Seed 2.0' },
    { id: 'doubao-seed-2-0-lite-260215', label: 'Doubao Seed 2.0 Lite', generation: 'Doubao Seed 2.0' },
    { id: 'doubao-seed-2-0-mini-260428', label: 'Doubao Seed 2.0 Mini', generation: 'Doubao Seed 2.0' },
  ],
};

export const AI_PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-5.6-luna',
  anthropic: 'claude-sonnet-5',
  volcengine: 'doubao-seed-2-1-turbo-260628',
};

const viteEnvironment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
export const DEFAULT_AI_GATEWAY_URL = String(viteEnvironment?.VITE_AI_PROXY_URL || '').trim();

const normalizeAction = (action: string): 'buy' | 'sell' | 'other' => {
  const normalized = String(action || '').trim().toLowerCase();
  if (normalized.startsWith('buy') || normalized.includes('cover')) return 'buy';
  if (normalized.startsWith('sell') || normalized.includes('short')) return 'sell';
  return 'other';
};

const inDateRange = (date: string | undefined, period: AIAnalysisPeriod): boolean => {
  const normalized = String(date || '').slice(0, 10);
  if (!normalized) return false;
  return (!period.startDate || normalized >= period.startDate)
    && (!period.endDate || normalized <= period.endDate);
};

const toUsd = (amount: number, market: string | undefined, ticker: string | undefined, constants: MarketConstants): number => {
  const normalizedMarket = String(market || '').trim().toUpperCase();
  if (normalizedMarket === 'HK') return amount / (constants.exg_rate || 1);
  if (['AUS', 'AUD', 'AU', 'AUSTRALIA'].includes(normalizedMarket) || /\.AX$/i.test(String(ticker || ''))) {
    return amount / (constants.aud_exg || 1);
  }
  if (normalizedMarket === 'SG') return amount / (constants.sg_exg || 1);
  return amount;
};

export const buildTradingAnalysisPayload = (
  events: TradeEventData[],
  pnlData: PnLData[],
  lookupData: LookupSheetData | null,
  marketConstants: MarketConstants,
  period: AIAnalysisPeriod,
  includeMarketContext: boolean,
): TradingAnalysisPayload => {
  const selectedEvents = events
    .filter(event => event.recordStatus === 'Recorded' && inDateRange(event.date, period))
    .sort((left, right) => (right.date || '').localeCompare(left.date || '') || String(right.id).localeCompare(String(left.id)));

  const selectedPnl = pnlData
    .filter(record => inDateRange(record.sellDate, period))
    .sort((left, right) => (right.sellDate || '').localeCompare(left.sellDate || '') || (right.tradeNumber || 0) - (left.tradeNumber || 0));

  const tickerMap = new Map<string, TradingAnalysisPayload['tickerActivity'][number]>();
  selectedEvents.forEach(event => {
    const ticker = String(event.stock || '').toUpperCase();
    const current = tickerMap.get(ticker) || {
      ticker,
      name: event.name || ticker,
      market: event.market || '',
      events: 0,
      buyShares: 0,
      sellShares: 0,
      grossBuyValue: 0,
      grossSellValue: 0,
      commission: 0,
      linkedPnlEvents: 0,
    };
    const direction = normalizeAction(event.action);
    current.events += 1;
    current.commission += Number(event.commission) || 0;
    if (event.linkedPnlId) current.linkedPnlEvents += 1;
    if (direction === 'buy') {
      current.buyShares += Math.abs(Number(event.shares) || 0);
      current.grossBuyValue += Math.abs(Number(event.total) || 0);
    } else if (direction === 'sell') {
      current.sellShares += Math.abs(Number(event.shares) || 0);
      current.grossSellValue += Math.abs(Number(event.total) || 0);
    }
    tickerMap.set(ticker, current);
  });

  const realizedTrades = selectedPnl.map(record => ({
    tradeNumber: record.tradeNumber,
    stock: record.stock,
    name: record.name,
    market: record.market,
    option: record.option,
    quantity: record.quantity,
    buyDate: record.buyDate,
    sellDate: record.sellDate,
    realizedPnl: record.realizedPnL,
    realizedPnlUsd: toUsd(record.realizedPnL, record.market, record.stock, marketConstants),
    returnPercent: record.returnPercent,
    holdingDays: record.holdingDays,
  }));

  const detailedExecutions = selectedEvents.map(event => ({
    date: event.date,
    assetType: event.assetType,
    stock: event.stock,
    name: event.name,
    market: event.market,
    action: event.action,
    price: event.price,
    shares: event.shares,
    commission: event.commission,
    total: event.total,
    source: event.source,
    option: event.option || undefined,
    expiration: event.expiration || undefined,
    strike: event.strike || undefined,
    linkedPnlTradeNumber: event.linkedPnlTradeNumber,
  }));

  const realizedPnlUsd = realizedTrades.reduce((sum, record) => sum + record.realizedPnlUsd, 0);
  const tickers = new Set(selectedEvents.map(event => String(event.stock || '').toUpperCase()));
  const tickerActivity = Array.from(tickerMap.values())
    .sort((left, right) => right.events - left.events || left.ticker.localeCompare(right.ticker));

  const marketContext = includeMarketContext ? {
    asOfDate: marketConstants.date,
    exchangeRates: {
      usdHkd: marketConstants.exg_rate,
      usdAud: marketConstants.aud_exg,
      usdSgd: marketConstants.sg_exg,
    },
    securities: (lookupData?.stocks || [])
      .filter(stock => tickers.has(String(stock.ticker || '').toUpperCase()))
      .map(stock => ({
        ticker: stock.ticker,
        name: stock.companyName,
        market: stock.market,
        closePrice: stock.closePrice,
        marketCap: stock.marketCap,
        peTtm: stock.peTTM,
        pb: stock.pb,
        dividendYield: stock.dividendYield,
        roeTtm: stock.roeTTM,
        type: stock.type,
        category: stock.category,
        class: stock.class,
      })),
  } : undefined;

  return {
    period,
    generatedAt: new Date().toISOString(),
    summary: {
      eventCount: selectedEvents.length,
      stockEventCount: selectedEvents.filter(event => event.assetType === 'Stock').length,
      optionEventCount: selectedEvents.filter(event => event.assetType === 'Option').length,
      buyEventCount: selectedEvents.filter(event => normalizeAction(event.action) === 'buy').length,
      sellEventCount: selectedEvents.filter(event => normalizeAction(event.action) === 'sell').length,
      linkedPnlEventCount: selectedEvents.filter(event => Boolean(event.linkedPnlId)).length,
      uniqueTickers: tickers.size,
      totalCommission: selectedEvents.reduce((sum, event) => sum + (Number(event.commission) || 0), 0),
      realizedTradeCount: realizedTrades.length,
      realizedPnlUsd,
      winningTrades: realizedTrades.filter(record => record.realizedPnlUsd > 0).length,
      losingTrades: realizedTrades.filter(record => record.realizedPnlUsd < 0).length,
    },
    tickerActivity,
    executions: detailedExecutions,
    realizedTrades,
    marketContext,
  };
};

const extractErrorMessage = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.error === 'string') return record.error;
  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
  }
  return typeof record.message === 'string' ? record.message : '';
};

export const requestTradingAnalysis = async (
  config: AIAnalysisConfig,
  payload: TradingAnalysisPayload,
): Promise<AIAnalysisResult> => {
  const gatewayUrl = config.gatewayUrl.trim();
  if (!gatewayUrl) throw new Error('Please configure the AI Gateway URL.');
  if (!config.model.trim()) throw new Error('Please choose or enter a model.');
  if (config.credentialMode === 'personal' && !config.apiKey?.trim()) {
    throw new Error('Please enter your personal API key.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        provider: config.provider,
        model: config.model.trim(),
        credentialMode: config.credentialMode,
        apiKey: config.credentialMode === 'personal' ? config.apiKey?.trim() : undefined,
        gatewayAccessToken: config.gatewayAccessToken?.trim() || undefined,
        includeMarketContext: config.includeMarketContext,
        includeNews: config.includeNews,
        analysisFocus: config.analysisFocus?.trim() || undefined,
        payload,
      }),
    });

    const responseData = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(extractErrorMessage(responseData) || `AI request failed (${response.status}).`);
    }
    const report = typeof responseData.report === 'string' ? responseData.report.trim() : '';
    if (!report) throw new Error('The AI gateway returned an empty report.');

    return {
      report,
      provider: config.provider,
      model: typeof responseData.model === 'string' ? responseData.model : config.model,
      period: payload.period,
      createdAt: new Date().toISOString(),
      sources: Array.isArray(responseData.sources)
        ? responseData.sources.filter((source): source is { title?: string; url: string } => (
          Boolean(source)
          && typeof source === 'object'
          && typeof (source as { url?: unknown }).url === 'string'
          && /^https?:\/\//i.test((source as { url: string }).url)
        ))
        : undefined,
      warning: typeof responseData.warning === 'string' ? responseData.warning : undefined,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI analysis timed out after 120 seconds.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};
