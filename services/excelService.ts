
import * as XLSX from 'xlsx';
import { LookupSheetData, StockData, TransactionData, PnLData, EXCEL_HEADER_MAP, TRANSACTION_HEADER_MAP, OPTION_HEADER_MAP, PNL_HEADER_MAP, NAV_HEADER_MAP, MarketConstants, NavData, DividendData, InterestData, CashLedgerEntry, BenchmarkData, padHkTicker } from '../types';

/**
 * Robust ID generator
 */
export const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

/**
 * Defensive market→FX-rate lookup. Accepts non-canonical market labels
 * ("Australia", "AU", blanks) and falls back to the .AX ticker suffix
 * so AUS holdings still convert to USD when the market field is mislabeled.
 */
const AUS_MARKETS_SET = new Set(['AUS', 'AUD', 'AU', 'AUSTRALIA']);
export const getMarketRate = (market: string, ticker: string | undefined, mc: MarketConstants): number => {
  const m = (market || '').toUpperCase().trim();
  if (m === 'HK') return mc.exg_rate || 1;
  if (m === 'SG') return mc.sg_exg || 1;
  if (AUS_MARKETS_SET.has(m)) return mc.aud_exg || 1;
  if (ticker && /\.AX$/i.test(ticker)) return mc.aud_exg || 1;
  return 1;
};
export const isAusMarketTicker = (market: string, ticker: string | undefined): boolean => {
  const m = (market || '').toUpperCase().trim();
  return AUS_MARKETS_SET.has(m) || (!!ticker && /\.AX$/i.test(ticker));
};

/**
 * Helper to safely parse numeric values from Excel
 */
const parseNumeric = (val: any, precision?: number): number => {
  if (val === null || val === undefined || val === '') return 0;
  let num: number;
  if (typeof val === 'number') num = val;
  else {
    const str = String(val).replace(/[^0-9.-]+/g, "");
    num = parseFloat(str);
  }
  if (isNaN(num)) return 0;
  if (precision !== undefined) return parseFloat(num.toFixed(precision));
  return num;
};

/**
 * Helper to parse Excel dates
 */
const parseExcelDate = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0]; 
  }
  return String(val);
};

const NUMERIC_KEYS: (keyof StockData)[] = ['marketCap', 'closePrice', 'peTTM', 'pb', 'dividendYield', 'roeTTM', 'psQuantile'];
const TRANSACTION_NUMERIC_KEYS: (keyof TransactionData)[] = ['price', 'shares', 'commission', 'total', 'lastPrice', 'lastMv', 'strike'];
const TWO_DECIMAL_KEYS: (keyof StockData)[] = ['dividendYield', 'roeTTM', 'psQuantile', 'pb', 'closePrice', 'peTTM'];
const NAV_NUMERIC_KEYS: (keyof NavData)[] = ['aum', 'nav1', 'cumulativeReturn', 'shares', 'nav2', 'cashFlow'];

const LOOKUP_EXPORT_MAP: Record<string, string> = {
    ticker: 'Ticker',
    companyName: 'Company Name',
    isChinese: 'Is CCS',
    tradingCode: 'Trading Code',
    closePrice: 'Closing Price',
    marketCap: 'Market Cap',
    peTTM: 'PE Ratio (TTM)',
    pb: 'PB',
    dividendYield: 'Dividend Yield',
    roeTTM: 'ROE (TTM Average)',
    psQuantile: 'Price-to-Sales Ratio',
    type: 'Type',
    category: 'Category',
    class: 'Class',
    market: 'Market'
};

const TRANSACTION_EXPORT_MAP: Record<string, string> = {
    stock: 'Stock',
    name: 'Name',
    market: 'Market',
    action: 'Action',
    price: 'Price',
    shares: 'Shares',
    date: 'Date',
    commission: 'Commission',
    total: 'Total',
    source: 'Source',
    lastPrice: 'Last Price',
    lastMv: 'Last MV',
    option: 'Option',
    expiration: 'Expiration',
    strike: 'Strike',
    exercise: 'Exercise'
};

const OPTION_EXPORT_MAP: Record<string, string> = {
    stock: 'Stock',
    name: 'Name',
    market: 'Market',
    action: 'Action',
    price: 'Price',
    shares: 'Shares',
    date: 'Date',
    commission: 'Commission',
    total: 'Total',
    source: 'Source',
    option: 'Option',
    expiration: 'Expiration',
    strike: 'Strike',
    exercise: 'Exercise'
};

const PNL_EXPORT_MAP: Record<string, string> = {
    tradeNumber: 'No.',
    stock: 'Stock',
    name: 'Name',
    market: 'Market',
    account: 'Account',
    option: 'Option',
    quantity: 'Shares',
    buyDate: 'Buy Date',
    buyPrice: 'Buy Price',
    buyComm: 'Buy Comm',
    totalBuy: 'Total Cost',
    sellDate: 'Sell Date',
    sellPrice: 'Sell Price',
    sellComm: 'Sell Comm',
    totalSell: 'Total Sales',
    realizedPnL: 'Realized P&L',
    returnPercent: 'Return %',
    holdingDays: 'Holding Days',
    year: 'Year',
    month: 'Month',
    expiration: 'Expiration',
    strike: 'Strike',
    optionAction: 'Action'
};

const NAV_EXPORT_MAP: Record<string, string> = {
    date: 'Date',
    aum: 'AUM',
    cashFlow: 'Cash Flow',
    nav1: 'NAV1',
    cumulativeReturn: 'Cumulative Return',
    shares: 'Shares',
    nav2: 'NAV2'
};

const mapToExport = (data: any[], map: Record<string, string>) => {
    return data.map(item => {
        const newItem: any = {};
        Object.entries(map).forEach(([key, header]) => {
            if (item[key] !== undefined && item[key] !== null) {
                newItem[header] = item[key];
            }
        });
        return newItem;
    });
};

export interface ParseResult {
  lookup: LookupSheetData;
  transactions: TransactionData[];
  optionTransactions: TransactionData[];
  pnl: PnLData[];
  navData: NavData[];
  dividends: DividendData[];
  interest: InterestData[];
  cashLedger: CashLedgerEntry[];
  benchmark: BenchmarkData;
  warnings: string[];
}

/** Parse the "Benchmark Indicies" Excel file (4 metadata rows, then Date + N index columns) */
export const parseBenchmarkFile = async (file: File): Promise<BenchmarkData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const jsonRaw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true }) as any[][];

        // Find the header row: the row containing "Date" (case-insensitive) as first non-empty cell
        let headerIdx = -1;
        for (let i = 0; i < Math.min(jsonRaw.length, 10); i++) {
          const firstCell = String(jsonRaw[i][0] || '').trim().toLowerCase();
          if (firstCell === 'date') { headerIdx = i; break; }
        }
        if (headerIdx === -1) { resolve([]); return; }

        const headers: string[] = jsonRaw[headerIdx].map((h: any) => String(h || '').trim());
        const indexCols = headers.slice(1).filter(h => h); // all columns after Date

        const result: BenchmarkData = [];
        for (let i = headerIdx + 1; i < jsonRaw.length; i++) {
          const row = jsonRaw[i];
          if (!row || !row[0]) continue;
          const dateVal = row[0];
          let dateStr = '';
          if (dateVal instanceof Date) {
            dateStr = dateVal.toISOString().split('T')[0];
          } else if (typeof dateVal === 'number') {
            // Excel serial date
            const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            dateStr = d.toISOString().split('T')[0];
          } else {
            dateStr = String(dateVal).trim();
          }
          if (!dateStr) continue;
          const point: any = { date: dateStr };
          indexCols.forEach((col, ci) => {
            const v = parseNumeric(row[ci + 1]);
            if (v !== 0 || row[ci + 1] !== undefined) point[col] = v;
          });
          result.push(point);
        }
        resolve(result.sort((a, b) => a.date.localeCompare(b.date)));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Applies formatting (Column Widths and Number Formats) to a worksheet
 */
