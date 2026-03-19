
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LayoutDashboard, Table, LineChart, PieChart, Settings, LogOut, ArrowLeft, Layers, TrendingUp, BarChart3, Archive, Upload, X, Download, Activity } from 'lucide-react';
import { useToast } from './components/Toast';
import FileUpload from './components/FileUpload';
import SummaryCards from './components/SummaryCards';
import StockTable from './components/StockTable';
import TransactionTable from './components/TransactionTable';
import PnLTable from './components/PnLTable';
import SummaryDashboard from './components/SummaryDashboard';
import HistoryDashboard from './components/HistoryDashboard';
import NavDashboard from './components/NavDashboard';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import { parseExcelFile, parseBenchmarkFile, exportToExcel, exportTransactionsToExcel, exportGlobalData, exportPnLToExcel, generateId, calculatePortfolioAnalysis } from './services/excelService';
import { LookupSheetData, MarketConstants, StockData, TransactionData, PnLData, NavData, DividendData, InterestData, CashLedgerEntry, BenchmarkData } from './types';

const STORAGE_KEY = 'trade_tracker_market_constants';
const LOOKUP_DATA_KEY = 'trade_tracker_lookup_data';
const TRANSACTION_DATA_KEY = 'trade_tracker_txn_data';
const OPTION_TRANSACTION_DATA_KEY = 'trade_tracker_option_txn_data';
const PNL_DATA_KEY = 'trade_tracker_pnl_data';
const NAV_DATA_KEY = 'trade_tracker_nav_data';
const CASH_POSITION_KEY = 'trade_tracker_cash_pos';
const DIVIDEND_DATA_KEY = 'trade_tracker_dividends';
const INTEREST_DATA_KEY = 'trade_tracker_interest';
const CASH_LEDGER_KEY = 'trade_tracker_cash_ledger';
const BENCHMARK_DATA_KEY = 'trade_tracker_benchmark_data';

