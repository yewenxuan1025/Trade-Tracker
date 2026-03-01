
import React, { useMemo, useState, useEffect } from 'react';
import { PnLData, MarketConstants, TransactionData, LookupSheetData, TYPE_OPTIONS, CATEGORY_OPTIONS, CLASS_OPTIONS } from '../types';
import { TrendingUp, TrendingDown, Target, Activity, PieChart, DollarSign, Wallet, BarChart3, ZoomIn, ZoomOut, Briefcase, History, Table as TableIcon, Calculator, ArrowLeftRight, Filter, Calendar } from 'lucide-react';
import { calculatePortfolioAnalysis } from '../services/excelService';
import AnalysisTable from './AnalysisTable';

interface SummaryDashboardProps {
  pnlData: PnLData[];
  transactions: TransactionData[];
  lookupData: LookupSheetData | null;
  marketConstants: MarketConstants;
  cashPosition: number;
  onUpdateCash: (val: number) => void;
  optionPosition: number;
}

const SummaryDashboard: React.FC<SummaryDashboardProps> = ({ pnlData, transactions, lookupData, marketConstants, cashPosition, onUpdateCash, optionPosition }) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isWinnersExpanded, setIsWinnersExpanded] = useState(false);
  const [isLosersExpanded, setIsLosersExpanded] = useState(false);

  // Date Range State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Initialize Date Range from Data
  useEffect(() => {
    if (pnlData.length > 0 && !startDate) {
        const dates = pnlData.map(d => d.sellDate).filter(d => d).sort();
        if (dates.length > 0) {
            setStartDate(dates[0]);
        } else {
            setStartDate('2020-01-01');
        }
    } else if (!startDate) {
        setStartDate('2020-01-01');
    }
  }, [pnlData]);

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

  const { metrics, group1, group2, holdingsSummary, rawDetailedHoldings } = useMemo(() => {
    // Filter PnL Data by Date Range
    const filteredPnlData = pnlData.filter(p => p.sellDate >= startDate && p.sellDate <= endDate);

    // 1. Calculate Portfolio Analysis using shared service for consistent P&L and Group 1 data
    const analysis = calculatePortfolioAnalysis(filteredPnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition);

    // 2. Win/Loss Statistics & Realized PnL Map for Group 2 lookup
    const realizedPnlMap = new Map<string, number>();
    
    // Detailed Win/Loss Calculation (Converted to USD)
    let totalWinUsd = 0;
    let totalLossUsd = 0;
    let winCount = 0;
    let lossCount = 0;
    const winValues: number[] = [];
    const lossValues: number[] = [];

    filteredPnlData.forEach(p => {
        const s = p.stock.toUpperCase().trim();
        realizedPnlMap.set(s, (realizedPnlMap.get(s) || 0) + p.realizedPnL);

        // USD Conversion for Stats
        const m = (p.market || 'US').toUpperCase();
        let rate = 1;
        if (m === 'HK') rate = marketConstants.exg_rate;
        else if (m === 'SG') rate = marketConstants.sg_exg;
        else if (['AUD', 'AUS'].includes(m)) rate = marketConstants.aud_exg;
        
        const pnlUsd = rate !== 0 ? p.realizedPnL / rate : 0;

        if (pnlUsd > 0) {
            totalWinUsd += pnlUsd;
            winCount++;
            winValues.push(pnlUsd);
        } else if (pnlUsd < 0) {
            totalLossUsd += pnlUsd;
            lossCount++;
            lossValues.push(pnlUsd);
        }
    });

    const totalTrades = winCount + lossCount;
    const localTotalPnlUsd = totalWinUsd + totalLossUsd;

    // Median Calculation
    const calculateMedian = (values: number[]) => {
        if (values.length === 0) return 0;
        values.sort((a, b) => a - b);
        const half = Math.floor(values.length / 2);
        if (values.length % 2) return values[half];
        return (values[half - 1] + values[half]) / 2.0;
    };

    const medianWin = calculateMedian(winValues);
    const medianLoss = calculateMedian(lossValues);

    const winnersLosers = Array.from(new Set(filteredPnlData.map(p => p.stock.toUpperCase()))).map(stock => {
      const stockTrades = filteredPnlData.filter(p => p.stock.toUpperCase() === stock);
      const totalStockPnl = stockTrades.reduce((acc, p) => acc + p.realizedPnL, 0);
      const mkt = stockTrades[0]?.market || 'US';
      const rate = mkt.toUpperCase() === 'HK' ? marketConstants.exg_rate : (mkt.toUpperCase() === 'SG' ? marketConstants.sg_exg : (['AUD', 'AUS'].includes(mkt.toUpperCase()) ? marketConstants.aud_exg : 1));
      return { stock, pnl: totalStockPnl / rate };
    }).sort((a, b) => b.pnl - a.pnl);

    // 3. Group 2 (Current Holdings) Calculation with Cost Basis
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

    // 4. Detailed Holdings Analysis (Fundamental Data)
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
      metrics: {
        totalPnlUsd: localTotalPnlUsd,
        totalTrades,
        winRate: totalTrades > 0 ? (winCount / totalTrades) * 100 : 0,
        profitFactor: Math.abs(totalLossUsd) > 0 ? totalWinUsd / Math.abs(totalLossUsd) : (totalWinUsd > 0 ? Infinity : 0),
        avgPnl: totalTrades > 0 ? localTotalPnlUsd / totalTrades : 0,
        totalPortfolioMv: grandTotalPortfolio,
        allWinners: winnersLosers.filter(s => s.pnl > 0),
        allLosers: winnersLosers.slice().reverse().filter(s => s.pnl < 0),
        
        // Detailed Win/Loss
        winCount,
        lossCount,
        totalWinUsd,
        totalLossUsd,
        avgWin: winCount > 0 ? totalWinUsd / winCount : 0,
        avgLoss: lossCount > 0 ? totalLossUsd / lossCount : 0,
        medianWin,
        medianLoss
      },
      group1: {
        hk: analysis.g1Hk,
        nonHk: analysis.g1NonHk
      },
      group2: {
        hk: hkHoldings,
        ccs: ccsHoldings,
        us: usHoldings,
        aus: ausHoldings
      },
      holdingsSummary,
      rawDetailedHoldings: detailedHoldings
    };
  }, [pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition, startDate, endDate]);

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
          holdingsPct: metrics.totalPortfolioMv ? (totalMvForAvg / metrics.totalPortfolioMv) * 100 : 0,
          count: calculationHoldings.length
      };

      return { filteredHoldings: filtered, weightedAvgs: avgs };
  }, [rawDetailedHoldings, filterType, filterCategory, filterClass, excludedTickers, marketConstants.date, metrics.totalPortfolioMv]);

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

  const MetricCard = ({ title, value, subValue, icon: Icon, colorClass }: any) => (
    <div className="bg-white px-4 py-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${colorClass.includes('red') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{title}</p>
        <h3 className={`text-xl font-black truncate leading-tight ${colorClass}`}>{value}</h3>
        {subValue && <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{subValue}</p>}
      </div>
    </div>
  );

  const formatPrice = (val: number) => {
      if (isNaN(val)) return '0.00';
      return Math.abs(val) < 1 && Math.abs(val) > 0 
        ? val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) 
        : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const Group2Table = ({ title, data, displayCurrency }: { title: string, data: any[], displayCurrency: string }) => {
    // Calculate Totals for Subtotal Row
    const totalCost = data.reduce((acc, r) => acc + r.totalCost, 0);
    const totalLastMv = data.reduce((acc, r) => acc + r.lastMv, 0);
    const totalRealizedPnl = data.reduce((acc, r) => acc + r.realizedPnl, 0);
    const totalPnl = data.reduce((acc, r) => acc + r.pnl, 0);
    const totalMvPct = data.reduce((acc, r) => acc + r.mvPct, 0);
    const totalPnlPct = totalCost !== 0 ? (totalPnl / totalCost) * 100 : 0;

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-blue-50/20">
          <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs uppercase tracking-tight">
            <Briefcase size={14} className="text-blue-500" /> {title} (USD for Totals/P&L)
          </h3>
          <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{data.length} HOLDINGS</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-[11px] table-fixed border-collapse">
            <thead className="bg-slate-100/80 sticky top-0 z-10">
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b align-bottom">
                <th className="py-2 px-3 w-20 sticky left-0 bg-slate-100 z-20 border-r text-left">Stock</th>
                <th className="py-2 px-3 w-40 text-left">Name</th>
                <th className="py-2 px-3 w-20 text-right">Shares</th>
                <th className="py-2 px-3 w-32 text-right whitespace-normal leading-tight">Total Cost (USD)</th>
                <th className="py-2 px-3 w-28 text-right whitespace-normal leading-tight">Avg Cost ({displayCurrency})</th>
                <th className="py-2 px-3 w-28 text-right whitespace-normal leading-tight">Actual Cost ({displayCurrency})</th>
                <th className="py-2 px-3 w-24 text-right whitespace-normal leading-tight">Last Price ({displayCurrency})</th>
                <th className="py-2 px-3 w-32 text-right whitespace-normal leading-tight">Last MV (USD)</th>
                <th className="py-2 px-3 w-28 text-right whitespace-normal leading-tight">Realized P&L (USD)</th>
                <th className="py-2 px-3 w-28 text-right whitespace-normal leading-tight">P&L (USD)</th>
                <th className="py-2 px-3 w-20 text-right">P&L %</th>
                <th className="py-2 px-3 w-20 text-right">MV %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map(row => (
                <tr key={row.stock} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-1.5 px-3 font-black text-blue-600 sticky left-0 bg-white z-10 border-r group-hover:bg-slate-50">{row.stock}</td>
                  <td className="py-1.5 px-3 text-left font-bold text-slate-500 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[160px]" title={row.name}>{row.name}</td>
                  <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">{row.shares.toLocaleString()}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-slate-600 font-bold whitespace-nowrap">
                      ${row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-slate-600 font-bold whitespace-nowrap">
                      {displayCurrency === 'USD' ? '$' : ''}{formatPrice(row.avgCost)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-emerald-600 font-bold whitespace-nowrap">
                      {displayCurrency === 'USD' ? '$' : ''}{formatPrice(row.actualCost)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                      {displayCurrency === 'USD' ? '$' : ''}{formatPrice(row.lastPrice)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-black text-slate-800 whitespace-nowrap">
                      ${row.lastMv.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-black font-mono whitespace-nowrap ${row.realizedPnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {row.realizedPnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-black font-mono whitespace-nowrap ${row.pnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {row.pnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-black font-mono whitespace-nowrap ${row.pnlPct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {row.pnlPct.toFixed(2)}%
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                      {row.mvPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
              {/* SUBTOTAL ROW */}
              <tr className="bg-slate-100/70 border-t-2 border-slate-200 font-bold">
                  <td className="py-2 px-3 sticky left-0 bg-slate-100/70 z-10 border-r font-black text-slate-700 uppercase tracking-wider">Subtotal</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">-</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">-</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-800">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">-</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">-</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">-</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-800">${totalLastMv.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                  <td className={`py-2 px-3 text-right font-black font-mono ${totalRealizedPnl >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totalRealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                  <td className={`py-2 px-3 text-right font-black font-mono ${totalPnl >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totalPnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                  <td className={`py-2 px-3 text-right font-black font-mono ${totalPnlPct >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{totalPnlPct.toFixed(2)}%</td>
                  <td className="py-2 px-3 text-right font-black font-mono text-slate-700">{totalMvPct.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const ResizableHeader = ({ label, field }: { label: string, field: string }) => (
    <th 
        className={`py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-r relative select-none ${['select', 'date', 'ticker'].includes(field) ? 'sticky z-20 bg-slate-50' : ''}`} 
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

  const displayWinners = isWinnersExpanded ? metrics.allWinners : metrics.allWinners.slice(0, 5);
  const displayLosers = isLosersExpanded ? metrics.allLosers : metrics.allLosers.slice(0, 5);
  const dateStr = marketConstants.date.replace(/-/g, '');
  const getPct = (val: number, total: number) => total > 0 ? ((val/total)*100).toFixed(1) : '0.0';

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-1 space-y-8 pb-20">
      <section>
        <div className="flex flex-col gap-6 mb-8">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
                <BarChart3 className="text-white w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Portfolio Overview</h2>
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
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.ccs, metrics.totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-purple-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.ccs, metrics.totalPortfolioMv)}%` }}></div>
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
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.us, metrics.totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.us, metrics.totalPortfolioMv)}%` }}></div>
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
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.aus, metrics.totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.aus, metrics.totalPortfolioMv)}%` }}></div>
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
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(holdingsSummary.hk, metrics.totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(holdingsSummary.hk, metrics.totalPortfolioMv)}%` }}></div>
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
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(optionPosition, metrics.totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-orange-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(optionPosition, metrics.totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>

                  {/* 6. Cash */}
                  <div className="group">
                      <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></div>
                              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Cash Position</span>
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
                              <span className="text-[10px] font-bold text-slate-400 w-9 text-right">{getPct(cashPosition, metrics.totalPortfolioMv)}%</span>
                          </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${getPct(cashPosition, metrics.totalPortfolioMv)}%` }}></div>
                      </div>
                  </div>
              </div>
              
              {/* 7. Total */}
              <div className="bg-slate-50 p-6 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Portfolio (USD)</span>
                      <span className="text-3xl font-black text-slate-800 tracking-tight leading-none" title={metrics.totalPortfolioMv.toLocaleString()}>
                        ${Math.round(metrics.totalPortfolioMv).toLocaleString()}
                      </span>
                  </div>
              </div>
           </div>
        </div>

        <div className="flex justify-end mb-4">
             <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase flex items-center gap-1 px-2"><Calendar size={14} /> Stats Period:</span>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-xs font-bold border border-slate-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"/>
                  <span className="text-slate-300 font-bold">-</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-xs font-bold border border-slate-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"/>
             </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <MetricCard title="Net Realized P&L" value={`$${Math.abs(metrics.totalPnlUsd).toLocaleString()}`} icon={DollarSign} colorClass={metrics.totalPnlUsd >= 0 ? 'text-red-500' : 'text-emerald-500'} />
          <MetricCard title="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} subValue={`${metrics.totalTrades} Trades`} icon={Target} colorClass="text-blue-600" />
          <MetricCard title="Profit Factor" value={metrics.profitFactor.toFixed(2)} icon={Activity} colorClass="text-blue-600" />
          <MetricCard title="Avg P&L" value={`$${metrics.avgPnl.toFixed(2)}`} icon={PieChart} colorClass="text-purple-600" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
           <MetricCard title="Total Win (Profit)" value={`$${metrics.totalWinUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} subValue={`${metrics.winCount} Trades`} icon={TrendingUp} colorClass="text-red-500" />
           <MetricCard title="Average Profit" value={`$${metrics.avgWin.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} icon={BarChart3} colorClass="text-red-500" />
           <MetricCard title="Median Profit" value={`$${metrics.medianWin.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} icon={Activity} colorClass="text-red-500" />
           
           <MetricCard title="Total Loss" value={`$${Math.abs(metrics.totalLossUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} subValue={`${metrics.lossCount} Trades`} icon={TrendingDown} colorClass="text-emerald-500" />
           <MetricCard title="Average Loss" value={`$${Math.abs(metrics.avgLoss).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} icon={BarChart3} colorClass="text-emerald-500" />
           <MetricCard title="Median Loss" value={`$${Math.abs(metrics.medianLoss).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} icon={Activity} colorClass="text-emerald-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => setIsWinnersExpanded(!isWinnersExpanded)}>
              <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs uppercase tracking-tight">
                <TrendingUp className="text-red-500" size={16} /> Top Winners
              </h3>
              <div className="text-[10px] font-black text-blue-600">{isWinnersExpanded ? 'COLLAPSE' : `VIEW ALL (${metrics.allWinners.length})`}</div>
            </div>
            <div className={`overflow-y-auto ${isWinnersExpanded ? 'max-h-[500px]' : 'max-h-[250px]'} transition-all`}>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y">
                  {displayWinners.map((s, i) => (
                    <tr key={s.stock} className="hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-5 py-3 font-black">{s.stock}</td>
                      <td className="px-5 py-3 text-right font-black text-red-500">+${s.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => setIsLosersExpanded(!isLosersExpanded)}>
              <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs uppercase tracking-tight">
                <TrendingDown className="text-emerald-500" size={16} /> Top Losers
              </h3>
              <div className="text-[10px] font-black text-blue-600">{isLosersExpanded ? 'COLLAPSE' : `VIEW ALL (${metrics.allLosers.length})`}</div>
            </div>
            <div className={`overflow-y-auto ${isLosersExpanded ? 'max-h-[500px]' : 'max-h-[250px]'} transition-all`}>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y">
                  {displayLosers.map((s, i) => (
                    <tr key={s.stock} className="hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-5 py-3 font-black">{s.stock}</td>
                      <td className="px-5 py-3 text-right font-black text-emerald-500">-${Math.abs(s.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <div className="overflow-x-auto custom-scrollbar max-h-[500px]">
                <table className="w-full text-left text-[11px] whitespace-nowrap table-fixed border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
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
                            <ResizableHeader label="ROE" field="roe" />
                            <ResizableHeader label="PS" field="ps" />
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
                        <span className="text-[9px] font-bold text-slate-400 uppercase">ROE Avg</span>
                        <span className="font-mono font-bold text-sm text-slate-700">{weightedAvgs.roe.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">PS Avg</span>
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

      <div className="relative">
        <section className="mt-12">
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-800 uppercase">Current Holdings</h2>
          </div>
          <Group2Table title="HK Holdings" data={group2.hk} displayCurrency="HKD" />
          <Group2Table title="CCS Holdings" data={group2.ccs} displayCurrency="USD" />
          <Group2Table title="US Stocks" data={group2.us} displayCurrency="USD" />
          <Group2Table title="AUS Holdings" data={group2.aus} displayCurrency="USD" />
        </section>
      </div>
    </div>
  );
};

export default SummaryDashboard;