const formatWorksheet = (ws: XLSX.WorkSheet, data: any[]) => {
  if (!data || data.length === 0) return;
  
  // 1. Auto-Column Width
  const keys = Object.keys(data[0]);
  const colWidths = keys.map(key => {
    let max = key.length;
    // Check first 20 rows to estimate width
    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const val = data[i][key];
        if (val !== null && val !== undefined) {
            const len = String(val).length;
            if (len > max) max = len;
        }
    }
    return { wch: Math.min(max + 3, 50) }; // Cap width at 50 chars
  });
  ws['!cols'] = colWidths;

  // 2. Number Formatting
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const headerRef = XLSX.utils.encode_cell({ r: range.s.r, c: C });
    const headerCell = ws[headerRef];
    if (!headerCell || !headerCell.v) continue;
    
    const header = String(headerCell.v).toLowerCase();
    let fmt = '';

    // Rounded Currency (History)
    if (['cumulative', 'daily p&l', 'avg p&l', 'avg trade amt'].some(k => header.includes(k))) {
        fmt = '#,##0';
    }
    // Percentages
    else if (['dividendyield', 'roettm', 'psquantile', 'returnpercent', 'unrealizedpct', 'mv_pct', 'pnlpct', 'mvpct', 'percentage', 'cumulative return'].some(k => header.includes(k.toLowerCase()) || header === k)) {
        fmt = '0.00%';
    }
    // Currency / Price / Monetary Values
    else if (['price', 'marketcap', 'total', 'commission', 'mv', 'pnl', 'cost', 'sales', 'pettm', 'pb', 'strike', 'avgcost', 'lastprice', 'value', 'lastmv', 'aum', 'nav1', 'nav2'].some(k => header.includes(k.toLowerCase()) || header.toLowerCase() === k)) {
         fmt = '#,##0.00';
    }
    // Integers / Counts
    else if (['shares', 'quantity', 'position', 'holdingdays', 'tradenumber', 'count', 'trades'].some(k => header.includes(k.toLowerCase()) || header.toLowerCase() === k)) {
         fmt = '#,##0';
    }

    if (fmt) {
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (ws[cellRef] && ws[cellRef].t === 'n') {
          ws[cellRef].z = fmt;
        }
      }
    }
  }
};