const App: React.FC = () => {
  const { showToast } = useToast();
  const [lookupData, setLookupData] = useState<LookupSheetData | null>(() => {
    const saved = localStorage.getItem(LOOKUP_DATA_KEY);
    if (saved) { try { const p = JSON.parse(saved); return { ...p, lastUpdated: new Date(p.lastUpdated) }; } catch(e){} }
    return null;
  });

  const [transactions, setTransactions] = useState<TransactionData[]>(() => {
    const saved = localStorage.getItem(TRANSACTION_DATA_KEY);
    if (!saved) return [];
    try {
        const parsed = JSON.parse(saved);
        return parsed.map((t: any) => ({ ...t, id: t.id || generateId() }));
    } catch (e) { return []; }
  });

  const [optionTransactions, setOptionTransactions] = useState<TransactionData[]>(() => {
    const saved = localStorage.getItem(OPTION_TRANSACTION_DATA_KEY);
    if (!saved) return [];
    try {
        const parsed = JSON.parse(saved);
        return parsed.map((t: any) => ({ ...t, id: t.id || generateId() }));
    } catch (e) { return []; }
  });

  const [pnlData, setPnlData] = useState<PnLData[]>(() => {
    const saved = localStorage.getItem(PNL_DATA_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [navData, setNavData] = useState<NavData[]>(() => {
    const saved = localStorage.getItem(NAV_DATA_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [marketConstants, setMarketConstants] = useState<MarketConstants>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { date: new Date().toISOString().split('T')[0], exg_rate: 7.8, aud_exg: 1.5, sg_exg: 1.3 };
  });

  const [cashPosition, setCashPosition] = useState<number>(() => {
      const saved = localStorage.getItem(CASH_POSITION_KEY);
      return saved ? parseFloat(saved) : 0;
  });

  const [dividendData, setDividendData] = useState<DividendData[]>(() => {
    const saved = localStorage.getItem(DIVIDEND_DATA_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [interestData, setInterestData] = useState<InterestData[]>(() => {
    const saved = localStorage.getItem(INTEREST_DATA_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>(() => {
    const saved = localStorage.getItem(CASH_LEDGER_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData>(() => {
    const saved = localStorage.getItem(BENCHMARK_DATA_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Calculate Option Position Sum from Option Transactions
  const optionPosition = useMemo(() => {
      return optionTransactions.reduce((sum, t) => sum + (t.total || 0), 0);
  }, [optionTransactions]);

  const [activeTab, setActiveTab] = useState<'summary' | 'analytics' | 'lookup' | 'transactions' | 'pnl' | 'history' | 'nav'>('summary');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Task 4: Re-enrich transactions whenever lookupData changes (fills in name + lastPrice from lookup)
  useEffect(() => {
    if (!lookupData) return;
    setTransactions(prev => enrichTransactions(prev, lookupData));
  }, [lookupData, enrichTransactions]);

  // Persistence
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(marketConstants)), [marketConstants]);
  useEffect(() => { if (lookupData) localStorage.setItem(LOOKUP_DATA_KEY, JSON.stringify(lookupData)); }, [lookupData]);
  useEffect(() => localStorage.setItem(TRANSACTION_DATA_KEY, JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem(OPTION_TRANSACTION_DATA_KEY, JSON.stringify(optionTransactions)), [optionTransactions]);
  useEffect(() => localStorage.setItem(PNL_DATA_KEY, JSON.stringify(pnlData)), [pnlData]);
  useEffect(() => localStorage.setItem(NAV_DATA_KEY, JSON.stringify(navData)), [navData]);
  useEffect(() => localStorage.setItem(CASH_POSITION_KEY, String(cashPosition)), [cashPosition]);
  useEffect(() => localStorage.setItem(DIVIDEND_DATA_KEY, JSON.stringify(dividendData)), [dividendData]);
  useEffect(() => localStorage.setItem(INTEREST_DATA_KEY, JSON.stringify(interestData)), [interestData]);
  useEffect(() => localStorage.setItem(CASH_LEDGER_KEY, JSON.stringify(cashLedger)), [cashLedger]);
  useEffect(() => localStorage.setItem(BENCHMARK_DATA_KEY, JSON.stringify(benchmarkData)), [benchmarkData]);

  // Enrich transactions with name/lastPrice from lookupData
  const enrichTransactions = useCallback((txns: TransactionData[], lookup: LookupSheetData | null): TransactionData[] => {
    return txns.map(txn => {
      const ticker = txn.stock?.toUpperCase() || '';
      const lu = lookup?.stocks.find(s => s.ticker.toUpperCase() === ticker);
      return {
        ...txn,
        name: txn.name && txn.name !== ticker ? txn.name : (lu?.companyName || txn.name || ticker),
        lastPrice: txn.lastPrice || lu?.closePrice || 0,
      };
    });
  }, []);

  const handleFileProcess = async (file: File) => {
    setIsProcessing(true);
    try {
      const result = await parseExcelFile(file);
      if (lookupData) {
          const oldMap = new Map<string, StockData>();
          lookupData.stocks.forEach(s => oldMap.set(s.ticker.toUpperCase(), s));
          result.lookup.stocks = result.lookup.stocks.map(ns => {
              const old = oldMap.get(ns.ticker.toUpperCase());
              if (old) {
                  return { ...ns, type: ns.type || old.type, category: ns.category || old.category, class: ns.class || old.class, market: ns.market || old.market };
              }
              return ns;
          });
      }
      setLookupData(result.lookup);
      setTransactions(enrichTransactions(result.transactions, result.lookup));
      setOptionTransactions(result.optionTransactions);
      setPnlData(result.pnl);
      setNavData(result.navData);
      // Merge new income data (don't wipe existing)
      if (result.dividends.length > 0) setDividendData(result.dividends);
      if (result.interest.length > 0) setInterestData(result.interest);
      if (result.cashLedger.length > 0) {
        setCashLedger(result.cashLedger);
      }
      // Comprehensive cash balance calculation:
      //   Cash = NetLedger + RealizedP&L + Dividends + Interest + OpenPositionCosts
      //
      // Cash Ledger: include all types EXCEPT "FX Conversion" (which is a zero-sum currency swap).
      //   NOTE: "Transfer" IS included — inter-account ACATS transfers appear as "Withdrawal" in IB
      //   and "Transfer" in IB AUS; excluding Transfer would cause a large negative bias.
      //
      // All amounts converted to USD using current exchange rates.
      {
        const mc = marketConstants;
        const toUsdByCurrency = (amount: number, currency: string) => {
          const c = (currency || 'USD').toUpperCase();
          if (c === 'HKD') return amount / mc.exg_rate;
          if (c === 'AUD') return amount / mc.aud_exg;
          if (c === 'SGD') return amount / mc.sg_exg;
          return amount;
        };
        const toUsdByMarket = (amount: number, market: string) => {
          const m = (market || '').toUpperCase().trim();
          if (m === 'HK') return amount / mc.exg_rate;
          if (m === 'AUS') return amount / mc.aud_exg;
          if (m === 'SG') return amount / mc.sg_exg;
          return amount;
        };

        // Use fresh result data; fall back to current state if file had no data for that sheet
        const ledger   = result.cashLedger.length > 0  ? result.cashLedger  : cashLedger;
        const pnl      = result.pnl.length > 0          ? result.pnl         : pnlData;
        const divs     = result.dividends.length > 0    ? result.dividends   : dividendData;
        const ints     = result.interest.length > 0     ? result.interest    : interestData;
        const txns     = enrichTransactions(result.transactions, result.lookup);
        const optTxns  = result.optionTransactions;

        // 1. External cash flows (exclude FX Conversion — just a currency swap, should net to 0)
        const EXCLUDED_LEDGER_TYPES = new Set(['fx conversion', 'fx_conversion', 'fxconversion']);
        const netLedger = ledger
          .filter(e => !EXCLUDED_LEDGER_TYPES.has(e.type.toLowerCase().replace(/[-\s]+/g, '')))
          .reduce((s, e) => s + toUsdByCurrency(e.amount, e.currency), 0);

        // 2. Realized P&L from closed trades (native currency per market)
        const realizedPnl = pnl.reduce((s, p) => s + toUsdByMarket(p.realizedPnL, p.market || ''), 0);

        // 3. Dividends received
        const dividends = divs.reduce((s, d) => s + toUsdByCurrency(d.netAmount, d.currency), 0);

        // 4. Interest received
        const interest = ints.reduce((s, d) => s + toUsdByCurrency(d.amount, d.currency), 0);

        // 5. Cost of open stock positions (total is negative for buys)
        const openStockCost = txns.reduce((s, t) => s + toUsdByMarket(t.total, t.market), 0);

        // 6. Cost of open option positions
        const openOptionCost = optTxns.reduce((s, t) => s + toUsdByMarket(t.total, t.market), 0);

        const newCash = netLedger + realizedPnl + dividends + interest + openStockCost + openOptionCost;
        setCashPosition(parseFloat(newCash.toFixed(2)));
      }
      setIsUploading(false);
      if (result.warnings.length > 0) {
        result.warnings.slice(0, 5).forEach(w => showToast(w, 'info'));
      }
    } catch (error) {
      showToast("Error parsing file: " + (error as Error).message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAppendProcess = async (file: File) => {
    setIsProcessing(true);
    try {
      const result = await parseExcelFile(file);

      // 1. Merge Lookup Data
      setLookupData(prev => {
          let currentStocks = prev ? [...prev.stocks] : [];
          if (!prev && result.lookup) currentStocks = [...result.lookup.stocks];

          const stockMap = new Map<string, StockData>();
          currentStocks.forEach(s => stockMap.set(s.ticker.toUpperCase(), s));

          if (result.lookup) {
               result.lookup.stocks.forEach(s => {
                  if (!stockMap.has(s.ticker.toUpperCase())) {
                      stockMap.set(s.ticker.toUpperCase(), s);
                      currentStocks.push(s);
                  }
               });
          }

          result.transactions.forEach(txn => {
              if (!txn.stock) return;
              const ticker = txn.stock.toUpperCase();
              let stock = stockMap.get(ticker);
              if (!stock) {
                  const newStock: StockData = {
                      ticker, companyName: txn.name || ticker, market: txn.market || '',
                      type: txn.type || '', category: txn.category || '', class: txn.class || '',
                      isChinese: 'N', tradingCode: '', closePrice: 0, marketCap: 0,
                      peTTM: 0, pb: 0, dividendYield: 0, roeTTM: 0, psQuantile: 0
                  };
                  stockMap.set(ticker, newStock);
                  currentStocks.push(newStock);
              } else {
                  if (!stock.type && txn.type) stock.type = txn.type;
                  if (!stock.category && txn.category) stock.category = txn.category;
                  if (!stock.class && txn.class) stock.class = txn.class;
                  if (!stock.market && txn.market) stock.market = txn.market;
                  if ((!stock.companyName || stock.companyName === ticker) && txn.name) stock.companyName = txn.name;
              }
          });

          return { stocks: currentStocks, lastUpdated: new Date(), lookupDate: result.lookup?.lookupDate || prev?.lookupDate };
      });

      // 2. Append Transactions (enrich)
      setTransactions(prev => {
          const enriched = enrichTransactions(result.transactions, lookupData);
          return [...prev, ...enriched];
      });

      // 3. Append Option Transactions
      setOptionTransactions(prev => [...prev, ...result.optionTransactions]);

      // 4. Append PnL
      setPnlData(prev => [...prev, ...result.pnl]);

      // 5. Append NAV (deduplicate by date)
      setNavData(prev => {
          const existingDates = new Set(prev.map(n => n.date));
          const newNavs = result.navData.filter(n => !existingDates.has(n.date));
          return [...prev, ...newNavs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      });

      // 6. Append income data (deduplicate by id not possible, use date+amount+source)
      if (result.dividends.length > 0) {
        setDividendData(prev => {
          const existing = new Set(prev.map(d => `${d.date}|${d.symbol}|${d.netAmount}|${d.source}`));
          const fresh = result.dividends.filter(d => !existing.has(`${d.date}|${d.symbol}|${d.netAmount}|${d.source}`));
          return [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
        });
      }
      if (result.interest.length > 0) {
        setInterestData(prev => {
          const existing = new Set(prev.map(d => `${d.date}|${d.amount}|${d.source}`));
          const fresh = result.interest.filter(d => !existing.has(`${d.date}|${d.amount}|${d.source}`));
          return [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
        });
      }
      if (result.cashLedger.length > 0) {
        setCashLedger(prev => {
          const existing = new Set(prev.map(d => `${d.date}|${d.type}|${d.amount}|${d.source}`));
          const fresh = result.cashLedger.filter(d => !existing.has(`${d.date}|${d.type}|${d.amount}|${d.source}`));
          return [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
        });
      }

      setIsUploading(false);
      showToast(`Appended ${result.transactions.length} transactions and ${result.optionTransactions.length} option transactions.`, 'success');
      if (result.warnings.length > 0) {
        result.warnings.slice(0, 5).forEach(w => showToast(w, 'info'));
      }
    } catch (error) {
      showToast("Error parsing file for append: " + (error as Error).message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Cash deposit / withdrawal handler
  // Creates a CashLedgerEntry and adjusts cashPosition + navData shares
  const handleCashTransaction = useCallback((entry: Omit<CashLedgerEntry, 'id'>) => {
    const newEntry: CashLedgerEntry = { ...entry, id: generateId() };
    setCashLedger(prev => [...prev, newEntry].sort((a, b) => a.date.localeCompare(b.date)));

    const isDeposit = entry.type.toLowerCase() === 'deposit';
    const isWithdrawal = entry.type.toLowerCase() === 'withdrawal';
    const usdAmount = entry.amount; // already in USD from caller

    if (isDeposit || isWithdrawal) {
      // Update cash position
      setCashPosition(prev => parseFloat((prev + usdAmount).toFixed(2)));

      // Update NAV: deposit = buy shares at current NAV; withdrawal = sell shares
      setNavData(prev => {
        if (!prev.length) return prev;
        const sorted = [...prev].sort((a, b) => a.date.localeCompare(b.date));
        const latest = sorted[sorted.length - 1];
        const currentNav = latest.nav1 || latest.nav2 || 1;
        const deltaShares = usdAmount / currentNav; // positive for deposit, negative for withdrawal
        const newShares = Math.max(0, (latest.shares || 0) + deltaShares);
        const newAum = latest.aum + usdAmount;
        const newNavEntry: NavData = {
          id: generateId(),
          date: entry.date,
          aum: newAum,
          nav1: currentNav,
          cumulativeReturn: latest.cumulativeReturn,
          shares: parseFloat(newShares.toFixed(4)),
          nav2: currentNav
        };
        // Replace or append for this date
        const existing = sorted.findIndex(n => n.date === entry.date);
        if (existing >= 0) {
          const updated = [...sorted];
          updated[existing] = newNavEntry;
          return updated;
        }
        return [...sorted, newNavEntry].sort((a, b) => a.date.localeCompare(b.date));
      });
    }
  }, []);

  // Independent income data upload (Dividends / Interest / Cash Ledger only)
  const handleIncomeUpload = useCallback(async (file: File) => {
    try {
      const result = await parseExcelFile(file);
      if (result.dividends.length > 0) {
        setDividendData(prev => {
          const existing = new Set(prev.map(d => `${d.date}|${d.symbol}|${d.netAmount}|${d.source}`));
          const fresh = result.dividends.filter(d => !existing.has(`${d.date}|${d.symbol}|${d.netAmount}|${d.source}`));
          return [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
        });
        showToast(`Loaded ${result.dividends.length} dividend records`, 'success');
      }
      if (result.interest.length > 0) {
        setInterestData(prev => {
          const existing = new Set(prev.map(d => `${d.date}|${d.amount}|${d.source}`));
          const fresh = result.interest.filter(d => !existing.has(`${d.date}|${d.amount}|${d.source}`));
          return [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
        });
        showToast(`Loaded ${result.interest.length} interest records`, 'success');
      }
      if (result.cashLedger.length > 0) {
        setCashLedger(prev => {
          const existing = new Set(prev.map(d => `${d.date}|${d.type}|${d.amount}|${d.source}`));
          const fresh = result.cashLedger.filter(d => !existing.has(`${d.date}|${d.type}|${d.amount}|${d.source}`));
          return [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
        });
        showToast(`Loaded ${result.cashLedger.length} cash ledger entries`, 'success');
      }
      if (!result.dividends.length && !result.interest.length && !result.cashLedger.length) {
        showToast('No Dividends, Interest, or Cash Ledger sheets found in file', 'info');
      }
    } catch (e) {
      showToast('Error reading income file: ' + (e as Error).message, 'error');
    }
  }, [showToast]);

  const handleBenchmarkUpload = useCallback(async (file: File) => {
    try {
      const data = await parseBenchmarkFile(file);
      setBenchmarkData(data);
      showToast(`Loaded benchmark data: ${data.length} days, ${Object.keys(data[0] || {}).filter(k => k !== 'date').length} indices`, 'success');
    } catch (e) {
      showToast('Error reading benchmark file: ' + (e as Error).message, 'error');
    }
  }, [showToast]);

  const handleBenchmarkClear = useCallback(() => {
    setBenchmarkData([]);
  }, []);

  const handleCreatePnL = useCallback((ids: string[]) => {
      if (ids.length !== 2) return;
      const t1 = transactions.find(t => String(t.id) === String(ids[0]));
      const t2 = transactions.find(t => String(t.id) === String(ids[1]));
      if (!t1 || !t2) return;

      if (t1.stock.toUpperCase() !== t2.stock.toUpperCase()) {
          showToast(`Stock mismatch: ${t1.stock} vs ${t2.stock}`, 'error'); return;
      }
      if (t1.action === t2.action) {
          showToast(`Action mismatch: Both are ${t1.action}. Need one Buy and one Sell.`, 'error'); return;
      }
      if (Math.abs(t1.shares) !== Math.abs(t2.shares)) {
          showToast(`Quantity mismatch: ${t1.shares} vs ${t2.shares}`, 'error'); return;
      }

      const buy = t1.action.toLowerCase().includes('buy') ? t1 : t2;
      const sell = t1.action.toLowerCase().includes('sell') ? t1 : t2;
      const qty = Math.abs(buy.shares);
      const nextNo = pnlData.length > 0 ? Math.max(...pnlData.map(p => p.tradeNumber || 0)) + 1 : 1;

      const newPnl: PnLData = {
          id: generateId(), tradeNumber: nextNo, stock: buy.stock, name: buy.name, market: buy.market,
          account: buy.source, quantity: qty, buyDate: buy.date, buyPrice: buy.price, buyComm: buy.commission,
          totalBuy: buy.total, sellDate: sell.date, sellPrice: sell.price, sellComm: sell.commission,
          totalSell: (sell.price * qty) - sell.commission,
          realizedPnL: ((sell.price * qty) - sell.commission) + buy.total,
          returnPercent: buy.total !== 0 ? (((sell.price * qty) - sell.commission) + buy.total) / Math.abs(buy.total) * 100 : 0,
          holdingDays: Math.ceil(Math.abs(new Date(sell.date).getTime() - new Date(buy.date).getTime()) / (1000 * 60 * 60 * 24))
      };

      setPnlData(prev => [...prev, newPnl]);
      setTransactions(prev => prev.filter(t => !ids.includes(String(t.id))));
      showToast("Stock P&L record created successfully!", 'success');
  }, [transactions, pnlData]);

  const handleCreateOptionPnL = useCallback((ids: string[]) => {
    if (ids.length !== 2) return;
    const t1 = optionTransactions.find(t => String(t.id) === String(ids[0]));
    const t2 = optionTransactions.find(t => String(t.id) === String(ids[1]));
    if (!t1 || !t2) return;

    if (t1.stock.toUpperCase() !== t2.stock.toUpperCase()) { showToast(`Stock mismatch: ${t1.stock} vs ${t2.stock}`, 'error'); return; }
    if (t1.option !== t2.option) { showToast(`Option Type mismatch: ${t1.option} vs ${t2.option}`, 'error'); return; }
    if (t1.strike !== t2.strike) { showToast(`Strike Price mismatch: ${t1.strike} vs ${t2.strike}`, 'error'); return; }
    if (t1.expiration !== t2.expiration) { showToast(`Expiration Date mismatch: ${t1.expiration} vs ${t2.expiration}`, 'error'); return; }

    const buy = t1.action.toLowerCase().includes('buy') ? t1 : t2;
    const sell = t1.action.toLowerCase().includes('sell') ? t1 : t2;
    if (buy.id === sell.id) { showToast("Action mismatch: Need one Buy and one Sell transaction to pair.", 'error'); return; }
    if (Math.abs(buy.shares) !== Math.abs(sell.shares)) { showToast(`Quantity/Contract mismatch: ${buy.shares} vs ${sell.shares}`, 'error'); return; }

    const qty = Math.abs(buy.shares);
    const nextNo = pnlData.length > 0 ? Math.max(...pnlData.map(p => p.tradeNumber || 0)) + 1 : 1;
    const realizedPnL = buy.total + sell.total;
    const isLong = new Date(buy.date) <= new Date(sell.date);
    const openingCost = isLong ? Math.abs(buy.total) : Math.abs(sell.total);
    const returnPercent = openingCost !== 0 ? (realizedPnL / openingCost) * 100 : 0;

    const newPnl: PnLData = {
        id: generateId(), tradeNumber: nextNo, stock: buy.stock, name: buy.name, market: buy.market,
        account: buy.source, option: buy.option, strike: buy.strike, expiration: buy.expiration,
        quantity: qty, buyDate: buy.date, buyPrice: buy.price, buyComm: buy.commission, totalBuy: buy.total,
        sellDate: sell.date, sellPrice: sell.price, sellComm: sell.commission, totalSell: sell.total,
        realizedPnL, returnPercent,
        holdingDays: Math.ceil(Math.abs(new Date(sell.date).getTime() - new Date(buy.date).getTime()) / (1000 * 60 * 60 * 24))
    };

    setPnlData(prev => [...prev, newPnl]);
    setOptionTransactions(prev => prev.filter(t => !ids.includes(String(t.id))));
    showToast("Option P&L record created successfully!", 'success');
  }, [optionTransactions, pnlData]);

  const handleAddTransaction = useCallback((txn: Partial<TransactionData>) => {
    const ticker = (txn.stock || '').toUpperCase();
    const lu = lookupData?.stocks.find(s => s.ticker.toUpperCase() === ticker);
    const newTxn: TransactionData = {
        id: generateId(), stock: txn.stock || '', name: txn.name || lu?.companyName || txn.stock || '',
        market: txn.market || '', action: txn.action || 'Buy', price: txn.price || 0, shares: txn.shares || 0,
        date: txn.date || new Date().toISOString().split('T')[0], commission: txn.commission || 0,
        total: txn.total || 0, source: txn.source || 'IB AUS',
        lastPrice: txn.lastPrice || lu?.closePrice || txn.price || 0,
        lastMv: txn.lastMv || 0, option: txn.option || '', expiration: txn.expiration || '', strike: txn.strike || 0
    };
    setTransactions(prev => [...prev, newTxn]);
  }, [lookupData]);

  const handleEditTransaction = useCallback((id: string, updated: Partial<TransactionData>) => {
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
  }, []);

  const handleDeleteTransaction = useCallback((idOrIds: string | string[]) => {
      const idsToRemove = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).map(String);
      const idSet = new Set(idsToRemove);
      setTransactions(prev => prev.filter(t => !idSet.has(String(t.id))));
  }, []);

  const handleDuplicateTransaction = useCallback((id: string) => {
      setTransactions(prev => {
          const original = prev.find(t => String(t.id) === String(id));
          if (!original) return prev;
          return [...prev, { ...original, id: generateId() }];
      });
  }, []);

  const handleAddOptionTransaction = useCallback((txn: Partial<TransactionData>) => {
    const newTxn: TransactionData = {
        id: generateId(), stock: txn.stock || '', name: txn.name || '', market: txn.market || '',
        action: txn.action || 'Buy', price: txn.price || 0, shares: txn.shares || 0,
        date: txn.date || new Date().toISOString().split('T')[0], commission: txn.commission || 0,
        total: txn.total || 0, source: txn.source || 'IB AUS', lastPrice: 0, lastMv: 0,
        option: txn.option || 'Call', expiration: txn.expiration || '', strike: txn.strike || 0,
        exercise: txn.exercise || 'No'
    };
    setOptionTransactions(prev => [...prev, newTxn]);
  }, []);

  const handleEditOptionTransaction = useCallback((id: string, updated: Partial<TransactionData>) => {
      setOptionTransactions(prev => prev.map(t => String(t.id) === String(id) ? { ...t, ...updated } : t));
  }, []);

  const handleDeleteOptionTransaction = useCallback((idOrIds: string | string[]) => {
      const idsToRemove = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).map(String);
      const idSet = new Set(idsToRemove);
      setOptionTransactions(prev => prev.filter(t => !idSet.has(String(t.id))));
  }, []);

  const handleEditPnL = useCallback((id: string, updated: Partial<PnLData>) => {
      setPnlData(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
  }, []);

  const handleDeletePnL = useCallback((idOrIds: string | string[]) => {
      const idsToRemove = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      const idSet = new Set(idsToRemove);
      setPnlData(prev => prev.filter(p => !idSet.has(p.id)));
  }, []);

  const handleSingleUpload = async (section: string, file: File) => {
    try {
        const result = await parseExcelFile(file);
        if (section === 'lookup') setLookupData(result.lookup);
        else if (section === 'transaction') {
            setTransactions(enrichTransactions(result.transactions, lookupData));
        }
        else if (section === 'option_transaction') setOptionTransactions(result.optionTransactions);
        else if (section === 'pnl') setPnlData(result.pnl);
        else if (section === 'nav') setNavData(result.navData);
    } catch (e) { showToast("Error uploading " + section + ": " + (e as Error).message, 'error'); }
  };

  const handleGlobalExport = () => {
    const analysis = calculatePortfolioAnalysis(pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition);
    const historyHk = analysis.g1Hk.filter(s => s.IsZero);
    const historyNonHk = analysis.g1NonHk.filter(s => s.IsZero);

    exportGlobalData(
        transactions, pnlData, lookupData, marketConstants, cashPosition, optionPosition,
        analysis.g2Hk, analysis.g2Ccs, analysis.g2Us,
        historyHk, historyNonHk,
        analysis.detailedHoldingsExport, analysis.weightedAvgs,
        navData, optionTransactions,
        dividendData, interestData, cashLedger
    );
  };

  if (!lookupData && !isUploading) {
    return <FileUpload onFileProcess={handleFileProcess} isLoading={isProcessing} />;
  }

  if (isUploading) {
      return <FileUpload onFileProcess={handleFileProcess} isLoading={isProcessing} onCancel={() => setIsUploading(false)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <aside className="w-64 bg-[#0f172a] text-slate-300 flex flex-col flex-shrink-0 shadow-2xl z-50">
        <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
          <div className="p-2 bg-blue-600 rounded-lg"><TrendingUp className="text-white w-6 h-6" /></div>
          <h1 className="text-xl font-bold text-white tracking-tight">TradeTracker</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          <button onClick={() => setActiveTab('summary')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'summary' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><BarChart3 size={20} /><span className="font-medium text-sm">Summary</span></button>
          <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><Activity size={20} /><span className="font-medium text-sm">Analytics</span></button>
          <button onClick={() => setActiveTab('nav')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'nav' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><TrendingUp size={20} /><span className="font-medium text-sm">Daily NAV</span></button>
          <button onClick={() => setActiveTab('pnl')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'pnl' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><LineChart size={20} /><span className="font-medium text-sm">Realized P&L</span></button>
          <button onClick={() => setActiveTab('transactions')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><Layers size={20} /><span className="font-medium text-sm">Holdings</span></button>
          <button onClick={() => setActiveTab('lookup')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'lookup' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><Table size={20} /><span className="font-medium text-sm">Lookup Data</span></button>
          <button onClick={() => setActiveTab('history')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><Archive size={20} /><span className="font-medium text-sm">History</span></button>

          <div className="pt-6 space-y-2 border-t border-slate-800/50 mt-4">
            <button onClick={handleGlobalExport} className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition-all duration-200 group"><Download size={16} className="group-hover:scale-110 transition-transform"/><span className="font-semibold text-xs uppercase tracking-wider">Export All Data</span></button>
            <button onClick={() => setIsUploading(true)} className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700 hover:text-white transition-all duration-200 group"><Upload size={16} className="group-hover:scale-110 transition-transform" /><span className="font-semibold text-xs uppercase tracking-wider">Upload New File</span></button>
          </div>
        </nav>
        <div className="p-4 border-t border-slate-800"><button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors"><LogOut size={20} /><span className="font-medium">Sign Out</span></button></div>
      </aside>

      <main className="flex-1 flex flex-col bg-[#f8fafc] overflow-hidden">
        <div className="p-8 pb-4 max-w-[1700px] w-full mx-auto flex-shrink-0">
          <SummaryCards data={marketConstants} onUpdate={(k, v) => setMarketConstants(prev => ({ ...prev, [k]: v }))} />
        </div>
        <div className="flex-1 px-8 pb-8 max-w-[1700px] w-full mx-auto overflow-y-auto custom-scrollbar">
          <div className="h-full flex flex-col">
            {activeTab === 'summary' && (
              <SummaryDashboard
                pnlData={pnlData}
                transactions={transactions}
                lookupData={lookupData}
                marketConstants={marketConstants}
                cashPosition={cashPosition}
                onUpdateCash={setCashPosition}
                optionPosition={optionPosition}
                cashLedger={cashLedger}
                onCashTransaction={handleCashTransaction}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsDashboard
                pnlData={pnlData}
                transactions={transactions}
                lookupData={lookupData}
                marketConstants={marketConstants}
                navData={navData}
                cashPosition={cashPosition}
                optionPosition={optionPosition}
                benchmarkData={benchmarkData}
                onBenchmarkUpload={handleBenchmarkUpload}
                onBenchmarkClear={handleBenchmarkClear}
                dividendData={dividendData}
                interestData={interestData}
                cashLedger={cashLedger}
                onIncomeUpload={handleIncomeUpload}
              />
            )}
            {activeTab === 'lookup' && (
              <StockTable
                stocks={lookupData?.stocks || []}
                onStockAdd={(s) => { if(lookupData) setLookupData({...lookupData, stocks: [...lookupData.stocks, s]}); }}
                onStockEdit={(i, s) => { if(lookupData) { const n = [...lookupData.stocks]; n[i] = s; setLookupData({...lookupData, stocks: n}); } }}
                onStockDelete={(idxs) => { if(lookupData) { const s = new Set(idxs); setLookupData({...lookupData, stocks: lookupData.stocks.filter((_, i) => !s.has(i))}); } }}
                onExport={() => exportToExcel(lookupData?.stocks || [])}
                onUpload={(f) => handleSingleUpload('lookup', f)}
              />
            )}
            {activeTab === 'transactions' && (
              <TransactionTable
                transactions={transactions}
                optionTransactions={optionTransactions}
                lookupData={lookupData}
                onExport={() => exportTransactionsToExcel(transactions, optionTransactions)}
                onUpload={(f) => handleSingleUpload('transaction', f)}
                onUploadOptions={(f) => handleSingleUpload('option_transaction', f)}
                onAppend={handleAppendProcess}
                onSplitTransaction={(id, s1, s2) => {
                    setTransactions(prev => {
                        const index = prev.findIndex(t => String(t.id) === String(id));
                        if (index === -1) return prev;
                        const original = prev[index];
                        const t1 = { ...original, ...s1, id: generateId() + '_1' };
                        const t2 = { ...original, ...s2, id: generateId() + '_2' };
                        const newTxns = [...prev];
                        newTxns.splice(index, 1, t1, t2);
                        return newTxns;
                    });
                }}
                onCreatePnL={handleCreatePnL}
                onCreateOptionPnL={handleCreateOptionPnL}
                onAddTransaction={handleAddTransaction}
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                onDuplicateTransaction={handleDuplicateTransaction}
                onAddOptionTransaction={handleAddOptionTransaction}
                onEditOptionTransaction={handleEditOptionTransaction}
                onDeleteOptionTransaction={handleDeleteOptionTransaction}
              />
            )}
            {activeTab === 'pnl' && (
              <PnLTable
                data={pnlData}
                marketConstants={marketConstants}
                onExport={(filteredData) => exportPnLToExcel(filteredData, marketConstants)}
                onUpload={(f) => handleSingleUpload('pnl', f)}
                onEditRecord={handleEditPnL}
                onDeleteRecord={handleDeletePnL}
              />
            )}
            {activeTab === 'nav' && (
              <NavDashboard data={navData} onUpdate={setNavData} onUpload={(f) => handleSingleUpload('nav', f)} />
            )}
            {activeTab === 'history' && (
              <HistoryDashboard
                pnlData={pnlData}
                transactions={transactions}
                lookupData={lookupData}
                marketConstants={marketConstants}
                cashPosition={cashPosition}
                optionPosition={optionPosition}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
