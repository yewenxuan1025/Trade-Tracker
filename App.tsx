
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LayoutDashboard, Table, LineChart, PieChart, Settings, LogOut, ArrowLeft, Layers, TrendingUp, BarChart3, Archive, Upload, X, Download } from 'lucide-react';
import { useToast } from './components/Toast';
import FileUpload from './components/FileUpload';
import SummaryCards from './components/SummaryCards';
import StockTable from './components/StockTable';
import TransactionTable from './components/TransactionTable';
import PnLTable from './components/PnLTable';
import SummaryDashboard from './components/SummaryDashboard';
import HistoryDashboard from './components/HistoryDashboard';
import NavDashboard from './components/NavDashboard';
import { parseExcelFile, exportToExcel, exportTransactionsToExcel, exportGlobalData, exportPnLToExcel, generateId, calculatePortfolioAnalysis } from './services/excelService';
import { LookupSheetData, MarketConstants, StockData, TransactionData, PnLData, NavData } from './types';

const STORAGE_KEY = 'trade_tracker_market_constants';
const LOOKUP_DATA_KEY = 'trade_tracker_lookup_data';
const TRANSACTION_DATA_KEY = 'trade_tracker_txn_data';
const OPTION_TRANSACTION_DATA_KEY = 'trade_tracker_option_txn_data';
const PNL_DATA_KEY = 'trade_tracker_pnl_data';
const NAV_DATA_KEY = 'trade_tracker_nav_data';
const CASH_POSITION_KEY = 'trade_tracker_cash_pos';

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

  // Calculate Option Position Sum from Option Transactions
  const optionPosition = useMemo(() => {
      return optionTransactions.reduce((sum, t) => sum + (t.total || 0), 0);
  }, [optionTransactions]);

  const [activeTab, setActiveTab] = useState<'summary' | 'lookup' | 'transactions' | 'pnl' | 'history' | 'nav'>('summary');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(marketConstants)), [marketConstants]);
  useEffect(() => { if (lookupData) localStorage.setItem(LOOKUP_DATA_KEY, JSON.stringify(lookupData)); }, [lookupData]);
  useEffect(() => localStorage.setItem(TRANSACTION_DATA_KEY, JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem(OPTION_TRANSACTION_DATA_KEY, JSON.stringify(optionTransactions)), [optionTransactions]);
  useEffect(() => localStorage.setItem(PNL_DATA_KEY, JSON.stringify(pnlData)), [pnlData]);
  useEffect(() => localStorage.setItem(NAV_DATA_KEY, JSON.stringify(navData)), [navData]);
  useEffect(() => localStorage.setItem(CASH_POSITION_KEY, String(cashPosition)), [cashPosition]);

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
      setTransactions(result.transactions);
      setOptionTransactions(result.optionTransactions);
      setPnlData(result.pnl);
      setNavData(result.navData);
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
      
      // 1. Merge Lookup Data (from both Lookup sheet and Transactions)
      setLookupData(prev => {
          let currentStocks = prev ? [...prev.stocks] : [];
          if (!prev && result.lookup) currentStocks = [...result.lookup.stocks];
          
          const stockMap = new Map<string, StockData>();
          currentStocks.forEach(s => stockMap.set(s.ticker.toUpperCase(), s));
          
          // Merge from result.lookup (if any)
          if (result.lookup) {
               result.lookup.stocks.forEach(s => {
                  if (!stockMap.has(s.ticker.toUpperCase())) {
                      stockMap.set(s.ticker.toUpperCase(), s);
                      currentStocks.push(s);
                  }
               });
          }

          // Merge from result.transactions (infer missing)
          result.transactions.forEach(txn => {
              if (!txn.stock) return;
              const ticker = txn.stock.toUpperCase();
              let stock = stockMap.get(ticker);
              
              if (!stock) {
                  // Create new stock entry if it doesn't exist
                  const newStock: StockData = {
                      ticker: ticker,
                      companyName: txn.name || ticker,
                      market: txn.market || '',
                      type: txn.type || '',
                      category: txn.category || '',
                      class: txn.class || '',
                      isChinese: 'N',
                      tradingCode: '',
                      closePrice: 0,
                      marketCap: 0,
                      peTTM: 0,
                      pb: 0,
                      dividendYield: 0,
                      roeTTM: 0,
                      psQuantile: 0
                  };
                  stockMap.set(ticker, newStock);
                  currentStocks.push(newStock);
              } else {
                  // Update missing fields if transaction has them
                  if (!stock.type && txn.type) stock.type = txn.type;
                  if (!stock.category && txn.category) stock.category = txn.category;
                  if (!stock.class && txn.class) stock.class = txn.class;
                  if (!stock.market && txn.market) stock.market = txn.market;
                  if ((!stock.companyName || stock.companyName === ticker) && txn.name) stock.companyName = txn.name;
              }
          });
          
          return { 
              stocks: currentStocks, 
              lastUpdated: new Date() 
          };
      });

      // 2. Append Transactions
      setTransactions(prev => [...prev, ...result.transactions]);
      
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
          id: generateId(),
          tradeNumber: nextNo,
          stock: buy.stock,
          name: buy.name,
          market: buy.market,
          account: buy.source,
          quantity: qty,
          buyDate: buy.date,
          buyPrice: buy.price,
          buyComm: buy.commission,
          totalBuy: buy.total,
          sellDate: sell.date,
          sellPrice: sell.price,
          sellComm: sell.commission,
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

    // Validate Pairing Logic for Options
    if (t1.stock.toUpperCase() !== t2.stock.toUpperCase()) {
        showToast(`Stock mismatch: ${t1.stock} vs ${t2.stock}`, 'error'); return;
    }
    if (t1.option !== t2.option) {
        showToast(`Option Type mismatch: ${t1.option} vs ${t2.option}`, 'error'); return;
    }
    if (t1.strike !== t2.strike) {
        showToast(`Strike Price mismatch: ${t1.strike} vs ${t2.strike}`, 'error'); return;
    }
    if (t1.expiration !== t2.expiration) {
        showToast(`Expiration Date mismatch: ${t1.expiration} vs ${t2.expiration}`, 'error'); return;
    }
    
    // Determine Buy/Sell for P&L logic. 
    // Usually Buy to Open / Sell to Close OR Sell to Open / Buy to Close.
    // We treat "Buy" action as the cost basis side (even if negative cash flow) and "Sell" as proceeds side (positive).
    // Note: Writing an option (Sell to Open) results in positive cash, buying back (Buy to Close) is negative.
    // Logic: realizedPnL = Sum of Totals.
    
    // We just need to identify which one happened first to calculate holding days accurately, 
    // but for P&L structure we typically group them. 
    // Let's standardise: PnLData uses 'buy...' and 'sell...' fields.
    // If it's a Short position (Write), 'buy' might be the closing transaction.
    // However, the PnLData structure assumes Buy is entry (long). 
    // For simplicity in this app, we will map the transaction with "Buy" action to 'buy...' fields and "Sell" to 'sell...' fields regardless of order.
    
    const buy = t1.action.toLowerCase().includes('buy') ? t1 : t2;
    const sell = t1.action.toLowerCase().includes('sell') ? t1 : t2;

    if (buy.id === sell.id) { // Both are Buy or Both are Sell
       showToast("Action mismatch: Need one Buy and one Sell transaction to pair.", 'error'); return;
    }

    if (Math.abs(buy.shares) !== Math.abs(sell.shares)) {
        showToast(`Quantity/Contract mismatch: ${buy.shares} vs ${sell.shares}`, 'error'); return;
    }

    const qty = Math.abs(buy.shares);
    const nextNo = pnlData.length > 0 ? Math.max(...pnlData.map(p => p.tradeNumber || 0)) + 1 : 1;

    // Calculate P&L
    // Buy Total is negative (cost), Sell Total is positive (revenue). 
    // Realized P&L = Total Buy + Total Sell.
    const realizedPnL = buy.total + sell.total;
    // Return %: PnL / Abs(Opening Cost). 
    // Opening cost depends on whether it was Long (Buy First) or Short (Sell First).
    // We'll use the Date to determine opening trade.
    const isLong = new Date(buy.date) <= new Date(sell.date);
    const openingCost = isLong ? Math.abs(buy.total) : Math.abs(sell.total); // If short, opening "cost" is technically the margin/collateral, but usually ROI is based on premium or max risk. 
    // Simplified ROI: PnL / Abs(Entry Cashflow)
    const returnPercent = openingCost !== 0 ? (realizedPnL / openingCost) * 100 : 0;

    const newPnl: PnLData = {
        id: generateId(),
        tradeNumber: nextNo,
        stock: buy.stock,
        name: buy.name,
        market: buy.market,
        account: buy.source,
        option: buy.option, // 'Call' or 'Put'
        strike: buy.strike,
        expiration: buy.expiration,
        quantity: qty,
        buyDate: buy.date,
        buyPrice: buy.price,
        buyComm: buy.commission,
        totalBuy: buy.total,
        sellDate: sell.date,
        sellPrice: sell.price,
        sellComm: sell.commission,
        totalSell: sell.total,
        realizedPnL: realizedPnL,
        returnPercent: returnPercent,
        holdingDays: Math.ceil(Math.abs(new Date(sell.date).getTime() - new Date(buy.date).getTime()) / (1000 * 60 * 60 * 24))
    };

    setPnlData(prev => [...prev, newPnl]);
    setOptionTransactions(prev => prev.filter(t => !ids.includes(String(t.id))));
    showToast("Option P&L record created successfully!", 'success');
  }, [optionTransactions, pnlData]);

  // --- STOCK TRANSACTION HANDLERS ---
  const handleAddTransaction = useCallback((txn: Partial<TransactionData>) => {
    const newTxn: TransactionData = {
        id: generateId(),
        stock: txn.stock || '',
        name: txn.name || '',
        market: txn.market || '',
        action: txn.action || 'Buy',
        price: txn.price || 0,
        shares: txn.shares || 0,
        date: txn.date || new Date().toISOString().split('T')[0],
        commission: txn.commission || 0,
        total: txn.total || 0,
        source: txn.source || 'IB AUS',
        lastPrice: txn.lastPrice || txn.price || 0,
        lastMv: txn.lastMv || 0,
        option: txn.option || '',
        expiration: txn.expiration || '',
        strike: txn.strike || 0
    };
    setTransactions(prev => [...prev, newTxn]);
  }, []);

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
          const copy = { ...original, id: generateId() };
          return [...prev, copy];
      });
  }, []);

  // --- OPTION TRANSACTION HANDLERS ---
  const handleAddOptionTransaction = useCallback((txn: Partial<TransactionData>) => {
    const newTxn: TransactionData = {
        id: generateId(),
        stock: txn.stock || '',
        name: txn.name || '',
        market: txn.market || '',
        action: txn.action || 'Buy',
        price: txn.price || 0,
        shares: txn.shares || 0,
        date: txn.date || new Date().toISOString().split('T')[0],
        commission: txn.commission || 0,
        total: txn.total || 0,
        source: txn.source || 'IB AUS',
        lastPrice: 0,
        lastMv: 0,
        option: txn.option || 'Call',
        expiration: txn.expiration || '',
        strike: txn.strike || 0,
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
        else if (section === 'transaction') setTransactions(result.transactions);
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
        transactions, 
        pnlData, 
        lookupData, 
        marketConstants, 
        cashPosition, 
        optionPosition, 
        analysis.g2Hk, 
        analysis.g2Ccs, 
        analysis.g2Us,
        historyHk,
        historyNonHk,
        analysis.detailedHoldingsExport,
        analysis.weightedAvgs,
        navData,
        optionTransactions
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
          <button onClick={() => setActiveTab('lookup')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'lookup' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><Table size={20} /><span className="font-medium text-sm">Lookup Data</span></button>
          <button onClick={() => setActiveTab('transactions')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><Layers size={20} /><span className="font-medium text-sm">Holdings</span></button>
          <button onClick={() => setActiveTab('pnl')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'pnl' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><LineChart size={20} /><span className="font-medium text-sm">Realized P&L</span></button>
          <button onClick={() => setActiveTab('nav')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'nav' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'hover:bg-slate-800 hover:text-white'}`}><TrendingUp size={20} /><span className="font-medium text-sm">Daily NAV</span></button>
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
                        // Ensure unique IDs by adding a random suffix or delay
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