export const parseExcelFile = async (file: File): Promise<ParseResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("File is empty");
        const workbook = XLSX.read(data, { type: 'array' });
        const warnings: string[] = [];

        // --- PARSE LOOKUP SHEET ---
        const lookupSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'lookup');
        let stocks: StockData[] = [];
        let lookupDate: string | undefined;
        if (lookupSheetName) {
            const sheet = workbook.Sheets[lookupSheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            let headerRowIndex = -1;
            for (let i = 0; i < jsonData.length; i++) {
              const row = jsonData[i];
              // Try to detect the lookup date from pre-header rows (e.g. a cell labelled "Date" or "Lookup Date")
              if (!lookupDate) {
                for (let ci = 0; ci < row.length - 1; ci++) {
                  const label = String(row[ci] || '').trim().toLowerCase();
                  if (label === 'date' || label === 'lookup date' || label === 'data date' || label === 'as of') {
                    const dateVal = row[ci + 1];
                    if (dateVal) lookupDate = parseExcelDate(dateVal);
                  }
                }
              }
              if (row.some(cell => typeof cell === 'string' && (cell.trim() === 'Ticker' || cell.trim() === 'Company Name'))) {
                  headerRowIndex = i;
                  break;
              }
            }
            if (headerRowIndex !== -1) {
                const headers = jsonData[headerRowIndex].map(h => String(h).trim());
                const columnMap: Record<number, keyof StockData> = {};
                const knownLookupHeaders = new Set(Object.keys(EXCEL_HEADER_MAP).map(k => k.toLowerCase()));
                headers.forEach((h, index) => {
                    const matched = Object.entries(EXCEL_HEADER_MAP).find(([k]) => h.toLowerCase() === k.toLowerCase());
                    if (matched) { columnMap[index] = matched[1]; }
                    else if (h && !knownLookupHeaders.has(h.toLowerCase())) {
                        warnings.push(`Lookup sheet: unrecognized column "${h}"`);
                    }
                });
                for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    const stock: Partial<StockData> = {};
                    Object.entries(columnMap).forEach(([colIndex, key]) => {
                      const val = row[parseInt(colIndex)];
                      if (key === 'isChinese') {
                          let vStr = typeof val === 'boolean' ? (val ? 'y' : 'n') : String(val).toLowerCase();
                          (stock as any)[key] = ['yes', 'y', 'true', '是'].includes(vStr) ? 'Y' : 'N';
                      } else if (NUMERIC_KEYS.includes(key)) {
                          (stock as any)[key] = parseNumeric(val, TWO_DECIMAL_KEYS.includes(key) ? 2 : undefined);
                      } else {
                          (stock as any)[key] = val !== undefined ? String(val) : '';
                      }
                    });
                    if (stock.ticker) stocks.push(stock as StockData);
                }
            }
        }

        // --- PARSE DIVIDENDS SHEET ---
        const dividendSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'dividends');
        let dividends: DividendData[] = [];
        if (dividendSheetName) {
          const sheet = workbook.Sheets[dividendSheetName];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          dividends = rows.filter(r => r['Date'] || r['Symbol']).map(r => ({
            id: generateId(),
            date: parseExcelDate(r['Date']),
            symbol: String(r['Symbol'] || ''),
            name: String(r['Name'] || ''),
            market: String(r['Market'] || ''),
            grossAmount: parseNumeric(r['Gross Amount']),
            withholdingTax: parseNumeric(r['Withholding Tax']),
            netAmount: parseNumeric(r['Net Amount']),
            currency: String(r['Currency'] || 'USD'),
            source: String(r['Source'] || ''),
            type: String(r['Type'] || ''),
          }));
        }

        // --- PARSE INTEREST SHEET ---
        const interestSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'interest');
        let interest: InterestData[] = [];
        if (interestSheetName) {
          const sheet = workbook.Sheets[interestSheetName];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          interest = rows.filter(r => r['Date'] || r['Description']).map(r => ({
            id: generateId(),
            date: parseExcelDate(r['Date']),
            description: String(r['Description'] || ''),
            amount: parseNumeric(r['Amount']),
            currency: String(r['Currency'] || 'USD'),
            source: String(r['Source'] || ''),
            type: String(r['Type'] || ''),
          }));
        }

        // --- PARSE CASH LEDGER SHEET ---
        const cashLedgerSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'cash ledger');
        let cashLedger: CashLedgerEntry[] = [];
        if (cashLedgerSheetName) {
          const sheet = workbook.Sheets[cashLedgerSheetName];
          const rows = XLSX.utils.sheet_to_json(sheet) as any[];
          cashLedger = rows.filter(r => r['Date'] || r['Type']).map(r => ({
            id: generateId(),
            date: parseExcelDate(r['Date']),
            type: String(r['Type'] || ''),
            description: String(r['Description'] || ''),
            amount: parseNumeric(r['Amount']),
            currency: String(r['Currency'] || 'USD'),
            source: String(r['Source'] || ''),
          }));
        }

        // --- PARSE TRANSACTION SHEET (STOCKS) ---
        const transactionSheetName = workbook.SheetNames.find(name => 
            name.trim().toLowerCase() === 'transaction' || 
            name.trim().toLowerCase() === 'transactions'
        );
        let transactions: TransactionData[] = [];
        if (transactionSheetName) {
            const sheet = workbook.Sheets[transactionSheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            let headerRowIndex = -1;
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row.some(cell => typeof cell === 'string' && (cell.trim() === 'Stock' || cell.trim() === 'Action'))) {
                    headerRowIndex = i;
                    break;
                }
            }
            if (headerRowIndex !== -1) {
                const headers = jsonData[headerRowIndex].map(h => String(h).trim());
                const columnMap: Record<number, keyof TransactionData> = {};
                headers.forEach((h, index) => {
                    const matched = Object.entries(TRANSACTION_HEADER_MAP).find(([k]) => h.toLowerCase() === k.toLowerCase());
                    if (matched) { columnMap[index] = matched[1] as keyof TransactionData; }
                    else if (h) { warnings.push(`Transaction sheet: unrecognized column "${h}"`); }
                });
                for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    const txn: Partial<TransactionData> = {};
                    Object.entries(columnMap).forEach(([colIndex, key]) => {
                        const val = row[parseInt(colIndex)];
                        if (key === 'date' || key === 'expiration') txn[key] = parseExcelDate(val);
                        else if (TRANSACTION_NUMERIC_KEYS.includes(key)) (txn as any)[key] = parseNumeric(val);
                        else (txn as any)[key] = val !== undefined ? String(val) : '';
                    });
                    txn.id = generateId();
                    if (txn.stock) {
                      // Normalise HK tickers to 4 digits
                      txn.stock = padHkTicker(txn.stock, txn.market || '');
                      transactions.push(txn as TransactionData);
                    }
                }
            }
            transactions.sort((a, b) => (a.stock || '').localeCompare(b.stock || '') || (a.date || '').localeCompare(b.date || ''));
        }

        // Extract Options from Main Transactions (if any)
        const extractedOptions: TransactionData[] = [];
        const filteredTransactions: TransactionData[] = [];
        transactions.forEach(t => {
            if (t.option && (t.option.toLowerCase().includes('call') || t.option.toLowerCase().includes('put'))) {
                extractedOptions.push(t);
            } else {
                filteredTransactions.push(t);
            }
        });
        transactions = filteredTransactions;

        // --- PARSE OPTION TRANSACTION SHEET ---
        const optionSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'transactions_option');
        let optionTransactions: TransactionData[] = [...extractedOptions];
        if (optionSheetName) {
            const sheet = workbook.Sheets[optionSheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            let headerRowIndex = -1;
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row.some(cell => typeof cell === 'string' && (cell.trim() === 'Stock' || cell.trim() === 'Option'))) {
                    headerRowIndex = i;
                    break;
                }
            }
            if (headerRowIndex !== -1) {
                const headers = jsonData[headerRowIndex].map(h => String(h).trim());
                const columnMap: Record<number, keyof TransactionData> = {};
                headers.forEach((h, index) => {
                    for (const [excelHeader, key] of Object.entries(OPTION_HEADER_MAP)) {
                        if (h.toLowerCase() === excelHeader.toLowerCase()) {
                            columnMap[index] = key;
                            break;
                        }
                    }
                });
                for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    const txn: Partial<TransactionData> = {};
                    Object.entries(columnMap).forEach(([colIndex, key]) => {
                        const val = row[parseInt(colIndex)];
                        if (key === 'date' || key === 'expiration') txn[key] = parseExcelDate(val);
                        else if (TRANSACTION_NUMERIC_KEYS.includes(key)) (txn as any)[key] = parseNumeric(val);
                        else (txn as any)[key] = val !== undefined ? String(val) : '';
                    });
                    txn.id = generateId();
                    if (txn.stock) optionTransactions.push(txn as TransactionData);
                }
            }
            optionTransactions.sort((a, b) => (a.stock || '').localeCompare(b.stock || '') || (a.date || '').localeCompare(b.date || ''));
        }

        // --- PARSE EXPORTED P&L SHEETS ---
        const stockPnlSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'stock realized p&l');
        const optionPnlSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === 'option realized p&l');
        
        let pnlData: PnLData[] = [];

        if (stockPnlSheetName || optionPnlSheetName) {
             const parseExportedPnl = (sheetName: string) => {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet) as any[];
                return jsonData.map(row => ({
                    id: row.id || generateId(),
                    tradeNumber: parseNumeric(row['No.']),
                    stock: row['Stock'] || '',
                    name: row['Name'] || '',
                    market: row['Market'] || '',
                    account: row['Account'] || '',
                    option: row['Option'] || '',
                    quantity: parseNumeric(row['Shares']),
                    buyDate: parseExcelDate(row['Buy Date']),
                    buyPrice: parseNumeric(row['Buy Price']),
                    buyComm: parseNumeric(row['Buy Comm']),
                    totalBuy: parseNumeric(row['Total Cost']),
                    sellDate: parseExcelDate(row['Sell Date']),
                    sellPrice: parseNumeric(row['Sell Price']),
                    sellComm: parseNumeric(row['Sell Comm']),
                    totalSell: parseNumeric(row['Total Sales']),
                    realizedPnL: parseNumeric(row['Realized P&L']),
                    returnPercent: parseNumeric(row['Return %']),
                    holdingDays: parseNumeric(row['Holding Days']),
                    year: parseNumeric(row['Year']),
                    month: parseNumeric(row['Month']),
                    expiration: row['Expiration'] ? parseExcelDate(row['Expiration']) : undefined,
                    strike: row['Strike'] ? parseNumeric(row['Strike']) : undefined,
                    // 'Action' column maps to optionAction (global export uses 'Action' header; direct export uses 'optionAction')
                    optionAction: row['Action'] || row['optionAction'] || undefined,
                    // Explicitly ignore target columns from Excel to force recalculation in app
                    tgtProfitCost: undefined,
                    tgtProfitSales: undefined,
                    tgtLossCost: undefined,
                    tgtLossSales: undefined
                } as PnLData));
            };

            if (stockPnlSheetName) pnlData.push(...parseExportedPnl(stockPnlSheetName));
            if (optionPnlSheetName) pnlData.push(...parseExportedPnl(optionPnlSheetName));
        }

        // --- PARSE P&L SHEET (Legacy/Manual Format) ---
        if (pnlData.length === 0) {
            const pnlSheetName = workbook.SheetNames.find(name => ['p&l', 'pnl', 'realized p&l', 'realized p&l records'].includes(name.trim().toLowerCase()));
            if (pnlSheetName) {
                const sheet = workbook.Sheets[pnlSheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                let headerRowIndex = -1;
                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (row.some(cell => typeof cell === 'string' && (cell.trim() === 'No.' || (cell.trim() === 'Stock' && row.includes('P&L'))))) {
                        headerRowIndex = i;
                        break;
                    }
                }
                if (headerRowIndex !== -1) {
                    const headers = jsonData[headerRowIndex].map(h => String(h).trim());
                    const columnMap: Record<number, string> = {};
                    headers.forEach((h, index) => {
                        for (const [excelHeader, key] of Object.entries(PNL_HEADER_MAP)) {
                            if (h.toLowerCase() === excelHeader.toLowerCase()) { columnMap[index] = key; break; }
                        }
                    });
                    const tradeGroups = new Map<number, any[]>();
                    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length === 0) continue;
                        const rowData: any = {};
                        let hasNo = false;
                        Object.entries(columnMap).forEach(([colIndex, key]) => {
                            const val = row[parseInt(colIndex)];
                            if (key === 'tradeNumber') { if (val !== undefined) hasNo = true; rowData[key] = val; }
                            else if (key === 'date' || key === 'expiration') rowData[key] = parseExcelDate(val);
                            else if (['price', 'shares', 'commission', 'buyPrice', 'sellPrice', 'buyComm', 'sellComm', 'strike'].includes(key)) rowData[key] = parseNumeric(val);
                            else rowData[key] = val !== undefined ? String(val) : '';
                        });
                        if (rowData.buyPrice === undefined) rowData.buyPrice = rowData.price;
                        if (rowData.sellPrice === undefined) rowData.sellPrice = rowData.price;
                        if (rowData.buyComm === undefined) rowData.buyComm = rowData.commission;
                        if (rowData.sellComm === undefined) rowData.sellComm = rowData.commission;
                        if (hasNo && rowData.tradeNumber) {
                            const tradeNo = rowData.tradeNumber;
                            if (!tradeGroups.has(tradeNo)) tradeGroups.set(tradeNo, []);
                            tradeGroups.get(tradeNo)?.push(rowData);
                        }
                    }
                    tradeGroups.forEach((rows, no) => {
                        if (rows.length !== 2) return;
                        const buyRow = rows.find(r => r.action?.toLowerCase().includes('buy'));
                        const sellRow = rows.find(r => r.action?.toLowerCase().includes('sell'));
                        if (buyRow && sellRow) {
                            const qty = Math.abs(buyRow.shares);
                            const bPrice = buyRow.buyPrice || buyRow.price;
                            const sPrice = sellRow.sellPrice || sellRow.price;
                            const bComm = buyRow.buyComm || buyRow.commission || 0;
                            const sComm = sellRow.sellComm || sellRow.commission || 0;
                            const totalBuy = -(bPrice * qty) - bComm;
                            const totalSell = (sPrice * qty) - sComm;
                            const realizedPnL = totalBuy + totalSell;
                            const returnPercent = totalBuy !== 0 ? (realizedPnL / Math.abs(totalBuy)) * 100 : 0;
                            const sellDate = new Date(sellRow.date);
                            const diffTime = Math.abs(sellDate.getTime() - new Date(buyRow.date).getTime());
                            pnlData.push({
                                id: generateId(), tradeNumber: no, stock: buyRow.stock, name: buyRow.name, market: buyRow.market, account: buyRow.account, option: buyRow.option, quantity: qty,
                                buyDate: buyRow.date, buyPrice: bPrice, buyComm: bComm, totalBuy, sellDate: sellRow.date, sellPrice: sPrice, sellComm: sComm, totalSell, realizedPnL, returnPercent,
                                year: sellDate.getFullYear(), month: sellDate.getMonth() + 1, holdingDays: Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
                                strike: buyRow.strike, expiration: buyRow.expiration,
                                tgtProfitCost: undefined, tgtProfitSales: undefined, tgtLossCost: undefined, tgtLossSales: undefined
                            });
                        }
                    });
                    pnlData.sort((a, b) => (a.tradeNumber || 0) - (b.tradeNumber || 0));
                }
            }
        }
        
        // --- PARSE NAV-DAILY SHEET ---
        let navSheetName = workbook.SheetNames.find(name => {
            const n = name.trim().toLowerCase();
            return n === 'nav-daily' || n === 'daily nav' || n === 'nav' || n === 'daily';
        });

        // Fallback: Check if any sheet has NAV headers if not found by name
        if (!navSheetName) {
             for (const name of workbook.SheetNames) {
                 const sheet = workbook.Sheets[name];
                 const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                 // Check first 10 rows for NAV headers
                 for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
                     const row = jsonData[i];
                     if (row && row.some(cell => typeof cell === 'string' && (cell.trim() === 'AUM' || cell.trim() === 'NAV1'))) {
                         navSheetName = name;
                         break;
                     }
                 }
                 if (navSheetName) break;
             }
        }

        let navData: NavData[] = [];
        if (navSheetName) {
            const sheet = workbook.Sheets[navSheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            let headerRowIndex = -1;
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (row.some(cell => typeof cell === 'string' && (cell.trim() === 'Date' || cell.trim() === 'AUM'))) {
                    headerRowIndex = i;
                    break;
                }
            }
            if (headerRowIndex !== -1) {
                const headers = jsonData[headerRowIndex].map(h => String(h).trim());
                const columnMap: Record<number, keyof NavData> = {};
                headers.forEach((h, index) => {
                    for (const [excelHeader, key] of Object.entries(NAV_HEADER_MAP)) {
                        if (h.toLowerCase() === excelHeader.toLowerCase()) {
                            columnMap[index] = key;
                            break;
                        }
                    }
                });
                for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;
                    const nav: Partial<NavData> = {};
                    Object.entries(columnMap).forEach(([colIndex, key]) => {
                        const val = row[parseInt(colIndex)];
                        if (key === 'date') nav[key] = parseExcelDate(val);
                        else if (NAV_NUMERIC_KEYS.includes(key)) (nav as any)[key] = parseNumeric(val);
                    });
                    nav.id = generateId();
                    if (nav.date) navData.push(nav as NavData);
                }
                navData.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            }
        }
        
        // Normalise HK tickers to 4 digits across all parsed data
        pnlData.forEach(p => { p.stock = padHkTicker(p.stock, p.market || ''); });
        optionTransactions.forEach(t => { t.stock = padHkTicker(t.stock, t.market || ''); });
        stocks.forEach(s => { s.ticker = padHkTicker(s.ticker, s.market || ''); });

        // --- PARSE BENCHMARK INDICES SHEET (optional) ---
        let benchmarkResult: BenchmarkData = [];
        const benchmarkSheetName = workbook.SheetNames.find(n => {
          const l = n.trim().toLowerCase();
          return l === 'benchmark' || l === 'benchmark indices' || l === 'benchmark indicies' || l.startsWith('benchmark');
        });
        if (benchmarkSheetName) {
          const bSheet = workbook.Sheets[benchmarkSheetName];
          const bRaw = XLSX.utils.sheet_to_json(bSheet, { header: 1, raw: true }) as any[][];
          let bHeaderIdx = -1;
          for (let i = 0; i < Math.min(bRaw.length, 10); i++) {
            if (String(bRaw[i][0] || '').trim().toLowerCase() === 'date') { bHeaderIdx = i; break; }
          }
          if (bHeaderIdx !== -1) {
            const bHeaders = bRaw[bHeaderIdx].map((h: any) => String(h || '').trim());
            const bIndexCols = bHeaders.slice(1).filter((h: string) => h);
            for (let i = bHeaderIdx + 1; i < bRaw.length; i++) {
              const row = bRaw[i];
              if (!row || !row[0]) continue;
              const dv = row[0];
              let ds = '';
              if (dv instanceof Date) ds = dv.toISOString().split('T')[0];
              else if (typeof dv === 'number') { const d = new Date(Math.round((dv - 25569) * 86400 * 1000)); ds = d.toISOString().split('T')[0]; }
              else ds = String(dv).trim();
              if (!ds) continue;
              const pt: any = { date: ds };
              bIndexCols.forEach((col: string, ci: number) => { pt[col] = parseNumeric(row[ci + 1]); });
              benchmarkResult.push(pt);
            }
            benchmarkResult.sort((a, b) => a.date.localeCompare(b.date));
          }
        }

        resolve({ lookup: { stocks, lastUpdated: new Date(), lookupDate }, transactions, optionTransactions, pnl: pnlData, navData, dividends, interest, cashLedger, benchmark: benchmarkResult, warnings });
      } catch (error) { reject(error); }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export const exportToExcel = (stocks: StockData[], fileName: string = 'LookupData.xlsx') => {
  const worksheet = XLSX.utils.json_to_sheet(stocks);
  formatWorksheet(worksheet, stocks);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Lookup");
  XLSX.writeFile(workbook, fileName);
};

