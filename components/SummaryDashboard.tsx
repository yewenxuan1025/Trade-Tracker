
import React, { useMemo, useState } from 'react';
import { PnLData, MarketConstants, TransactionData, LookupSheetData, CashLedgerEntry, TYPE_OPTIONS, CATEGORY_OPTIONS, CLASS_OPTIONS } from '../types';
import { BarChart3, Table as TableIcon, Calculator, Filter, Archive, Plus, ArrowDownCircle, ArrowUpCircle, Download } from 'lucide-react';


interface SummaryDashboardProps {
  pnlData: PnLData[];
  transactions: TransactionData[];
  lookupData: LookupSheetData | null;
  marketConstants: MarketConstants;
  cashPosition: number;
  onUpdateCash: (val: number) => void;
  optionPosition: number;
  cashLedger?: CashLedgerEntry[];
  onCashTransaction?: (entry: Omit<CashLedgerEntry, 'id'>) => void;
  onExport?: () => void;
}

const SummaryDashboard: React.FC<SummaryDashboardProps> = ({ pnlData, transactions, lookupData, marketConstants, cashPosition, onUpdateCash, optionPosition, cashLedger = [], onCashTransaction, onExport }) => {

  // Cash deposit/withdrawal modal state
  const [showCashModal, setShowCashModal] = useState(false);
  const [showReviewTable, setShowReviewTable] = useState(false);
  const [cashForm, setCashForm] = useState({ type: 'Deposit', amount: '', date: new Date().toISOString().split('T')[0], currency: 'USD', source: '', description: '' });

  const handleCashSubmit = () => {
    if (!cashForm.amount || parseFloat(cashForm.amount) === 0) return;
    const amt = cashForm.type === 'Withdrawal' ? -Math.abs(parseFloat(cashForm.amount)) : Math.abs(parseFloat(cashForm.amount));
    onCashTransaction?.({
      date: cashForm.date, type: cashForm.type,
      description: cashForm.description || `${cashForm.type} via Summary`,
      amount: amt, currency: cashForm.currency, source: cashForm.source
    });
    setShowCashModal(false);
    setCashForm({ type: 'Deposit', amount: '', date: new Date().toISOString().split('T')[0], currency: 'USD', source: '', description: '' });
  };

  // Filters and Selection for Holdings Analysis
  const [filterType, setFilterType] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterClass, setFilterClass] = useState('All');
  const [excludedTickers, setExcludedTickers] = useState<Set<string>>(new Set());

  // Column Widths State for Holdings Fundamental Analysis
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    select: 40, date: 90, ticker: 100, type: 100, category: 100, class: 100,
    pe: 80, pb: 80, div: 80, roe: 80, ps: 80,
    shares: 90, holdingsUsd: 110, holdingsPct: 90, pnl: 100, pnlPct: 90, currentCost: 100
  });

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    const startX = e.pageX;
    const startW = colWidths[key] || 100;
    const handleMove = (m: MouseEvent) => setColWidths(prev => ({ ...prev, [key]: Math.max(40, startW + (m.pageX - startX)) }));
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const { totalPortfolioMv, group2, holdingsSummary, rawDetailedHoldings } = useMemo(() => {
    // 1. Realized PnL Map for Group 2 lookup (use full pnlData for current holdings)
    const realizedPnlMap = new Map<string, number>();
    pnlData.forEach(p => {
        const s = p.stock.toUpperCase().trim();
        realizedPnlMap.set(s, (realizedPnlMap.get(s) || 0) + p.realizedPnL);
    });

    // 2. Group 2 (Current Holdings) Calculation with Cost Basis
    const holdingMap = new Map<string, { shares: number; totalCostLocal: number; market: string; isCCS: boolean; totalCashFlowLocal: number; name: string }>();
    const sortedTxns = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    sortedTxns.forEach(t => {
        const stock = t.stock.toUpperCase().trim();
        if (!stock) return;
        const current = holdingMap.get(stock) || { shares: 0, totalCostLocal: 0, market: t.market || 'US', isCCS: false, totalCashFlowLocal: 0, name: t.name || '' };
        
        // Update static data if not set (or update market from latest txn)
        if (!current.market) current.market = t.market || 'US';
        if (!current.name && t.name) current.name = t.name;
        
        const action = (t.action || '').toLowerCase();
        const price = t.price || 0;
        const shares = Math.abs(t.shares || 0);
        const comm = t.commission || 0;
        
        // Net Cash Flow accumulation
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
        
        // Determine isCCS from lookup if available
        if (lookupData) {
            const lookup = lookupData.stocks.find(s => s.ticker.toUpperCase() === stock);
            if (lookup) {
                current.isCCS = lookup.isChinese === 'Y';
                if (lookup.market) current.market = lookup.market;
                if (lookup.companyName) current.name = lookup.companyName;
            }
        }
        holdingMap.set(stock, current);
    });

    const g2Data: any[] = [];
    let totalHoldingsUsd = 0;

    holdingMap.forEach((data, stock) => {
        if (data.shares <= 0.001) return;

        const lookup = lookupData?.stocks.find(s => s.ticker.toUpperCase() === stock);
        const priceLocal = lookup?.closePrice || 0;
        const market = (data.market || 'US').toUpperCase();
        
        // Exchange Rate Logic
        let rate = 1;
        if (market === 'HK') rate = marketConstants.exg_rate;
        else if (market === 'SG') rate = marketConstants.sg_exg;
        else if (['AUD', 'AUS'].includes(market)) rate = marketConstants.aud_exg;

        // Calculate USD values for Aggregation and P&L (Consistent for all markets)
        const totalCostUsd = data.totalCostLocal / rate;
        const currentCostUsd = Math.abs(data.totalCashFlowLocal) / rate; // Net Cash Flow (Cost Basis for RTN%)
        const lastMvUsd = (priceLocal * data.shares) / rate;
        totalHoldingsUsd += lastMvUsd;

        const realizedPnlLocal = realizedPnlMap.get(stock) || 0;
        const realizedPnlUsd = rate !== 0 ? realizedPnlLocal / rate : 0;

        // Display Logic for Price/Cost Columns: 
        let avgCostDisplay, lastPriceDisplay, actualCostDisplay;
        if (market === 'HK') {
             avgCostDisplay = data.totalCostLocal / data.shares; // HKD
             lastPriceDisplay = priceLocal; // HKD
             actualCostDisplay = (data.totalCostLocal - realizedPnlLocal) / data.shares; // HKD
        } else {
             avgCostDisplay = (data.totalCostLocal / data.shares) / rate; // USD
             lastPriceDisplay = priceLocal / rate; // USD
             actualCostDisplay = ((data.totalCostLocal - realizedPnlLocal) / data.shares) / rate; // USD
        }

        g2Data.push({
            stock,
            name: data.name,
            shares: data.shares,
            avgCost: avgCostDisplay, // In Display Currency
            actualCost: actualCostDisplay, // In Display Currency
            totalCost: totalCostUsd, // In USD (Avg Cost Basis)
            currentCost: currentCostUsd, // In USD (Net Cash Flow Basis)
            lastPrice: lastPriceDisplay, // In Display Currency
            lastMv: lastMvUsd, // In USD
            realizedPnl: realizedPnlUsd, // In USD
            market,
            isCCS: data.isCCS
        });
    });

    const grandTotalPortfolio = totalHoldingsUsd + cashPosition + optionPosition;

    // Second pass to calculate P&L, P&L% and MV% now that we have portfolio total
    const g2Final = g2Data.map(d => {
        // Use Net Cash Flow Cost (CurrentCost) for P&L% consistency with All Stock Analysis (RTN%)
        const pnl = d.lastMv - d.currentCost; 
        const pnlPct = d.currentCost !== 0 ? (pnl / d.currentCost) * 100 : 0;
        const mvPct = grandTotalPortfolio > 0 ? (d.lastMv / grandTotalPortfolio) * 100 : 0;
        return { ...d, pnl, pnlPct, mvPct };
    });

    // Sort by Ticker alphabetical
    g2Final.sort((a, b) => a.stock.localeCompare(b.stock));

    // Filter and Sort Groups
    const hkHoldings = g2Final.filter(d => d.market === 'HK');
    // Sort HK by Ticker (first non-zero logic)
    hkHoldings.sort((a, b) => {
        const cleanA = a.stock.replace(/^0+/, '');
        const cleanB = b.stock.replace(/^0+/, '');
        return cleanA.localeCompare(cleanB);
    });

    const ccsHoldings = g2Final.filter(d => d.isCCS && d.market !== 'HK');
    
    // AUS/AUD Holdings
    const ausHoldings = g2Final.filter(d => ['AUD', 'AUS'].includes(d.market));

    // US & SG Holdings (remainder of non-CCS, non-HK, non-AUS)
    const usHoldings = g2Final.filter(d => !d.isCCS && !['HK', 'AUD', 'AUS'].includes(d.market));

    // Calculate Summary Totals
    const holdingsSummary = {
        hk: hkHoldings.reduce((acc, curr) => acc + curr.lastMv, 0),
        ccs: ccsHoldings.reduce((acc, curr) => acc + curr.lastMv, 0),
        us: usHoldings.reduce((acc, curr) => acc + curr.lastMv, 0),
        aus: ausHoldings.reduce((acc, curr) => acc + curr.lastMv, 0),
    };

    // 3. Detailed Holdings Analysis (Fundamental Data)
    let detailedHoldings = g2Final.map(h => {
        const l = lookupData?.stocks.find(s => s.ticker.toUpperCase() === h.stock.toUpperCase());
        return {
            ...h,
            date: marketConstants.date,
            type: l?.type || '-',
            category: l?.category || '-',
            class: l?.class || '-',
            pe: l?.peTTM || 0,
            pb: l?.pb || 0,
            div: l?.dividendYield || 0,
            roe: l?.roeTTM || 0,
            ps: l?.psQuantile || 0,
        };
    });

    // Sort by Ticker (First non-zero number logic)
    detailedHoldings.sort((a, b) => {
        const cleanA = a.stock.replace(/^0+/, '');
        const cleanB = b.stock.replace(/^0+/, '');
        return cleanA.localeCompare(cleanB);
    });

    return {
      totalPortfolioMv: grandTotalPortfolio,
      group2: {
        hk: hkHoldings,
        ccs: ccsHoldings,
        us: usHoldings,
        aus: ausHoldings
      },
      holdingsSummary,
      rawDetailedHoldings: detailedHoldings
    };
  }, [pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition]);

  // Second Memo: Filtering and Weighted Average Calculation
  const { filteredHoldings, weightedAvgs } = useMemo(() => {
      let filtered = rawDetailedHoldings;

      // Helper for robust comparison (trim + case insensitive)
      const normalize = (val: string) => val ? val.toString().trim().toLowerCase() : '';

      if (filterType !== 'All') filtered = filtered.filter(h => normalize(h.type) === normalize(filterType));
      if (filterCategory !== 'All') filtered = filtered.filter(h => normalize(h.category) === normalize(filterCategory));
      if (filterClass !== 'All') filtered = filtered.filter(h => normalize(h.class) === normalize(filterClass));

      // Subset for calculation: Visible filtered items minus explicitly excluded ones
      const calculationHoldings = filtered.filter(h => !excludedTickers.has(h.stock));

      const totalMvForAvg = calculationHoldings.reduce((sum, h) => sum + h.lastMv, 0);

      // Calculate Weighted PE (Only positive PE)
      const positivePeHoldings = calculationHoldings.filter(h => h.pe > 0);
      const totalMvPe = positivePeHoldings.reduce((sum, h) => sum + h.lastMv, 0);
      const weightedPe = totalMvPe > 0 ? positivePeHoldings.reduce((sum, h) => sum + (h.pe * h.lastMv), 0) / totalMvPe : 0;

      // Calculate Weighted ROE (Only positive ROE)
      const positiveRoeHoldings = calculationHoldings.filter(h => h.roe > 0);
      const totalMvRoe = positiveRoeHoldings.reduce((sum, h) => sum + h.lastMv, 0);
      const weightedRoe = totalMvRoe > 0 ? positiveRoeHoldings.reduce((sum, h) => sum + (h.roe * h.lastMv), 0) / totalMvRoe : 0;

      const avgs = {
          date: marketConstants.date,
          pe: weightedPe,
          pb: totalMvForAvg ? calculationHoldings.reduce((sum, h) => sum + (h.pb * h.lastMv), 0) / totalMvForAvg : 0,
          div: totalMvForAvg ? calculationHoldings.reduce((sum, h) => sum + (h.div * h.lastMv), 0) / totalMvForAvg : 0,
          roe: weightedRoe,
          ps: totalMvForAvg ? calculationHoldings.reduce((sum, h) => sum + (h.ps * h.lastMv), 0) / totalMvForAvg : 0,
          holdingsUsd: totalMvForAvg,
          holdingsPct: totalPortfolioMv ? (totalMvForAvg / totalPortfolioMv) * 100 : 0,
          count: calculationHoldings.length
      };

      return { filteredHoldings: filtered, weightedAvgs: avgs };
  }, [rawDetailedHoldings, filterType, filterCategory, filterClass, excludedTickers, marketConstants.date, totalPortfolioMv]);

  const toggleAllSelection = () => {
      // Logic: If all currently filtered items are included (not in excludedTickers), then exclude them all.
      // Otherwise, include them all (remove from excludedTickers).
      const allSelected = filteredHoldings.length > 0 && filteredHoldings.every(h => !excludedTickers.has(h.stock));
      
      const newExcluded = new Set(excludedTickers);
      filteredHoldings.forEach(h => {
          if (allSelected) {
              newExcluded.add(h.stock);
          } else {
              newExcluded.delete(h.stock);
          }
      });
      setExcludedTickers(newExcluded);
  };

  const toggleRowSelection = (ticker: string) => {
      const newExcluded = new Set(excludedTickers);
      if (newExcluded.has(ticker)) {
          newExcluded.delete(ticker);
      } else {
          newExcluded.add(ticker);
      }
      setExcludedTickers(newExcluded);
  };

  // Position age — first buy date per stock
  const currentHoldings = useMemo(() => {
    const map = new Map<string, string>();
    transactions
      .filter(t => t.action?.toLowerCase().includes('buy'))
      .forEach(t => {
        const key = t.stock.toUpperCase();
        if (!map.has(key) || t.date < map.get(key)!) map.set(key, t.date);
      });
    return map;
  }, [transactions]);

  const daysSince = (dateStr: string) => {
    if (!dateStr) return '-';
    return `${Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)}d`;
  };

  const formatPrice = (val: number) => {
      if (isNaN(val)) return '0.00';
      return Math.abs(val) < 1 && Math.abs(val) > 0 
        ? val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) 
        : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const ResizableHeader = ({ label, field }: { label: string, field: string }) => (
    <th 
        className={`py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-r relative select-none sticky top-0 bg-slate-50 ${['select', 'date', 'ticker'].includes(field) ? 'z-20' : 'z-10'}`}
        style={{ 
            width: colWidths[field], 
            minWidth: colWidths[field],
            left: field === 'select' ? 0 : (field === 'date' ? colWidths['select'] : (field === 'ticker' ? (colWidths['select'] + colWidths['date']) : 'auto'))
        }}
    >
        {label === 'select' ? (
            <input 
                type="checkbox" 
                checked={filteredHoldings.length > 0 && filteredHoldings.every(h => !excludedTickers.has(h.stock))}
                onChange={toggleAllSelection}
                className="cursor-pointer"
            />
        ) : label}
        <div 
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-30" 
            onMouseDown={(e) => handleResizeStart(e, field)} 
        />
    </th>
  );

  const dateStr = marketConstants.date.replace(/-/g, '');
  const getPct = (val: number, total: number) => total > 0 ? ((val/total)*100).toFixed(1) : '0.0';

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-1 space-y-8 pb-20">
      {/* Review Table — at the top when toggled */}
      {showReviewTable && (
        <section>
          <h3 className="text-lg font-black text-slate-800 mb-3 uppercase tracking-tight">Holdings Review</h3>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col className="w-24" />
                <col className="w-48" />
                <col className="w-32" />
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider">Ticker</th>
                  <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-right">Last Price</th>
                  <th className="px-4 py-3 font-extrabold text-slate-500 uppercase tracking-wider text-right">Shares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  // HK: sort by first non-zero digit sequence (handles leading zeros and letter prefixes)
                  ...[...group2.hk].sort((a, b) => {
                    const getKey = (s: string) => { const m = (s || '').match(/[1-9]\d*/); return m ? parseInt(m[0], 10) : 0; };
                    return getKey(a.stock) - getKey(b.stock);
                  }),
                  // Others: sort alphabetically
                  ...[...group2.ccs, ...group2.us, ...group2.aus].sort((a, b) => a.stock.localeCompare(b.stock)),
                ].map(h => (
                  <tr key={h.stock} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2 font-bold text-blue-600">{h.stock}</td>
                    <td className="px-4 py-2 text-slate-600 truncate">{h.name}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{(h.lastPrice || 0).toFixed(4)}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-700">{(h.shares || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-col gap-6 mb-8">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
                  <BarChart3 className="text-white w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Portfolio Overview</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowReviewTable(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showReviewTable ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  <TableIcon size={14} />Review
                </button>
                {onExport && (
                  <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-all">
                    <Download size={14} />Export
                  </button>
                )}
              </div>
           </div>

           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-2xl">
              <div className="p-6 space-y-5">
                  {/* 1. CCS */}
                  <div className="group">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm shadow-purple-200"></div>
                              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">CCS Stocks</span>
                          </div>
                          <div className="text-right flex items-baseline gap-2">
                              <span className="text-base font-black text-slate-700">${Math.round(holdingsSummary.ccs).toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.ccs, totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-purple-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.ccs, totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>

                  {/* 2. US */}
                  <div className="group">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200"></div>
                              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">US Stocks</span>
                          </div>
                          <div className="text-right flex items-baseline gap-2">
                              <span className="text-base font-black text-slate-700">${Math.round(holdingsSummary.us).toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.us, totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.us, totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>

                  {/* 3. AUS */}
                  <div className="group">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-200"></div>
                              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">AUS Stocks</span>
                          </div>
                          <div className="text-right flex items-baseline gap-2">
                              <span className="text-base font-black text-slate-700">${Math.round(holdingsSummary.aus).toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.aus, totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.aus, totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>

                  {/* 4. HK */}
                  <div className="group">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-200"></div>
                              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">HK Stocks</span>
                          </div>
                          <div className="text-right flex items-baseline gap-2">
                              <span className="text-base font-black text-slate-700">${Math.round(holdingsSummary.hk).toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.hk, totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.hk, totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>

                  {/* 5. Options - NEW */}
                  <div className="group">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm shadow-orange-200"></div>
                              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Options Value</span>
                          </div>
                          <div className="text-right flex items-center gap-2">
                              <span className="text-base font-black text-orange-600">${Math.round(optionPosition).toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(optionPosition, totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-orange-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(optionPosition, totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>

                  {/* 6. Cash */}
                  <div className="group">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></div>
                              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Cash Position</span>
                              {onCashTransaction && (
                                <button onClick={() => setShowCashModal(true)} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-[10px] font-bold border border-emerald-200">
                                  <Plus size={10} /> Deposit / Withdraw
                                </button>
                              )}
                          </div>
                          <div className="text-right flex items-center gap-2">
                              <div className="flex items-center gap-1 border-b border-dashed border-slate-300 hover:border-emerald-500 transition-colors group-focus-within:border-emerald-500">
                                <span className="text-sm font-black text-emerald-600">$</span>
                                <input
                                  type="number"
                                  className="font-black text-base text-emerald-600 bg-transparent outline-none w-24 text-right py-0.5"
                                  value={cashPosition}
                                  onChange={(e) => onUpdateCash(parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(cashPosition, totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(cashPosition, totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>
              </div>
              
              {/* 7. Total */}
              <div className="bg-slate-50 p-6 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Portfolio (USD)</span>
                      <span className="text-3xl font-black text-slate-800 tracking-tight leading-none" title={totalPortfolioMv.toLocaleString()}>
                        ${Math.round(totalPortfolioMv).toLocaleString()}
                      </span>
                  </div>
              </div>
           </div>
        </div>

      </section>

      <section className="mb-12">
        <div className="mb-4">
            <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2"><TableIcon className="w-5 h-5 text-blue-600"/> Holdings Fundamental Analysis</h2>
        </div>
        
        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-4 mb-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filters:</span>
            </div>
            
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Type</span>
                <select 
                    value={filterType} 
                    onChange={e => setFilterType(e.target.value)} 
                    className="text-xs font-medium border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                >
                    <option value="All">All Types</option>
                    {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Category</span>
                <select 
                    value={filterCategory} 
                    onChange={e => setFilterCategory(e.target.value)} 
                    className="text-xs font-medium border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                >
                    <option value="All">All Categories</option>
                    {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Class</span>
                <select 
                    value={filterClass} 
                    onChange={e => setFilterClass(e.target.value)} 
                    className="text-xs font-medium border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                >
                    <option value="All">All Classes</option>
                    {CLASS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </div>

            <div className="ml-auto flex items-center gap-3">
                 <div className="px-3 py-1 bg-blue-50 rounded-lg border border-blue-100">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mr-2">Included</span>
                    <span className="text-sm font-black text-blue-700">{weightedAvgs.count} <span className="text-slate-400 text-xs font-medium">/ {filteredHoldings.length}</span></span>
                 </div>
            </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-scroll custom-scrollbar max-h-[500px]">
                <table className="w-full text-left text-[11px] whitespace-nowrap table-fixed border-collapse">
                    <thead className="bg-slate-50 shadow-sm">
                        <tr className="border-b">
                            <ResizableHeader label="select" field="select" />
                            <ResizableHeader label="Date" field="date" />
                            <ResizableHeader label="Ticker" field="ticker" />
                            <ResizableHeader label="Type" field="type" />
                            <ResizableHeader label="Category" field="category" />
                            <ResizableHeader label="Class" field="class" />
                            <ResizableHeader label="PE TTM" field="pe" />
                            <ResizableHeader label="PB" field="pb" />
                            <ResizableHeader label="Div Yld" field="div" />
                            <ResizableHeader label="ROE TTM" field="roe" />
                            <ResizableHeader label="PS PCTL" field="ps" />
                            <ResizableHeader label="Shares" field="shares" />
                            <ResizableHeader label="Holdings (USD)" field="holdingsUsd" />
                            <ResizableHeader label="Holdings %" field="holdingsPct" />
                            <ResizableHeader label="P&L (USD)" field="pnl" />
                            <ResizableHeader label="P&L %" field="pnlPct" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredHoldings.map(h => {
                            const isExcluded = excludedTickers.has(h.stock);
                            return (
                                <tr key={h.stock} className={`hover:bg-slate-50 ${isExcluded ? 'opacity-50 grayscale' : ''}`}>
                                    <td className="py-1.5 px-3 sticky left-0 bg-white z-10 border-r text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={!isExcluded}
                                            onChange={() => toggleRowSelection(h.stock)}
                                            className="cursor-pointer"
                                        />
                                    </td>
                                    <td 
                                        className="py-1.5 px-3 sticky z-10 border-r text-slate-400 font-mono text-[10px] bg-white"
                                        style={{ left: colWidths['select'] }}
                                    >
                                        {h.date}
                                    </td>
                                    <td 
                                        className="py-1.5 px-3 sticky z-10 border-r font-black text-blue-600 text-[10px] bg-white" 
                                        style={{ left: colWidths['select'] + colWidths['date'] }}
                                    >
                                        {h.stock}
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600 text-[10px]">{h.type}</td>
                                    <td className="py-1.5 px-3 text-slate-600 text-[10px]">{h.category}</td>
                                    <td className="py-1.5 px-3 text-slate-600 text-[10px]">{h.class}</td>
                                    <td className="py-1.5 px-3 text-right font-mono text-[10px]">{h.pe.toFixed(2)}</td>
                                    <td className="py-1.5 px-3 text-right font-mono text-[10px]">{h.pb.toFixed(2)}</td>
                                    <td className="py-1.5 px-3 text-right font-mono text-[10px]">{h.div.toFixed(2)}</td>
                                    <td className="py-1.5 px-3 text-right font-mono text-[10px]">{h.roe.toFixed(2)}</td>
                                    <td className="py-1.5 px-3 text-right font-mono text-[10px]">{h.ps.toFixed(2)}</td>
                                    <td className="py-1.5 px-3 text-right font-mono text-[10px]">{h.shares.toLocaleString()}</td>
                                    <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-800 text-[10px]">{h.lastMv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className="py-1.5 px-3 text-right font-mono text-slate-500 text-[10px]">{h.mvPct.toFixed(2)}%</td>
                                    <td className={`py-1.5 px-3 text-right font-mono font-bold text-[10px] ${h.pnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>{h.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className={`py-1.5 px-3 text-right font-mono font-bold text-[10px] ${h.pnlPct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>{h.pnlPct.toFixed(2)}%</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            {/* Weighted Average Footer */}
            <div className="bg-slate-100/50 border-t border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-4 h-4 text-blue-500"/>
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Weighted Averages (Selected Only)</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Date</span>
                        <span className="font-mono font-bold text-sm text-slate-700">{weightedAvgs.date}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">PE Avg</span>
                        <span className="font-mono font-bold text-sm text-slate-700">{weightedAvgs.pe.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">PB Avg</span>
                        <span className="font-mono font-bold text-sm text-slate-700">{weightedAvgs.pb.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Div Yield Avg</span>
                        <span className="font-mono font-bold text-sm text-slate-700">{weightedAvgs.div.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">ROE TTM Avg</span>
                        <span className="font-mono font-bold text-sm text-slate-700">{weightedAvgs.roe.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">PS PCTL Avg</span>
                        <span className="font-mono font-bold text-sm text-slate-700">{weightedAvgs.ps.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Selected (USD)</span>
                        <span className="font-mono font-black text-sm text-slate-800">${Math.round(weightedAvgs.holdingsUsd).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Selected %</span>
                        <span className="font-mono font-bold text-sm text-blue-600">{weightedAvgs.holdingsPct.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        </div>
      </section>

      {/* Current Holdings Tables */}
      <section className="mb-12 space-y-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-800 uppercase flex items-center gap-2">
            <Archive className="w-5 h-5 text-blue-600" /> Current Holdings
          </h2>
        </div>
        {[
          { title: 'HK Holdings', data: group2.hk, currency: 'HKD' },
          { title: 'CCS Holdings', data: group2.ccs, currency: 'USD' },
          { title: 'US Stocks', data: group2.us, currency: 'USD' },
          { title: 'AUS Holdings', data: group2.aus, currency: 'AUD' },
        ]
          .filter(g => g.data && g.data.length > 0)
          .map(({ title, data, currency }) => (
            <div key={title} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-blue-50/20 flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-tight flex items-center gap-2">
                  <Archive size={14} className="text-blue-500" /> {title}
                </h3>
                <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{data.length} HOLDINGS</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100/80">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="py-2 px-3">Stock</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3 text-right">Shares</th>
                      <th className="py-2 px-3 text-right">Avg Cost ({currency})</th>
                      <th className="py-2 px-3 text-right">Last Price ({currency})</th>
                      <th className="py-2 px-3 text-right">MV (USD)</th>
                      <th className="py-2 px-3 text-right">P&L (USD)</th>
                      <th className="py-2 px-3 text-right">P&L %</th>
                      <th className="py-2 px-3 text-right">MV %</th>
                      <th className="py-2 px-3 text-right">Held Since</th>
                      <th className="py-2 px-3 text-right">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.map((h: any) => {
                      const heldSince = currentHoldings.get(h.stock.toUpperCase()) || '';
                      return (
                        <tr key={h.stock} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-black text-blue-600">{h.stock}</td>
                          <td className="py-1.5 px-3 text-slate-500 text-[10px] max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap" title={h.name}>{h.name}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{h.shares?.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right font-mono">{formatPrice(h.avgCost)}</td>
                          <td className="py-1.5 px-3 text-right font-mono font-black">{formatPrice(h.lastPrice)}</td>
                          <td className="py-1.5 px-3 text-right font-mono">${h.lastMv?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className={`py-1.5 px-3 text-right font-mono font-bold ${h.pnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {h.pnl?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-mono font-bold ${h.pnlPct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {h.pnlPct?.toFixed(2)}%
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-500">{h.mvPct?.toFixed(2)}%</td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-400 text-[10px]">{heldSince}</td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-400 text-[10px]">{daysSince(heldSince)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </section>

      {/* Review Table — moved to top, shown inline */}

      {/* Cash Deposit / Withdrawal Modal */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCashModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-800">Cash Transaction</h3>
            {/* Type */}
            <div className="flex gap-2">
              {['Deposit','Withdrawal'].map(t => (
                <button key={t} onClick={() => setCashForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${cashForm.type === t ? (t === 'Deposit' ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {t === 'Deposit' ? <ArrowDownCircle size={14}/> : <ArrowUpCircle size={14}/>} {t}
                </button>
              ))}
            </div>
            {/* Amount */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Amount</label>
              <input type="number" min={0} step={100} value={cashForm.amount} onChange={e => setCashForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
            </div>
            {/* Date */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Date</label>
              <input type="date" value={cashForm.date} onChange={e => setCashForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {/* Currency */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Currency</label>
              <select value={cashForm.currency} onChange={e => setCashForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                {['USD','HKD','AUD','SGD'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {/* Source */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Source / Account</label>
              <input type="text" value={cashForm.source} onChange={e => setCashForm(f => ({ ...f, source: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. IB AUS" />
            </div>
            {/* Description */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description (optional)</label>
              <input type="text" value={cashForm.description} onChange={e => setCashForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="Funds received" />
            </div>
            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCashModal(false)} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200">Cancel</button>
              <button onClick={handleCashSubmit} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryDashboard;
