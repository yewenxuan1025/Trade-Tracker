
export interface MarketConstants {
  date: string;
  exg_rate: number;
  aud_exg: number;
  sg_exg: number;
}

export interface StockData {
  ticker: string;
  companyName: string;
  isChinese: string; // Is China Concept Stock (Y/N)
  tradingCode: string; // Trading Code
  closePrice: number; // Closing Price
  marketCap: number; // Market Cap
  peTTM: number; // PE Ratio (TTM)
  pb: number; // Price to Book (PB)
  dividendYield: number; // Dividend Yield
  roeTTM: number; // ROE (TTM Average)
  psQuantile: number; // Price-to-Sales Ratio (using existing key for compatibility)
  type: string; // Type
  category: string; // Category
  class: string; // Class
  market: string; // Market
}

export interface TransactionData {
  id: string; // Unique Identifier
  stock: string;
  name: string;
  market: string;
  action: string;
  price: number;
  shares: number;
  date: string;
  commission: number;
  total: number;
  source: string;
  lastPrice: number;
  lastMv: number;
  option: string;
  expiration: string;
  strike: number;
  exercise?: string; // New field for Options
  type?: string;
  category?: string;
  class?: string;
}

export interface PnLData {
  id: string;
  tradeNumber?: number; // 'No.' from Excel
  stock: string;
  name?: string;
  market?: string;
  account?: string;
  option?: string; // 'Y'/'N' or specific option text
  quantity: number;
  
  buyDate: string;
  buyPrice: number;
  buyComm: number;
  totalBuy: number; // Calculated Total Cost (Negative)

  sellDate: string;
  sellPrice: number;
  sellComm: number;
  totalSell: number; // Calculated Total Sales (Positive)

  realizedPnL: number;
  returnPercent: number;
  holdingDays?: number;
  year?: number;
  month?: number;

  // Option specific fields
  expiration?: string;
  strike?: number;

  // Target Metrics (Calculated)
  tgtProfitCost?: number;
  tgtProfitSales?: number;
  tgtLossCost?: number;
  tgtLossSales?: number;

  // Links to raw transactions (if created manually)
  buyTransactionId?: string;
  sellTransactionId?: string;
}

export interface HoldingData {
  stock: string;
  name: string;
  market: string;
  position: number;
  currentCost: number; // Negative value representing total cost basis
  currentPrice: number; // Avg Cost per share
  actualPrice: number; // Breakeven price adjusted for realized P&L
  lastPrice: number;
  marketCap: number;
  pnl: number; // Total Realized P&L USD
  unrealized: number; // USD
  unrealizedCostPct: number;
  lastMv: number; // USD
  mvPct: number;
}

export interface LookupSheetData {
  stocks: StockData[];
  lastUpdated: Date;
  lookupDate?: string; // "Data Current" date from the lookup sheet
}

export interface DividendData {
  id: string;
  date: string;
  symbol: string;
  name: string;
  market: string;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
  currency: string;
  source: string;
  type: string;
}

export interface InterestData {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  source: string;
  type: string;
}

export interface CashLedgerEntry {
  id: string;
  date: string;
  type: string; // 'Deposit' | 'Withdrawal' | 'Fee' | 'Transfer' | etc.
  description: string;
  amount: number; // positive = inflow, negative = outflow
  currency: string;
  source: string;
}

// Benchmark: { date, [indexCode]: value, ... } – columns are dynamic
export interface BenchmarkPoint {
  date: string;
  [key: string]: any; // index values are numbers, date is string
}
export type BenchmarkData = BenchmarkPoint[];

// Maps Excel Header names to our internal interface keys
export const EXCEL_HEADER_MAP: Record<string, keyof StockData> = {
  'Ticker': 'ticker',
  'Company Name': 'companyName',
  'Is China Concept Stock': 'isChinese',
  'Is CCS': 'isChinese',
  'Trading Code': 'tradingCode',
  'Closing Price': 'closePrice',
  'Market Cap': 'marketCap',
  'PE Ratio (TTM)': 'peTTM',
  'PB': 'pb',
  'Dividend Yield': 'dividendYield',
  'ROE (TTM Average)': 'roeTTM',
  'ROE TTM Avg': 'roeTTM',
  'Price-to-Sales Ratio Percentile': 'psQuantile',
  'Price-to-Sales Ratio': 'psQuantile',
  'Price-to-Sales ratio': 'psQuantile',
  'Type': 'type',
  'Category': 'category',
  'Class': 'class',
  'Market': 'market'
};

export const TRANSACTION_HEADER_MAP: Record<string, keyof TransactionData> = {
  'Stock': 'stock',
  'Name': 'name',
  'Market': 'market',
  'Action': 'action',
  'Price': 'price',
  'Shares': 'shares',
  'Date': 'date',
  'Commission': 'commission',
  'Comm': 'commission',
  'Total': 'total',
  'Source': 'source',
  'Last Price': 'lastPrice',
  'Last MV': 'lastMv',
  'Option': 'option',
  'Expiration': 'expiration',
  'Strike': 'strike',
  'Type': 'type',
  'Category': 'category',
  'Class': 'class'
};

export const OPTION_HEADER_MAP: Record<string, keyof TransactionData> = {
  'Stock': 'stock',
  'Name': 'name',
  'Market': 'market',
  'Action': 'action',
  'Price': 'price',
  'Shares': 'shares',
  'Date': 'date',
  'Comm': 'commission',
  'Commission': 'commission',
  'Total': 'total',
  'Source': 'source',
  'Option': 'option',
  'Expiration': 'expiration',
  'Strike': 'strike',
  'Exercise': 'exercise'
};

export const PNL_HEADER_MAP: Record<string, string> = {
  'No.': 'tradeNumber',
  'Stock': 'stock',
  'Name': 'name',
  'Market': 'market',
  'Action': 'action',
  'Price': 'price',
  'Shares': 'shares',
  'Date': 'date',
  'Commission': 'commission',
  'Account': 'account',
  'Acct': 'account',
  'Source': 'account',
  'Option': 'option',
  'check': 'check',
  'Buy Price': 'buyPrice',
  'Buy Prc': 'buyPrice',
  'Buy Comm': 'buyComm',
  'Sell Price': 'sellPrice',
  'Sell Prc': 'sellPrice',
  'Sell Comm': 'sellComm',
  'Total Cost': 'totalBuy',
  'Total Sales': 'totalSell',
  'Strike': 'strike',
  'Expiration': 'expiration'
};

export interface NavData {
  id: string;
  date: string;
  aum: number;
  nav1: number;
  cumulativeReturn: number;
  shares: number;
  nav2: number;
}

export const NAV_HEADER_MAP: Record<string, keyof NavData> = {
  'Date': 'date',
  'AUM': 'aum',
  'NAV1': 'nav1',
  'Cumulative Return': 'cumulativeReturn',
  'Shares': 'shares',
  'NAV2': 'nav2'
};

// Dropdown Options
export const TYPE_OPTIONS = ['Trading', 'Long-Term', 'Event', 'Allocation'];
export const CATEGORY_OPTIONS = ['Cyclical', 'Value', 'Growth', 'Turnaround'];
export const CLASS_OPTIONS = ['US Stock', 'CCS', 'HK Stock', 'Crypto', 'ETF', 'AUS Stock'];
export const MARKET_OPTIONS = ['US', 'HK', 'SG', 'AUS'];
export const IS_CCS_OPTIONS = ['Y', 'N'];
export const EXERCISE_OPTIONS = ['No', 'Yes', 'Buy to Cover', 'Close Position'];