export const exportTransactionsToExcel = (transactions: TransactionData[], optionTransactions: TransactionData[], fileName: string = 'Transactions.xlsx') => {
  const workbook = XLSX.utils.book_new();

  // Stock Transactions
  const worksheet = XLSX.utils.json_to_sheet(transactions);
  formatWorksheet(worksheet, transactions);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transaction");

  // Option Transactions
  if (optionTransactions && optionTransactions.length > 0) {
      const optWorksheet = XLSX.utils.json_to_sheet(optionTransactions);
      formatWorksheet(optWorksheet, optionTransactions);
      XLSX.utils.book_append_sheet(workbook, optWorksheet, "Transactions_Option");
  }

  XLSX.writeFile(workbook, fileName);
};

export const exportPnLToExcel = (pnlData: PnLData[], marketConstants?: MarketConstants, fileName: string = 'RealizedPnL.xlsx') => {
    const stockPnl = pnlData.filter(r => !r.option || !['Call', 'Put'].includes(r.option));
    const optionPnl = pnlData.filter(r => r.option && ['Call', 'Put'].includes(r.option));

    const workbook = XLSX.utils.book_new();

    const processPnl = (data: PnLData[]) => data.map(p => {
        const rate = marketConstants ? getMarketRate(p.market || '', p.stock, marketConstants) : 1;
        return { ...p, realizedPnLUsd: p.realizedPnL / rate };
    });

    if (stockPnl.length > 0) {
        const wsStock = XLSX.utils.json_to_sheet(processPnl(stockPnl));
        formatWorksheet(wsStock, stockPnl);
        XLSX.utils.book_append_sheet(workbook, wsStock, "Stock Realized P&L");
    }

    if (optionPnl.length > 0) {
        const wsOption = XLSX.utils.json_to_sheet(processPnl(optionPnl));
        formatWorksheet(wsOption, optionPnl);
        XLSX.utils.book_append_sheet(workbook, wsOption, "Option Realized P&L");
    }

    XLSX.writeFile(workbook, fileName);
};

export const exportNavData = (navData: NavData[], fileName: string = 'NAV_Export.xlsx') => {
    const navExportMap: Record<string, string> = {
        date: 'Date',
        aum: 'AUM',
        nav1: 'NAV (Original)',
        cumulativeReturn: 'Cumulative Return (Original)',
        shares: 'Shares (Original)',
        cashFlow: 'Cash Flow',
        adjNav: 'Adj NAV',
        adjShares: 'Adj Shares',
        adjCumulativeReturn: 'Adj Cumulative Return',
    };
    const mapped = mapToExport(navData, navExportMap);
    const ws = XLSX.utils.json_to_sheet(mapped);
    formatWorksheet(ws, mapped);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, 'NAV');
    XLSX.writeFile(workbook, fileName);
};

export const calculatePortfolioAnalysis = (
    pnlData: PnLData[], 
    transactions: TransactionData[], 
    lookupData: LookupSheetData | null, 
    marketConstants: MarketConstants, 
    cashPosition: number,
    optionPosition: number = 0
) => {
    const getRate = (market: string, ticker?: string) => getMarketRate(market, ticker, marketConstants);

    let totalPnlUsd = 0;
    const stockRealizedPnlLocalMap = new Map<string, number>();

    pnlData.forEach(p => {
      const rate = getRate(p.market || '', p.stock);
      totalPnlUsd += (p.realizedPnL / rate);
      const ticker = (p.stock || '').toUpperCase().trim();
      if (ticker) stockRealizedPnlLocalMap.set(ticker, (stockRealizedPnlLocalMap.get(ticker) || 0) + p.realizedPnL);
    });

    const stockHoldingMap = new Map<string, { shares: number, totalCostLocal: number, market: string, name: string, totalCashFlowLocal: number }>();
    const sortedTxns = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    sortedTxns.forEach(t => {
      const ticker = (t.stock || '').toUpperCase().trim();
      if (!ticker) return;
      const current = stockHoldingMap.get(ticker) || { shares: 0, totalCostLocal: 0, market: t.market || 'US', name: t.name || '', totalCashFlowLocal: 0 };
      const action = (t.action || '').toLowerCase();
      const price = t.price || 0;
      const shares = Math.abs(t.shares || 0);
      const comm = t.commission || 0;
      
      // Calculate Net Cash Flow (Sum of 'Total') for Current Cost calculation
      current.totalCashFlowLocal += (t.total || 0);

      if (action.includes('buy')) {
        current.shares += shares;
        current.totalCostLocal += (price * shares) + comm;
      } else if (action.includes('sell')) {
        if (current.shares > 0) {
          const avgCost = current.totalCostLocal / current.shares;
          const sellQty = Math.min(shares, current.shares);
          current.shares -= sellQty;
          current.totalCostLocal -= avgCost * sellQty;
        }
      }
      if (Math.abs(current.shares) < 0.0001) { current.shares = 0; current.totalCostLocal = 0; }
      stockHoldingMap.set(ticker, current);
    });

    let totalHoldingsMvUsd = 0;
    const g2Data: any[] = []; 

    stockHoldingMap.forEach((data, ticker) => {
      if (data.shares <= 0.001) return;
      const lookup = lookupData?.stocks.find(s => s.ticker.toUpperCase().trim() === ticker);
      const market = (lookup?.market || data.market || 'US').toUpperCase().trim();
      const rate = getRate(market, ticker);
      const price = lookup?.closePrice || 0;
      
      const totalCostUsd = data.totalCostLocal / rate;
      const avgCostDisplay = (market === 'HK') ? (data.totalCostLocal / data.shares) : (data.totalCostLocal / data.shares / rate);
      const lastPriceDisplay = (market === 'HK') ? price : (rate !== 0 ? price / rate : 0);
      
      const mvLocal = price * data.shares;
      const mvUsd = rate !== 0 ? mvLocal / rate : 0;
      
      const pnl = mvUsd - totalCostUsd;
      const pnlPct = totalCostUsd !== 0 ? (pnl / totalCostUsd) : 0;
      
      const isCCS = lookup?.isChinese === 'Y';
      
      totalHoldingsMvUsd += mvUsd;

      g2Data.push({
        Stock: ticker,
        Shares: data.shares,
        AvgCost: avgCostDisplay, // Display currency
        TotalCost: totalCostUsd, // USD
        LastPrice: lastPriceDisplay, // Display currency
        LastMV: mvUsd, // USD
        PnL: pnl, // USD
        PnLPct: pnlPct,
        Market: market,
        isCCS: isCCS
      });
    });
    
    // Include Option Position in Grand Total
    const grandTotalPortfolioUsd = totalHoldingsMvUsd + cashPosition + optionPosition;

    // Add MVPct
    const g2Final = g2Data.map(d => ({
        ...d,
        MVPct: grandTotalPortfolioUsd > 0 ? (d.LastMV / grandTotalPortfolioUsd) : 0
    })).sort((a, b) => b.LastMV - a.LastMV);

    const g2Hk = g2Final.filter(d => d.Market === 'HK').map(({isCCS, Market, ...rest}) => rest);
    const g2Ccs = g2Final.filter(d => d.isCCS && d.Market !== 'HK').map(({isCCS, Market, ...rest}) => rest);
    // Keep Market field in g2Us so export can split by US vs AUS
    const g2Us = g2Final.filter(d => !d.isCCS && d.Market !== 'HK').map(({isCCS, ...rest}) => rest);
    
    // Detailed Holdings (Fundamental)
    const detailedHoldings = g2Final.map(h => {
        const l = lookupData?.stocks.find(s => s.ticker.toUpperCase() === h.Stock.toUpperCase());
        return {
            Date: marketConstants.date,
            Stock: h.Stock,
            Type: l?.type || '-',
            Category: l?.category || '-',
            Class: l?.class || '-',
            'PE TTM': l?.peTTM || 0,
            'PB': l?.pb || 0,
            'Div Yield': l?.dividendYield || 0,
            'ROE': l?.roeTTM || 0,
            'PS': l?.psQuantile || 0,
            'Shares': h.Shares,
            'Holdings (USD)': h.LastMV,
            'Holdings %': h.MVPct,
            'P&L (USD)': h.PnL,
            'P&L %': h.PnLPct,
            // Internal for calculation
            _pe: l?.peTTM || 0,
            _roe: l?.roeTTM || 0,
            _pb: l?.pb || 0,
            _div: l?.dividendYield || 0,
            _ps: l?.psQuantile || 0
        };
    }).sort((a, b) => {
         const cleanA = String(a.Stock).replace(/^0+/, '');
         const cleanB = String(b.Stock).replace(/^0+/, '');
         return cleanA.localeCompare(cleanB);
    });

    // Weighted Averages (Global)
    const totalMvForAvg = detailedHoldings.reduce((sum, h) => sum + h['Holdings (USD)'], 0);
    
    // Weighted PE (Positive only)
    const positivePe = detailedHoldings.filter(h => h._pe > 0);
    const totalMvPe = positivePe.reduce((sum, h) => sum + h['Holdings (USD)'], 0);
    const weightedPe = totalMvPe > 0 ? positivePe.reduce((sum, h) => sum + (h._pe * h['Holdings (USD)']), 0) / totalMvPe : 0;

    // Weighted ROE (Positive only)
    const positiveRoe = detailedHoldings.filter(h => h._roe > 0);
    const totalMvRoe = positiveRoe.reduce((sum, h) => sum + h['Holdings (USD)'], 0);
    const weightedRoe = totalMvRoe > 0 ? positiveRoe.reduce((sum, h) => sum + (h._roe * h['Holdings (USD)']), 0) / totalMvRoe : 0;

    const weightedAvgs = {
        date: marketConstants.date,
        pe: weightedPe,
        pb: totalMvForAvg ? detailedHoldings.reduce((sum, h) => sum + (h._pb * h['Holdings (USD)']), 0) / totalMvForAvg : 0,
        div: totalMvForAvg ? detailedHoldings.reduce((sum, h) => sum + (h._div * h['Holdings (USD)']), 0) / totalMvForAvg : 0,
        roe: weightedRoe,
        ps: totalMvForAvg ? detailedHoldings.reduce((sum, h) => sum + (h._ps * h['Holdings (USD)']), 0) / totalMvForAvg : 0,
        holdingsUsd: totalMvForAvg,
        holdingsPct: grandTotalPortfolioUsd ? (totalMvForAvg / grandTotalPortfolioUsd) : 0,
        count: detailedHoldings.length
    };

    // Clean up internal fields for export
    const detailedHoldingsExport = detailedHoldings.map(({_pe, _roe, _pb, _div, _ps, ...rest}) => rest);

    const generateG1Row = (ticker: string) => {
      const holding = stockHoldingMap.get(ticker) || { shares: 0, totalCostLocal: 0, market: 'US', name: '', totalCashFlowLocal: 0 };
      const lookup = lookupData?.stocks.find(s => s.ticker.toUpperCase().trim() === ticker);
      const market = (lookup?.market || holding.market || 'US').toUpperCase().trim();
      const isHk = market === 'HK';
      const rateToUsd = getRate(market, ticker);
      const displayRate = isHk ? 1 : rateToUsd;
      
      const pos = holding.shares;
      
      // Local Values
      const netCashFlowLocal = holding.totalCashFlowLocal;
      const currentCostLocal = Math.abs(netCashFlowLocal);
      const realizedPnlLocal = stockRealizedPnlLocalMap.get(ticker) || 0;
      const priceLocal = lookup?.closePrice || 0;
      const lastMvLocal = priceLocal * pos;

      // USD Values (For P&L, MV, Unrealized columns)
      const currentCostUsd = rateToUsd !== 0 ? currentCostLocal / rateToUsd : 0;
      const realizedPnlUsd = rateToUsd !== 0 ? realizedPnlLocal / rateToUsd : 0;
      const lastMvUsd = rateToUsd !== 0 ? lastMvLocal / rateToUsd : 0;
      const unrealizedPnlUsd = lastMvUsd - currentCostUsd;

      // Display Values (For Price / Avg Cost columns)
      const currentCostDisp = displayRate !== 0 ? holding.totalCostLocal / displayRate : 0; // Keeping as Avg Cost for price columns
      const realizedPnlDisp = displayRate !== 0 ? realizedPnlLocal / displayRate : 0;
      
      // RTN% Calculation (USD Basis)
      const unrealizedPct = currentCostUsd !== 0 ? (unrealizedPnlUsd / currentCostUsd) : 0;

      return {
        Stock: ticker,
        Name: lookup?.companyName || holding.name || ticker,
        Market: market,
        Position: pos,
        
        // Requested Columns in USD
        CurrentCost: currentCostUsd, 
        RealizedPnL: realizedPnlUsd,
        UnrealizedPnL: unrealizedPnlUsd,
        LastMV: lastMvUsd,
        
        // RTN% based on USD Net Cash Flow
        UnrealizedPct: unrealizedPct,
        
        // Prices in Local (HKD) or USD (for US)
        AvgPrice: pos > 0 ? currentCostDisp / pos : 0,
        ActualPrice: pos > 0 ? (currentCostDisp - realizedPnlDisp) / pos : 0,
        LastPrice: displayRate !== 0 ? priceLocal / displayRate : 0,
        
        MarketCapYi: (lookup?.marketCap || 0) / 100000000,
        
        // MV% based on Total Portfolio
        MV_Pct: grandTotalPortfolioUsd > 0 ? (lastMvUsd / grandTotalPortfolioUsd) : 0,
        
        IsZero: pos <= 0.001
      };
    };

    const allTickers = Array.from(new Set([...stockHoldingMap.keys(), ...stockRealizedPnlLocalMap.keys()]));
    
    const sortG1 = (list: any[]) => {
        return list.sort((a, b) => {
            // 1. Positive Position (IsZero === false) first
            if (a.IsZero !== b.IsZero) {
                return a.IsZero ? 1 : -1; // If a is zero, put it after b (active)
            }
            // 2. Stock Ticker - Sort by first non-zero char (strip leading zeros)
            const cleanA = String(a.Stock).replace(/^0+/, '');
            const cleanB = String(b.Stock).replace(/^0+/, '');
            return cleanA.localeCompare(cleanB);
        });
    };

    const g1Hk = sortG1(allTickers.filter(t => (lookupData?.stocks.find(s => s.ticker.toUpperCase() === t)?.market || 'US').toUpperCase() === 'HK').map(generateG1Row));
    const g1NonHk = sortG1(allTickers.filter(t => (lookupData?.stocks.find(s => s.ticker.toUpperCase() === t)?.market || 'US').toUpperCase() !== 'HK').map(generateG1Row));

    return { totalPnlUsd, grandTotalPortfolioUsd, g1Hk, g1NonHk, g2Hk, g2Ccs, g2Us, detailedHoldingsExport, weightedAvgs };
};

export const exportGlobalData = (
    transactions: TransactionData[],
    pnlData: PnLData[],
    lookupData: LookupSheetData | null,
    marketConstants: MarketConstants,
    cashPosition: number,
    optionPosition: number,
    holdingsHk: any[],
    holdingsCcs: any[],
    holdingsUs: any[],
    historyHk: any[],
    historyNonHk: any[],
    detailedHoldings: any[],
    weightedAvgs: any,
    navData: NavData[],
    optionTransactions: TransactionData[] = [],
    dividends: DividendData[] = [],
    interest: InterestData[] = [],
    cashLedger: CashLedgerEntry[] = [],
    fileName: string = 'TradeTracker_Pro_Export.xlsx',
    benchmarkData: BenchmarkData = []
) => {
    const workbook = XLSX.utils.book_new();

    // 0. PORTFOLIO SUMMARY
    const totalHk = holdingsHk.reduce((acc, r) => acc + (r.LastMV || 0), 0);
    const totalCcs = holdingsCcs.reduce((acc, r) => acc + (r.LastMV || 0), 0);
    const totalUs = holdingsUs.reduce((acc, r) => acc + (r.LastMV || 0), 0);
    const totalPortfolio = totalHk + totalCcs + totalUs + cashPosition + optionPosition;
    
    // Calculate Summary Statistics
    let totalWinUsd = 0;
    let totalLossUsd = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalRealizedPnlUsd = 0;

    // Helper to rate convert PnL for stats
    const processPnlForStats = (data: PnLData[]) => {
        data.forEach(p => {
            const rate = getMarketRate(p.market || '', p.stock, marketConstants);
            const pnlUsd = p.realizedPnL / rate;
            totalRealizedPnlUsd += pnlUsd;

            if (pnlUsd > 0) {
                totalWinUsd += pnlUsd;
                winCount++;
            } else if (pnlUsd < 0) {
                totalLossUsd += pnlUsd;
                lossCount++;
            }
        });
    };
    processPnlForStats(pnlData);

    const totalTrades = winCount + lossCount;
    const winRate = totalTrades > 0 ? (winCount / totalTrades) : 0;
    const avgPnl = totalTrades > 0 ? totalRealizedPnlUsd / totalTrades : 0;
    const avgWin = winCount > 0 ? totalWinUsd / winCount : 0;
    const avgLoss = lossCount > 0 ? totalLossUsd / lossCount : 0;
    const profitFactor = Math.abs(totalLossUsd) > 0 ? totalWinUsd / Math.abs(totalLossUsd) : (totalWinUsd > 0 ? 'Infinity' : 0);

    const overviewData = [
        { Category: 'PORTFOLIO ALLOCATION', Value: '', Percentage: '' },
        { Category: 'CCS Stocks', Value: totalCcs, Percentage: totalPortfolio ? totalCcs/totalPortfolio : 0 },
        { Category: 'US & Global', Value: totalUs, Percentage: totalPortfolio ? totalUs/totalPortfolio : 0 },
        { Category: 'HK Stocks', Value: totalHk, Percentage: totalPortfolio ? totalHk/totalPortfolio : 0 },
        { Category: 'Options Value', Value: optionPosition, Percentage: totalPortfolio ? optionPosition/totalPortfolio : 0 },
        { Category: 'Cash Position', Value: cashPosition, Percentage: totalPortfolio ? cashPosition/totalPortfolio : 0 },
        { Category: 'Total Portfolio', Value: totalPortfolio, Percentage: 1 },
        { Category: '', Value: '', Percentage: '' }, // Spacer
        { Category: 'PERFORMANCE STATISTICS', Value: '', Percentage: '' },
        { Category: 'Net Realized P&L (USD)', Value: totalRealizedPnlUsd, Percentage: '' },
        { Category: 'Total Win (USD)', Value: totalWinUsd, Percentage: '' },
        { Category: 'Total Loss (USD)', Value: totalLossUsd, Percentage: '' },
        { Category: 'Win Rate', Value: winRate, Percentage: '' }, // Will be formatted as % by formatWorksheet if key matches
        { Category: 'Profit Factor', Value: profitFactor, Percentage: '' },
        { Category: 'Avg P&L (USD)', Value: avgPnl, Percentage: '' },
        { Category: 'Avg Win (USD)', Value: avgWin, Percentage: '' },
        { Category: 'Avg Loss (USD)', Value: avgLoss, Percentage: '' },
        { Category: 'Total Trades', Value: totalTrades, Percentage: '' },
        { Category: 'Winning Trades', Value: winCount, Percentage: '' },
        { Category: 'Losing Trades', Value: lossCount, Percentage: '' },
        { Category: '', Value: '', Percentage: '' }, // Spacer
        { Category: 'HOLDINGS WEIGHTED AVERAGES', Value: '', Percentage: '' },
        { Category: 'Weighted PE', Value: weightedAvgs.pe, Percentage: '' },
        { Category: 'Weighted PB', Value: weightedAvgs.pb, Percentage: '' },
        { Category: 'Weighted Div Yield', Value: weightedAvgs.div, Percentage: '' },
        { Category: 'Weighted ROE', Value: weightedAvgs.roe, Percentage: '' },
        { Category: 'Weighted PS', Value: weightedAvgs.ps, Percentage: '' },
        { Category: 'Total Holdings (USD)', Value: weightedAvgs.holdingsUsd, Percentage: '' },
        { Category: 'Holdings % of Portfolio', Value: weightedAvgs.holdingsPct, Percentage: '' },
        { Category: 'Count', Value: weightedAvgs.count, Percentage: '' }
    ];
    const summaryWs = XLSX.utils.json_to_sheet(overviewData);
    
    // Custom formatting for the summary sheet to handle mixed types
    if (summaryWs['!ref']) {
        const range = XLSX.utils.decode_range(summaryWs['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            const catCell = summaryWs[XLSX.utils.encode_cell({r: R, c: 0})];
            const valCell = summaryWs[XLSX.utils.encode_cell({r: R, c: 1})];
            const pctCell = summaryWs[XLSX.utils.encode_cell({r: R, c: 2})];
            
            if (catCell && catCell.v) {
                const cat = String(catCell.v);
                
                // Bold Headers
                if (cat === 'PORTFOLIO ALLOCATION' || cat === 'PERFORMANCE STATISTICS' || cat === 'HOLDINGS WEIGHTED AVERAGES') {
                    // Note: xlsx-style or pro version needed for bold, standard xlsx doesn't support style. 
                    // We rely on structure.
                }

                // Format Value Column
                if (valCell && valCell.t === 'n') {
                    if (cat.includes('Win Rate')) {
                        valCell.z = '0.00%';
                    } else if (['Trades', 'Factor', 'Count', 'PE', 'PB', 'PS', 'ROE'].some(k => cat.includes(k))) {
                        valCell.z = '0.00';
                        if (cat.includes('Trades') || cat.includes('Count')) valCell.z = '0';
                    } else if (cat.includes('Div Yield')) {
                        valCell.z = '0.00%';
                    } else {
                        valCell.z = '#,##0.00'; // Currency
                    }
                }

                // Format Percentage Column
                if (pctCell && pctCell.t === 'n') {
                    pctCell.z = '0.00%';
                }
            }
        }
        // Auto-width
        summaryWs['!cols'] = [{wch: 30}, {wch: 20}, {wch: 15}];
    }

    XLSX.utils.book_append_sheet(workbook, summaryWs, "Portfolio Summary");

    // 1. INFO
    const metricsData = [
        { Metric: 'Report Date', Value: marketConstants.date },
        { Metric: 'HKD Exg Rate', Value: marketConstants.exg_rate },
        { Metric: 'AUD Exg Rate', Value: marketConstants.aud_exg },
        { Metric: 'SGD Exg Rate', Value: marketConstants.sg_exg }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metricsData), "Report Info");

    // 2. HOLDINGS
    if (holdingsHk.length > 0) {
        const ws = XLSX.utils.json_to_sheet(holdingsHk);
        formatWorksheet(ws, holdingsHk);
        XLSX.utils.book_append_sheet(workbook, ws, "Holdings HK (USD)");
    }

    if (holdingsCcs.length > 0) {
        const ws = XLSX.utils.json_to_sheet(holdingsCcs);
        formatWorksheet(ws, holdingsCcs);
        XLSX.utils.book_append_sheet(workbook, ws, "Holdings CCS (USD)");
    }

    if (holdingsUs.length > 0) {
        const holdingsUsOnly = holdingsUs.filter((h: any) => !isAusMarketTicker(h.Market || '', h.Stock)).map(({Market, ...rest}: any) => rest);
        const holdingsAus = holdingsUs.filter((h: any) => isAusMarketTicker(h.Market || '', h.Stock)).map(({Market, ...rest}: any) => rest);
        if (holdingsUsOnly.length > 0) {
            const ws = XLSX.utils.json_to_sheet(holdingsUsOnly);
            formatWorksheet(ws, holdingsUsOnly);
            XLSX.utils.book_append_sheet(workbook, ws, "Holdings US (USD)");
        }
        if (holdingsAus.length > 0) {
            const ws = XLSX.utils.json_to_sheet(holdingsAus);
            formatWorksheet(ws, holdingsAus);
            XLSX.utils.book_append_sheet(workbook, ws, "Holdings AUS (USD)");
        }
    }

    // 2.5 FUNDAMENTAL ANALYSIS
    if (detailedHoldings.length > 0) {
        const fundData = [...detailedHoldings];
        
        // Append Summary Row
        fundData.push({
            Date: '',
            Stock: 'WEIGHTED AVG / TOTAL',
            Type: '',
            Category: '',
            Class: '',
            'PE TTM': weightedAvgs.pe,
            'PB': weightedAvgs.pb,
            'Div Yield': weightedAvgs.div,
            'ROE': weightedAvgs.roe,
            'PS': weightedAvgs.ps,
            'Shares': '',
            'Holdings (USD)': weightedAvgs.holdingsUsd,
            'Holdings %': weightedAvgs.holdingsPct,
            'P&L (USD)': '',
            'P&L %': ''
        });

        const ws = XLSX.utils.json_to_sheet(fundData);
        formatWorksheet(ws, fundData);
        XLSX.utils.book_append_sheet(workbook, ws, "Holdings Fundamental Analysis");
    }

    // 3. LOOKUP
    if (lookupData && lookupData.stocks.length > 0) {
        const mappedStocks = mapToExport(lookupData.stocks, LOOKUP_EXPORT_MAP);
        const ws = XLSX.utils.json_to_sheet(mappedStocks);
        formatWorksheet(ws, mappedStocks);
        XLSX.utils.book_append_sheet(workbook, ws, "Lookup");
    }

    // 4. TRANSACTIONS
    const mappedTxns = mapToExport(transactions, TRANSACTION_EXPORT_MAP);
    const txnWs = XLSX.utils.json_to_sheet(mappedTxns);
    formatWorksheet(txnWs, mappedTxns);
    XLSX.utils.book_append_sheet(workbook, txnWs, "Transaction");

    // 4.1 OPTION TRANSACTIONS
    if (optionTransactions && optionTransactions.length > 0) {
        const mappedOptTxns = mapToExport(optionTransactions, OPTION_EXPORT_MAP);
        const optTxnWs = XLSX.utils.json_to_sheet(mappedOptTxns);
        formatWorksheet(optTxnWs, mappedOptTxns);
        XLSX.utils.book_append_sheet(workbook, optTxnWs, "Transactions_Option");
    }

    // 5. P&L (SPLIT)
    const stockPnl = pnlData.filter(r => !r.option || !['Call', 'Put'].includes(r.option));
    const optionPnl = pnlData.filter(r => r.option && ['Call', 'Put'].includes(r.option));

    // Helper to rate convert PnL for export
    const processPnl = (data: PnLData[]) => data.map(p => {
        const rate = getMarketRate(p.market || '', p.stock, marketConstants);
        return { ...p, realizedPnLUsd: p.realizedPnL / rate };
    });

    if (stockPnl.length > 0) {
        const processed = processPnl(stockPnl);
        const mapped = mapToExport(processed, PNL_EXPORT_MAP);
        const wsStock = XLSX.utils.json_to_sheet(mapped);
        formatWorksheet(wsStock, mapped);
        XLSX.utils.book_append_sheet(workbook, wsStock, "Stock Realized P&L");
    }

    if (optionPnl.length > 0) {
        const processed = processPnl(optionPnl);
        const mapped = mapToExport(processed, PNL_EXPORT_MAP);
        const wsOption = XLSX.utils.json_to_sheet(mapped);
        formatWorksheet(wsOption, mapped);
        XLSX.utils.book_append_sheet(workbook, wsOption, "Option Realized P&L");
    }


    // 7. HISTORY CLOSED POSITIONS
    if (historyHk.length > 0) {
        const ws = XLSX.utils.json_to_sheet(historyHk);
        formatWorksheet(ws, historyHk);
        XLSX.utils.book_append_sheet(workbook, ws, "History - Closed HK");
    }
    if (historyNonHk.length > 0) {
        const ws = XLSX.utils.json_to_sheet(historyNonHk);
        formatWorksheet(ws, historyNonHk);
        XLSX.utils.book_append_sheet(workbook, ws, "History - Closed Global");
    }

    // 8. NAV DAILY
    if (navData && navData.length > 0) {
        const mappedNav = mapToExport(navData, NAV_EXPORT_MAP);
        const ws = XLSX.utils.json_to_sheet(mappedNav);
        formatWorksheet(ws, mappedNav);
        XLSX.utils.book_append_sheet(workbook, ws, "NAV-daily");
    }

    // 9. DIVIDENDS
    if (dividends.length > 0) {
        const divRows = dividends.map(d => ({
            Date: d.date, Symbol: d.symbol, Name: d.name, Market: d.market,
            'Gross Amount': d.grossAmount, 'Withholding Tax': d.withholdingTax,
            'Net Amount': d.netAmount, Currency: d.currency, Source: d.source, Type: d.type
        }));
        const ws = XLSX.utils.json_to_sheet(divRows);
        formatWorksheet(ws, divRows);
        XLSX.utils.book_append_sheet(workbook, ws, "Dividends");
    }

    // 10. INTEREST
    if (interest.length > 0) {
        const intRows = interest.map(d => ({
            Date: d.date, Description: d.description, Amount: d.amount,
            Currency: d.currency, Source: d.source, Type: d.type
        }));
        const ws = XLSX.utils.json_to_sheet(intRows);
        formatWorksheet(ws, intRows);
        XLSX.utils.book_append_sheet(workbook, ws, "Interest");
    }

    // 11. CASH LEDGER
    if (cashLedger.length > 0) {
        const clRows = cashLedger.map(d => ({
            Date: d.date, Type: d.type, Description: d.description,
            Amount: d.amount, Currency: d.currency, Source: d.source
        }));
        const ws = XLSX.utils.json_to_sheet(clRows);
        formatWorksheet(ws, clRows);
        XLSX.utils.book_append_sheet(workbook, ws, "Cash Ledger");
    }

    // 12. BENCHMARK INDICES
    if (benchmarkData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(benchmarkData);
        formatWorksheet(ws, benchmarkData);
        XLSX.utils.book_append_sheet(workbook, ws, "Benchmark Indices");
    }

    XLSX.writeFile(workbook, fileName);
};
