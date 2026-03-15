
import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine, Treemap
} from 'recharts';
import {
  Info, TrendingUp, TrendingDown, Activity, BarChart3,
  PieChart as PieChartIcon, Target, Zap, Award, Clock,
  Upload, X, ChevronDown, ChevronUp, Layers, Archive, Calendar
} from 'lucide-react';
import { PnLData, TransactionData, LookupSheetData, MarketConstants, NavData } from '../types';
import { calculatePortfolioAnalysis } from '../services/excelService';

interface AnalyticsDashboardProps {
  pnlData: PnLData[];
  transactions: TransactionData[];
  lookupData: LookupSheetData | null;
  marketConstants: MarketConstants;
  navData: NavData[];
  cashPosition: number;
  optionPosition: number;
  benchmarkNav: { date: string; value: number }[];
  onBenchmarkUpload: (csv: string) => void;
}

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#84cc16', '#f97316'];

const getRate = (market: string, mc: MarketConstants) => {
  const m = (market || '').toUpperCase().trim();
  if (m === 'HK') return mc.exg_rate;
  if (m === 'SG') return mc.sg_exg;
  if (m === 'AUS' || m === 'AUD') return mc.aud_exg;
  return 1;
};

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block ml-1">
      <Info
        size={13}
        className="text-slate-400 hover:text-slate-600 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div className="absolute z-50 left-0 top-5 w-64 p-2.5 bg-slate-800 text-white text-xs rounded-lg shadow-xl leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
};

const SectionHeader: React.FC<{ title: string; info: string; icon?: React.ReactNode }> = ({ title, info, icon }) => (
  <div className="flex items-center gap-2 mb-3">
    {icon && <span className="text-slate-500">{icon}</span>}
    <h3 className="font-semibold text-slate-700 text-sm">{title}</h3>
    <InfoTooltip text={info} />
  </div>
);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ${className}`}>
    {children}
  </div>
);

const DateRangePicker: React.FC<{ start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void }> = ({ start, end, onStart, onEnd }) => (
  <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm self-end">
    <Calendar size={12} className="text-slate-400" />
    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Period:</span>
    <input type="date" value={start} onChange={e => onStart(e.target.value)} className="text-xs font-bold border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50" />
    <span className="text-slate-300 font-bold text-xs">–</span>
    <input type="date" value={end} onChange={e => onEnd(e.target.value)} className="text-xs font-bold border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50" />
  </div>
);

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  pnlData,
  transactions,
  lookupData,
  marketConstants,
  navData,
  cashPosition,
  optionPosition,
  benchmarkNav,
  onBenchmarkUpload,
}) => {
  const [activeTab, setActiveTab] = useState<'pnl' | 'trades' | 'stocks' | 'portfolio' | 'benchmark'>('pnl');
  const [concentrationThreshold, setConcentrationThreshold] = useState(10);
  const [isWinnersExpanded, setIsWinnersExpanded] = useState(false);
  const [isLosersExpanded, setIsLosersExpanded] = useState(false);

  // ── Per-tab date range state ──────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const [pnlStart, setPnlStart] = useState('');
  const [pnlEnd, setPnlEnd] = useState(today);
  const [tradesStart, setTradesStart] = useState('');
  const [tradesEnd, setTradesEnd] = useState(today);
  const [stocksStart, setStocksStart] = useState('');
  const [stocksEnd, setStocksEnd] = useState(today);
  const [portfolioStart, setPortfolioStart] = useState('');
  const [portfolioEnd, setPortfolioEnd] = useState(today);
  const [benchmarkStart, setBenchmarkStart] = useState('');
  const [benchmarkEnd, setBenchmarkEnd] = useState(today);

  // Initialize start dates from earliest pnlData
  useEffect(() => {
    if (!pnlData.length) return;
    const earliest = pnlData.map(p => p.sellDate).filter(Boolean).sort()[0] || '2020-01-01';
    setPnlStart(s => s || earliest);
    setTradesStart(s => s || earliest);
    setStocksStart(s => s || earliest);
    setPortfolioStart(s => s || earliest);
    setBenchmarkStart(s => s || earliest);
  }, [pnlData]);

  // ── Per-tab filtered data ──────────────────────────────────────────────────────
  const pnlFiltered = useMemo(() =>
    pnlData.filter(p => p.sellDate && (!pnlStart || p.sellDate >= pnlStart) && p.sellDate <= pnlEnd),
    [pnlData, pnlStart, pnlEnd]);

  const tradesFiltered = useMemo(() =>
    pnlData.filter(p => p.sellDate && (!tradesStart || p.sellDate >= tradesStart) && p.sellDate <= tradesEnd),
    [pnlData, tradesStart, tradesEnd]);

  const stocksFiltered = useMemo(() =>
    pnlData.filter(p => p.sellDate && (!stocksStart || p.sellDate >= stocksStart) && p.sellDate <= stocksEnd),
    [pnlData, stocksStart, stocksEnd]);

  const portfolioFiltered = useMemo(() =>
    pnlData.filter(p => p.sellDate && (!portfolioStart || p.sellDate >= portfolioStart) && p.sellDate <= portfolioEnd),
    [pnlData, portfolioStart, portfolioEnd]);

  // ── pnlMetrics ──────────────────────────────────────────────────────────────
  const pnlMetrics = useMemo(() => {
    const filtered = pnlFiltered;
    const wins: number[] = [], losses: number[] = [];
    filtered.forEach(p => {
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      if (usd >= 0) wins.push(usd); else losses.push(usd);
    });
    const totalPnl = [...wins, ...losses].reduce((a, b) => a + b, 0);
    const winRate = filtered.length > 0 ? (wins.length / filtered.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const profitFactor =
      Math.abs(losses.reduce((a, b) => a + b, 0)) > 0
        ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0))
        : 0;
    const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
    const median = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = sorted(arr);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    return {
      wins,
      losses,
      totalPnl,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      totalWin: wins.reduce((a, b) => a + b, 0),
      totalLoss: losses.reduce((a, b) => a + b, 0),
      medianWin: median(wins),
      medianLoss: median(losses),
      totalTrades: filtered.length,
    };
  }, [pnlFiltered, marketConstants]);

  // ── cumulativeData ───────────────────────────────────────────────────────────
  const cumulativeData = useMemo(() => {
    const sorted = [...pnlFiltered]
      .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());
    let cum = 0, peak = 0;
    return sorted.map(p => {
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      cum += usd;
      peak = Math.max(peak, cum);
      const drawdown = peak > 0 ? ((cum - peak) / peak) * 100 : 0;
      return {
        date: p.sellDate.substring(0, 7),
        pnl: Math.round(cum),
        drawdown: Math.round(drawdown * 100) / 100,
        dailyPnl: Math.round(usd),
      };
    });
  }, [pnlFiltered, marketConstants]);

  // ── monthlyHeatmap ───────────────────────────────────────────────────────────
  const monthlyHeatmap = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    pnlFiltered.forEach(p => {
      if (!p.sellDate) return;
      const key = p.sellDate.substring(0, 7);
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      const cur = map.get(key) || { total: 0, count: 0 };
      map.set(key, { total: cur.total + usd, count: cur.count + 1 });
    });
    // Compute annual totals for % contribution per month
    const annualTotals = new Map<string, number>();
    map.forEach((v, k) => {
      const yr = k.substring(0, 4);
      annualTotals.set(yr, (annualTotals.get(yr) || 0) + v.total);
    });
    const result = new Map<string, { total: number; count: number; pct: number }>();
    map.forEach((v, k) => {
      const yr = k.substring(0, 4);
      const yrTotal = annualTotals.get(yr) || 0;
      result.set(k, { ...v, pct: yrTotal !== 0 ? (v.total / Math.abs(yrTotal)) * 100 : 0 });
    });
    return result;
  }, [pnlFiltered, marketConstants]);

  // ── returnBuckets ────────────────────────────────────────────────────────────
  const returnBuckets = useMemo(() => {
    const buckets = [
      { range: '≤-50%', min: -Infinity, max: -50, count: 0 },
      { range: '-50 to -20%', min: -50, max: -20, count: 0 },
      { range: '-20 to -10%', min: -20, max: -10, count: 0 },
      { range: '-10 to 0%', min: -10, max: 0, count: 0 },
      { range: '0 to 10%', min: 0, max: 10, count: 0 },
      { range: '10 to 20%', min: 10, max: 20, count: 0 },
      { range: '20 to 50%', min: 20, max: 50, count: 0 },
      { range: '>50%', min: 50, max: Infinity, count: 0 },
    ];
    tradesFiltered.forEach(p => {
      const r = p.returnPercent || 0;
      const b = buckets.find(b => r >= b.min && r < b.max) || buckets[buckets.length - 1];
      b.count++;
    });
    return buckets;
  }, [tradesFiltered]);

  // ── pnlByDimension ───────────────────────────────────────────────────────────
  const pnlByDimension = useMemo(() => {
    const stockMap = new Map<string, { type: string; category: string; class: string }>();
    (lookupData?.stocks || []).forEach(s =>
      stockMap.set(s.ticker.toUpperCase(), {
        type: s.type || 'Other',
        category: s.category || 'Other',
        class: s.class || 'Other',
      })
    );
    const byType = new Map<string, number>(),
      byCategory = new Map<string, number>(),
      byClass = new Map<string, number>();
    tradesFiltered.forEach(p => {
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      const info = stockMap.get(p.stock.toUpperCase()) || { type: 'Other', category: 'Other', class: 'Other' };
      byType.set(info.type, (byType.get(info.type) || 0) + usd);
      byCategory.set(info.category, (byCategory.get(info.category) || 0) + usd);
      byClass.set(info.class, (byClass.get(info.class) || 0) + usd);
    });
    const toArr = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value);
    return { byType: toArr(byType), byCategory: toArr(byCategory), byClass: toArr(byClass) };
  }, [tradesFiltered, lookupData, marketConstants]);

  // ── streakData ───────────────────────────────────────────────────────────────
  const streakData = useMemo(() => {
    const sorted = [...tradesFiltered]
      .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());
    let curStreak = 0, maxWin = 0, maxLoss = 0;
    const data = sorted.map(p => {
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      const isWin = usd >= 0;
      if (isWin) {
        curStreak = curStreak >= 0 ? curStreak + 1 : 1;
        maxWin = Math.max(maxWin, curStreak);
      } else {
        curStreak = curStreak <= 0 ? curStreak - 1 : -1;
        maxLoss = Math.max(maxLoss, -curStreak);
      }
      return { date: p.sellDate.substring(0, 7), pnl: Math.round(Math.abs(usd)), isWin, streak: curStreak };
    });
    return { data, currentStreak: curStreak, maxWin, maxLoss };
  }, [tradesFiltered, marketConstants]);

  // ── holdingOutcome ───────────────────────────────────────────────────────────
  const holdingOutcome = useMemo(() => {
    const wins = tradesFiltered.filter(p => (p.holdingDays || 0) > 0 && p.realizedPnL > 0).map(p => p.holdingDays || 0);
    const losses = tradesFiltered.filter(p => (p.holdingDays || 0) > 0 && p.realizedPnL <= 0).map(p => p.holdingDays || 0);
    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
    const med = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    return [
      { category: 'Winning Trades', avg: avg(wins), median: med(wins) },
      { category: 'Losing Trades', avg: avg(losses), median: med(losses) },
    ];
  }, [tradesFiltered]);

  // ── holdingDistribution ──────────────────────────────────────────────────────
  const holdingDistribution = useMemo(() => {
    const buckets = [
      { range: '0-7d', count: 0 },
      { range: '8-30d', count: 0 },
      { range: '1-3mo', count: 0 },
      { range: '3-6mo', count: 0 },
      { range: '6-12mo', count: 0 },
      { range: '>1yr', count: 0 },
    ];
    portfolioFiltered.forEach(p => {
      const d = p.holdingDays || 0;
      if (d <= 7) buckets[0].count++;
      else if (d <= 30) buckets[1].count++;
      else if (d <= 90) buckets[2].count++;
      else if (d <= 180) buckets[3].count++;
      else if (d <= 365) buckets[4].count++;
      else buckets[5].count++;
    });
    return buckets;
  }, [portfolioFiltered]);

  // ── stockStats ───────────────────────────────────────────────────────────────
  const stockStats = useMemo(() => {
    const stats = new Map<string, { count: number; wins: number; totalPnl: number }>();
    stocksFiltered.forEach(p => {
      const key = p.stock.toUpperCase();
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      const cur = stats.get(key) || { count: 0, wins: 0, totalPnl: 0 };
      cur.count++;
      if (usd > 0) cur.wins++;
      cur.totalPnl += usd;
      stats.set(key, cur);
    });
    return Array.from(stats.entries())
      .map(([stock, s]) => ({
        stock,
        count: s.count,
        wins: s.wins,
        losses: s.count - s.wins,
        winRate: Math.round((s.wins / s.count) * 100),
        avgPnl: Math.round(s.totalPnl / s.count),
        totalPnl: Math.round(s.totalPnl),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [stocksFiltered, marketConstants]);

  // ── expectancyMetrics ────────────────────────────────────────────────────────
  const expectancyMetrics = useMemo(() => {
    const wins = portfolioFiltered.filter(p => p.realizedPnL > 0);
    const losses = portfolioFiltered.filter(p => p.realizedPnL <= 0);
    const total = portfolioFiltered.length;
    if (total === 0)
      return { winRate: 0, lossRate: 0, avgWin: 0, avgLoss: 0, expectancy: 0, kelly: 0, halfKelly: 0 };
    const getUsd = (p: PnLData) => p.realizedPnL / getRate(p.market || '', marketConstants);
    const avgWin = wins.length ? wins.map(getUsd).reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.map(getUsd).reduce((a, b) => a + b, 0) / losses.length) : 0;
    const winRate = wins.length / total;
    const lossRate = losses.length / total;
    const expectancy = winRate * avgWin - lossRate * avgLoss;
    const kelly = avgLoss > 0 ? (winRate - lossRate / (avgWin / avgLoss)) * 100 : 0;
    return { winRate: winRate * 100, lossRate: lossRate * 100, avgWin, avgLoss, expectancy, kelly, halfKelly: kelly / 2 };
  }, [portfolioFiltered, marketConstants]);

  // ── topWinnersLosers ─────────────────────────────────────────────────────────
  const topWinnersLosers = useMemo(() => {
    const byStock = new Map<string, { stock: string; pnl: number }>();
    pnlFiltered.forEach(p => {
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      const cur = byStock.get(p.stock) || { stock: p.stock, pnl: 0 };
      cur.pnl += usd;
      byStock.set(p.stock, cur);
    });
    const arr = Array.from(byStock.values()).sort((a, b) => b.pnl - a.pnl);
    return { winners: arr.filter(x => x.pnl > 0), losers: arr.filter(x => x.pnl < 0).reverse() };
  }, [pnlFiltered, marketConstants]);

  // ── currentHoldings (position age) ───────────────────────────────────────────
  const currentHoldings = useMemo(() => {
    const positionAge = new Map<string, string>();
    transactions
      .filter(t => t.action?.toLowerCase().includes('buy'))
      .forEach(t => {
        const key = t.stock.toUpperCase();
        if (!positionAge.has(key) || t.date < positionAge.get(key)!) positionAge.set(key, t.date);
      });
    return positionAge;
  }, [transactions]);

  // ── portfolioAnalysis ─────────────────────────────────────────────────────────
  const portfolioAnalysis = useMemo(() => {
    return calculatePortfolioAnalysis(pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition);
  }, [pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition]);

  // ── group2 data for portfolio tab ─────────────────────────────────────────────
  const group2Data = useMemo(() => {
    const all = [
      ...(portfolioAnalysis.g2Hk || []).map((h: any) => ({ ...h, _display: 'HKD' })),
      ...(portfolioAnalysis.g2Ccs || []).map((h: any) => ({ ...h, _display: 'USD' })),
      ...(portfolioAnalysis.g2Us || []).map((h: any) => ({ ...h, _display: 'USD' })),
    ];
    return all;
  }, [portfolioAnalysis]);

  // ── scatter data for cost vs price ────────────────────────────────────────────
  const scatterData = useMemo(() => {
    return group2Data
      .filter((h: any) => (h.LastMV || 0) > 0)
      .map((h: any) => ({
        name: h.Stock,
        cost: h.AvgCost,
        price: h.LastPrice,
        mv: h.LastMV,
        pnlPct: (h.PnLPct || 0) * 100,
      }));
  }, [group2Data]);

  const scatterMin = scatterData.length ? Math.min(...scatterData.map((d: any) => Math.min(d.cost, d.price))) * 0.9 : 0;
  const scatterMax = scatterData.length ? Math.max(...scatterData.map((d: any) => Math.max(d.cost, d.price))) * 1.1 : 100;

  // ── normalizedNav ─────────────────────────────────────────────────────────────
  const normalizedNav = useMemo(() => {
    if (!navData.length || !benchmarkNav.length) return [];
    const navSorted = [...navData].sort((a, b) => a.date.localeCompare(b.date));
    const benchSorted = [...benchmarkNav].sort((a, b) => a.date.localeCompare(b.date));
    const startDate = navSorted[0].date;
    const navBase = navSorted[0].nav2 || navSorted[0].nav1 || 1;
    const benchAtStart = benchSorted.find(b => b.date >= startDate);
    if (!benchAtStart) return [];
    const benchBase = benchAtStart.value;
    const benchMap = new Map(benchSorted.map(b => [b.date, b.value]));
    return navSorted
      .map(n => {
        const benchVal = benchMap.get(n.date);
        return {
          date: n.date,
          portfolio: Math.round(((n.nav2 || n.nav1 || navBase) / navBase) * 100 * 100) / 100,
          benchmark: benchVal ? Math.round((benchVal / benchBase) * 100 * 100) / 100 : null,
        };
      })
      .filter(x => x.benchmark !== null);
  }, [navData, benchmarkNav]);

  // ── Heatmap helpers ───────────────────────────────────────────────────────────
  const heatmapYears = [...new Set([...monthlyHeatmap.keys()].map(k => k.substring(0, 4)))].sort();
  const heatmapMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const maxAbsHeat = Math.max(...[...monthlyHeatmap.values()].map(v => Math.abs(v.total)), 1);
  const heatColor = (val: number) => {
    if (!val) return '#f1f5f9';
    const intensity = Math.min(Math.abs(val) / maxAbsHeat, 1);
    if (val > 0) return `rgba(16,185,129,${0.15 + intensity * 0.75})`;
    return `rgba(239,68,68,${0.15 + intensity * 0.75})`;
  };

  // ── P&L by dimension aggregation for donut charts ─────────────────────────────
  const portfolioByClass = useMemo(() => {
    const m = new Map<string, number>();
    group2Data.forEach((h: any) => {
      const lookup = lookupData?.stocks.find(s => s.ticker.toUpperCase() === (h.Stock || '').toUpperCase());
      const cls = lookup?.class || 'Other';
      m.set(cls, (m.get(cls) || 0) + (h.LastMV || 0));
    });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).filter(x => x.value > 0);
  }, [group2Data, lookupData]);

  const portfolioByType = useMemo(() => {
    const m = new Map<string, number>();
    group2Data.forEach((h: any) => {
      const lookup = lookupData?.stocks.find(s => s.ticker.toUpperCase() === (h.Stock || '').toUpperCase());
      const tp = lookup?.type || 'Other';
      m.set(tp, (m.get(tp) || 0) + (h.LastMV || 0));
    });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value: Math.round(value) })).filter(x => x.value > 0);
  }, [group2Data, lookupData]);

  const daysSince = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return `${d}d`;
  };

  const fmtUsd = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString()}`;
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  const displayWinners = isWinnersExpanded ? topWinnersLosers.winners : topWinnersLosers.winners.slice(0, 5);
  const displayLosers = isLosersExpanded ? topWinnersLosers.losers : topWinnersLosers.losers.slice(0, 5);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-slate-200 bg-white">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Activity size={20} className="text-blue-600" /> Analytics
        </h2>
        <div className="flex gap-1 mt-3">
          {(['pnl', 'trades', 'stocks', 'portfolio', 'benchmark'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab === 'pnl' ? 'P&L' : tab === 'trades' ? 'Trades' : tab === 'stocks' ? 'Stocks' : tab === 'portfolio' ? 'Portfolio' : 'Benchmark'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

        {/* ══════════════════════════════════ P&L TAB ══════════════════════════════════ */}
        {activeTab === 'pnl' && (
          <>
            <DateRangePicker start={pnlStart} end={pnlEnd} onStart={setPnlStart} onEnd={setPnlEnd} />

            {/* 4 top metric cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Realized P&L</p>
                  <InfoTooltip text="Total realized profit/loss from all closed trades, converted to USD." />
                </div>
                <p className={`text-xl font-black ${pnlMetrics.totalPnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  ${Math.abs(pnlMetrics.totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Win Rate</p>
                  <InfoTooltip text="% of trades that closed profitably. e.g. 70% means 7 out of 10 trades were winners." />
                </div>
                <p className="text-xl font-black text-blue-600">{pnlMetrics.winRate.toFixed(1)}%</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{pnlMetrics.totalTrades} Trades</p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profit Factor</p>
                  <InfoTooltip text="Total profit ÷ total loss (absolute). Above 1.5 is solid; above 2.0 is excellent." />
                </div>
                <p className="text-xl font-black text-blue-600">{pnlMetrics.profitFactor.toFixed(2)}</p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg P&L / Trade</p>
                  <InfoTooltip text="Average profit or loss per trade (Net P&L ÷ total trades). Positive = net edge per trade." />
                </div>
                <p className={`text-xl font-black ${(pnlMetrics.totalPnl / Math.max(pnlMetrics.totalTrades, 1)) >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  ${(pnlMetrics.totalPnl / Math.max(pnlMetrics.totalTrades, 1)).toFixed(2)}
                </p>
              </Card>
            </div>

            {/* 6 detail cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Win (Profit)</p>
                  <InfoTooltip text="Sum of all profitable closed trades in USD." />
                </div>
                <p className="text-xl font-black text-red-500">{fmtUsd(pnlMetrics.totalWin)}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{pnlMetrics.wins.length} Trades</p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Profit</p>
                  <InfoTooltip text="Average P&L of winning trades (Total Win ÷ Win Count)." />
                </div>
                <p className="text-xl font-black text-red-500">{fmtUsd(pnlMetrics.avgWin)}</p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Median Profit</p>
                  <InfoTooltip text="Middle value of winning trades' P&L. Less skewed by outliers than the average." />
                </div>
                <p className="text-xl font-black text-red-500">{fmtUsd(pnlMetrics.medianWin)}</p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Loss</p>
                  <InfoTooltip text="Sum of all losing closed trades in USD (shown as positive)." />
                </div>
                <p className="text-xl font-black text-emerald-500">{fmtUsd(pnlMetrics.totalLoss)}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{pnlMetrics.losses.length} Trades</p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Loss</p>
                  <InfoTooltip text="Average magnitude of losing trades (Total Loss ÷ Loss Count)." />
                </div>
                <p className="text-xl font-black text-emerald-500">{fmtUsd(pnlMetrics.avgLoss)}</p>
              </Card>
              <Card>
                <div className="flex items-center mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Median Loss</p>
                  <InfoTooltip text="Middle value of losing trades' magnitude. More robust than average to outlier losses." />
                </div>
                <p className="text-xl font-black text-emerald-500">{fmtUsd(pnlMetrics.medianLoss)}</p>
              </Card>
            </div>

            {/* Top Winners / Top Losers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="!p-0 overflow-hidden">
                <div
                  className="p-4 border-b flex items-center justify-between cursor-pointer hover:bg-slate-50"
                  onClick={() => setIsWinnersExpanded(!isWinnersExpanded)}
                >
                  <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs uppercase tracking-tight">
                    <TrendingUp className="text-red-500" size={16} /> Top Winners
                  </h3>
                  <div className="flex items-center gap-1 text-[10px] font-black text-blue-600">
                    {isWinnersExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {isWinnersExpanded ? 'COLLAPSE' : `VIEW ALL (${topWinnersLosers.winners.length})`}
                  </div>
                </div>
                <div className={`overflow-y-auto ${isWinnersExpanded ? 'max-h-[400px]' : 'max-h-[220px]'} transition-all`}>
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y">
                      {displayWinners.map((s, i) => (
                        <tr key={s.stock} className="hover:bg-slate-50">
                          <td className="px-5 py-2.5 text-slate-400">{i + 1}</td>
                          <td className="px-5 py-2.5 font-black">{s.stock}</td>
                          <td className="px-5 py-2.5 text-right font-black text-red-500">
                            +${s.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="!p-0 overflow-hidden">
                <div
                  className="p-4 border-b flex items-center justify-between cursor-pointer hover:bg-slate-50"
                  onClick={() => setIsLosersExpanded(!isLosersExpanded)}
                >
                  <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs uppercase tracking-tight">
                    <TrendingDown className="text-emerald-500" size={16} /> Top Losers
                  </h3>
                  <div className="flex items-center gap-1 text-[10px] font-black text-blue-600">
                    {isLosersExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {isLosersExpanded ? 'COLLAPSE' : `VIEW ALL (${topWinnersLosers.losers.length})`}
                  </div>
                </div>
                <div className={`overflow-y-auto ${isLosersExpanded ? 'max-h-[400px]' : 'max-h-[220px]'} transition-all`}>
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y">
                      {displayLosers.map((s, i) => (
                        <tr key={s.stock} className="hover:bg-slate-50">
                          <td className="px-5 py-2.5 text-slate-400">{i + 1}</td>
                          <td className="px-5 py-2.5 font-black">{s.stock}</td>
                          <td className="px-5 py-2.5 text-right font-black text-emerald-500">
                            -${Math.abs(s.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* A1: Cumulative P&L + Drawdown */}
            <Card>
              <SectionHeader
                title="Cumulative P&L & Drawdown"
                info="Cumulative realized P&L in USD over time. The red area shows the drawdown from peak."
                icon={<TrendingUp size={16} />}
              />
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={cumulativeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={v => `$${v >= 1000 ? Math.round(v / 1000) + 'k' : v}`}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={v => `${v}%`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ payload, label }: any) => (
                      <div className="bg-white border border-slate-200 p-2 rounded shadow text-xs">
                        <p className="font-bold text-slate-700">{label}</p>
                        {payload?.map((e: any) => (
                          <p key={e.dataKey} style={{ color: e.color }}>
                            {e.name}: {e.dataKey === 'drawdown' ? `${e.value}%` : `$${e.value?.toLocaleString()}`}
                          </p>
                        ))}
                      </div>
                    )}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="pnl"
                    name="Cumulative P&L"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="drawdown"
                    name="Drawdown %"
                    stroke="#ef4444"
                    fill="#fecaca"
                    fillOpacity={0.6}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            {/* A2: Monthly Heatmap */}
            <Card>
              <SectionHeader
                title="Monthly P&L Heatmap"
                info="Each cell shows total P&L for that month. Green = profit, Red = loss. Darker = larger magnitude."
                icon={<BarChart3 size={16} />}
              />
              {heatmapYears.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No data available</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[600px]">
                    <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: 'auto repeat(12, 1fr)' }}>
                      <div />
                      {heatmapMonths.map(m => (
                        <div key={m} className="text-[9px] text-slate-400 text-center">{m}</div>
                      ))}
                    </div>
                    {heatmapYears.map(year => (
                      <div key={year} className="grid gap-1 mb-1" style={{ gridTemplateColumns: 'auto repeat(12, 1fr)' }}>
                        <div className="text-[9px] text-slate-500 flex items-center pr-2">{year}</div>
                        {heatmapMonths.map((_, mi) => {
                          const key = `${year}-${String(mi + 1).padStart(2, '0')}`;
                          const data = monthlyHeatmap.get(key);
                          const val = data?.total || 0;
                          return (
                            <div
                              key={mi}
                              title={data ? `${key}: $${Math.round(val).toLocaleString()} (${data.count} trades)` : key}
                              className="h-10 rounded cursor-default flex flex-col items-center justify-center text-[9px] font-bold leading-tight"
                              style={{
                                backgroundColor: heatColor(val),
                                color: Math.abs(val) / maxAbsHeat > 0.5 ? 'white' : '#374151',
                              }}
                            >
                              {data ? (
                                <>
                                  <span>{val > 0 ? '+' : ''}{Math.round(val / 1000)}k</span>
                                  <span className="text-[7px] opacity-80">{data.pct > 0 ? '+' : ''}{data.pct.toFixed(0)}%</span>
                                </>
                              ) : ''}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {/* ══════════════════════════════════ TRADES TAB ══════════════════════════════════ */}
        {activeTab === 'trades' && (
          <>
            <DateRangePicker start={tradesStart} end={tradesEnd} onStart={setTradesStart} onEnd={setTradesEnd} />
            {/* B1: Return Distribution */}
            <Card>
              <SectionHeader
                title="Return Distribution"
                info="Histogram of trade returns by percentage buckets. Shows the distribution of your wins and losses."
                icon={<BarChart3 size={16} />}
              />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={returnBuckets}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="range" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Trades" radius={[4, 4, 0, 0]}>
                    {returnBuckets.map((b, i) => (
                      <Cell key={i} fill={b.min >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* B2: P&L by Type / Category / Class */}
            <Card>
              <SectionHeader
                title="P&L by Dimension"
                info="Total realized P&L grouped by stock Type, Category, and Asset Class from your lookup data."
                icon={<Layers size={16} />}
              />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {[
                  { label: 'By Type', data: pnlByDimension.byType },
                  { label: 'By Category', data: pnlByDimension.byCategory },
                  { label: 'By Class', data: pnlByDimension.byClass },
                ].map(({ label, data }) => (
                  <div key={label}>
                    <p className="text-xs font-bold text-slate-500 mb-2">{label}</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `$${v >= 1000 ? Math.round(v / 1000) + 'k' : v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={70} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'P&L']} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {data.map((entry, i) => (
                            <Cell key={i} fill={entry.value >= 0 ? '#10b981' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            </Card>

            {/* B3: Win/Loss Streak */}
            <Card>
              <SectionHeader
                title="Win/Loss Streaks"
                info="Each bar represents a trade. Green = win, Red = loss. Height = absolute P&L size."
                icon={<Zap size={16} />}
              />
              <div className="grid grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'Current Streak', value: streakData.currentStreak > 0 ? `+${streakData.currentStreak}W` : streakData.currentStreak < 0 ? `${Math.abs(streakData.currentStreak)}L` : '0', color: streakData.currentStreak > 0 ? 'text-red-500' : streakData.currentStreak < 0 ? 'text-emerald-500' : 'text-slate-500' },
                  { label: 'Max Win Streak', value: `${streakData.maxWin}`, color: 'text-red-500' },
                  { label: 'Max Loss Streak', value: `${streakData.maxLoss}`, color: 'text-emerald-500' },
                  { label: 'Total Trades', value: `${pnlMetrics.totalTrades}`, color: 'text-slate-700' },
                ].map(c => (
                  <div key={c.label} className="text-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{c.label}</p>
                    <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={streakData.data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'P&L']} />
                  <Bar dataKey="pnl" name="P&L" radius={[2, 2, 0, 0]}>
                    {streakData.data.map((entry, i) => (
                      <Cell key={i} fill={entry.isWin ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* B4: Avg Holding by Outcome */}
            <Card>
              <SectionHeader
                title="Avg Holding Period by Outcome"
                info="Average and median holding days for winning vs losing trades. Helps identify if holding longer helps."
                icon={<Clock size={16} />}
              />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={holdingOutcome}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v}d`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => `${v} days`} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="avg" name="Avg Days" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar dataKey="median" name="Median Days" fill="#a78bfa" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════ STOCKS TAB ══════════════════════════════════ */}
        {activeTab === 'stocks' && (
          <>
            <DateRangePicker start={stocksStart} end={stocksEnd} onStart={setStocksStart} onEnd={setStocksEnd} />
          <Card>
            <SectionHeader
              title="Stock Frequency & Performance"
              info="Top 20 most traded stocks showing trade count, average P&L, and win rate."
              icon={<BarChart3 size={16} />}
            />
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={stockStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="stock" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10 }}
                  label={{ value: 'Trades', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => `$${v}`}
                />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  content={({ payload, label }: any) => (
                    <div className="bg-white border border-slate-200 p-2 rounded shadow text-xs">
                      <p className="font-bold text-slate-700">{label}</p>
                      {payload?.map((e: any) => (
                        <p key={e.dataKey} style={{ color: e.color }}>
                          {e.name}: {e.dataKey === 'winRate' ? `${e.value}%` : e.dataKey === 'avgPnl' ? `$${e.value}` : e.value}
                        </p>
                      ))}
                    </div>
                  )}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar yAxisId="left" dataKey="count" name="Trade Count" fill="#8b5cf6" barSize={18} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="avgPnl" name="Avg P&L ($)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="pct" type="monotone" dataKey="winRate" name="Win Rate (%)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b">
                    <th className="py-2 px-3">Stock</th>
                    <th className="py-2 px-3 text-right">Trades</th>
                    <th className="py-2 px-3 text-right">Wins</th>
                    <th className="py-2 px-3 text-right">Losses</th>
                    <th className="py-2 px-3 text-right">Win Rate</th>
                    <th className="py-2 px-3 text-right">Avg P&L</th>
                    <th className="py-2 px-3 text-right">Total P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockStats.map(s => (
                    <tr key={s.stock} className="hover:bg-slate-50">
                      <td className="py-1.5 px-3 font-black text-blue-600">{s.stock}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.count}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-red-500">{s.wins}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-emerald-500">{s.losses}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{s.winRate}%</td>
                      <td className={`py-1.5 px-3 text-right font-mono font-bold ${s.avgPnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        ${s.avgPnl.toLocaleString()}
                      </td>
                      <td className={`py-1.5 px-3 text-right font-mono font-bold ${s.totalPnl >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        ${s.totalPnl.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          </>
        )}

        {/* ══════════════════════════════════ PORTFOLIO TAB ══════════════════════════════════ */}
        {activeTab === 'portfolio' && (
          <>
            <DateRangePicker start={portfolioStart} end={portfolioEnd} onStart={setPortfolioStart} onEnd={setPortfolioEnd} />

            {/* D2: Concentration Risk Treemap */}
            {group2Data.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <SectionHeader
                    title="Concentration Risk"
                    info="Treemap of portfolio holdings by market value. Red cells exceed your concentration threshold."
                    icon={<PieChartIcon size={16} />}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Threshold:</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={concentrationThreshold}
                      onChange={e => setConcentrationThreshold(Number(e.target.value))}
                      className="w-16 text-xs border border-slate-200 rounded px-2 py-1 text-center"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </div>
                <div style={{ height: 300 }}>
                  <Treemap
                    width={undefined as any}
                    height={300}
                    data={group2Data
                      .filter((h: any) => (h.LastMV || 0) > 0)
                      .map((h: any) => ({
                        name: h.Stock,
                        size: Math.abs(h.LastMV || 0),
                        mvPct: (h.MVPct || 0) * 100,
                        fill: ((h.MVPct || 0) * 100) > concentrationThreshold ? '#ef4444' : '#6366f1',
                      }))}
                    dataKey="size"
                    aspectRatio={4 / 3}
                    content={({ x, y, width, height, name, mvPct, fill }: any) => (
                      <g>
                        <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.8} stroke="#fff" strokeWidth={2} rx={4} />
                        {width > 40 && height > 25 && (
                          <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={Math.min(width / (name?.length || 1) * 1.2, 12)}>
                            {name}
                          </text>
                        )}
                        {width > 40 && height > 40 && (
                          <text x={x + width / 2} y={y + height / 2 + 14} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={9}>
                            {mvPct?.toFixed(1)}%
                          </text>
                        )}
                      </g>
                    )}
                  />
                </div>
              </Card>
            )}

            {/* D3: Allocation Donuts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <SectionHeader title="By Asset Class" info="Current portfolio allocation by asset class." icon={<PieChartIcon size={16} />} />
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={portfolioByClass}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={9}
                    >
                      {portfolioByClass.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `$${Math.round(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <SectionHeader title="By Investment Type" info="Current portfolio allocation by investment type." icon={<PieChartIcon size={16} />} />
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={portfolioByType}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={9}
                    >
                      {portfolioByType.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `$${Math.round(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* D4: Cost vs Price Scatter */}
            {scatterData.length > 0 && (
              <Card>
                <SectionHeader
                  title="Cost vs Last Price"
                  info="Each dot is a current holding. X=avg cost, Y=last price, size=market value. Above diagonal = profit."
                  icon={<Target size={16} />}
                />
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="cost"
                      name="Avg Cost"
                      type="number"
                      domain={['auto', 'auto']}
                      tickFormatter={v => `$${v}`}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'Avg Cost', position: 'bottom', fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="price"
                      name="Last Price"
                      type="number"
                      domain={['auto', 'auto']}
                      tickFormatter={v => `$${v}`}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'Last Price', angle: -90, position: 'insideLeft', fontSize: 10 }}
                    />
                    <ZAxis dataKey="mv" range={[40, 800]} name="Market Value" />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }: any) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 p-2 rounded shadow text-xs">
                            <p className="font-bold">{d.name}</p>
                            <p>Avg Cost: ${d.cost?.toFixed(2)}</p>
                            <p>Last Price: ${d.price?.toFixed(2)}</p>
                            <p>MV: ${Math.round(d.mv).toLocaleString()}</p>
                            <p style={{ color: d.pnlPct >= 0 ? '#10b981' : '#ef4444' }}>P&L: {d.pnlPct?.toFixed(1)}%</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={scatterData} fill="#6366f1">
                      {scatterData.map((d: any, i: number) => (
                        <Cell key={i} fill={d.pnlPct >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
                      ))}
                    </Scatter>
                    <ReferenceLine
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      segment={[{ x: scatterMin, y: scatterMin }, { x: scatterMax, y: scatterMax }]}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* D5: Expectancy & Kelly */}
            <Card>
              <SectionHeader
                title="Expectancy & Kelly Criterion"
                info="Expectancy = (WinRate × AvgWin) - (LossRate × AvgLoss). Kelly % = optimal position size. Use Half-Kelly for safety."
                icon={<Zap size={16} />}
              />
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Win Rate', value: fmtPct(expectancyMetrics.winRate), info: 'Percentage of trades that are profitable' },
                  { label: 'Avg Win (USD)', value: fmtUsd(expectancyMetrics.avgWin), info: 'Average profit per winning trade' },
                  { label: 'Avg Loss (USD)', value: fmtUsd(expectancyMetrics.avgLoss), info: 'Average loss per losing trade (absolute)' },
                  { label: 'Expectancy', value: `$${Math.round(expectancyMetrics.expectancy).toLocaleString()}`, info: 'Expected value per trade. Positive = edge. (WinRate × AvgWin) - (LossRate × AvgLoss)' },
                  { label: 'Kelly %', value: fmtPct(expectancyMetrics.kelly), info: 'Optimal position size as % of capital per Kelly formula. Can be aggressive.' },
                  { label: 'Half-Kelly %', value: fmtPct(expectancyMetrics.halfKelly), info: 'Half the Kelly criterion for more conservative sizing with less volatility.' },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{m.label}</p>
                      <InfoTooltip text={m.info} />
                    </div>
                    <p className="text-xl font-black text-slate-700 mt-1">{m.value}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* D6: Holding Period Distribution */}
            <Card>
              <SectionHeader
                title="Holding Period Distribution"
                info="Distribution of all trades by how long they were held before closing."
                icon={<Clock size={16} />}
              />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={holdingDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Trades" radius={[4, 4, 0, 0]}>
                    {holdingDistribution.map((_, i) => (
                      <Cell key={i} fill={['#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412'][i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
        )}

        {/* ══════════════════════════════════ BENCHMARK TAB ══════════════════════════════════ */}
        {activeTab === 'benchmark' && (
          <>
            <DateRangePicker start={benchmarkStart} end={benchmarkEnd} onStart={setBenchmarkStart} onEnd={setBenchmarkEnd} />
            {benchmarkNav.length === 0 ? (
              <Card>
                <div className="text-center py-20">
                  <Upload size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500 mb-6">Upload a benchmark CSV to compare performance</p>
                  <p className="text-slate-400 text-sm mb-6">CSV format: two columns — Date (YYYY-MM-DD), Value/Price</p>
                  <label className="px-6 py-3 bg-blue-600 text-white rounded-xl cursor-pointer hover:bg-blue-700 transition-colors text-sm font-semibold">
                    Upload Benchmark CSV
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => onBenchmarkUpload(ev.target?.result as string);
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                </div>
              </Card>
            ) : (
              <>
                <Card>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold text-slate-700 mb-1">Benchmark Loaded</p>
                      <p className="text-xs text-slate-500">
                        {benchmarkNav.length} data points ({benchmarkNav[0]?.date} – {benchmarkNav[benchmarkNav.length - 1]?.date})
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg cursor-pointer hover:bg-slate-200 transition-colors text-xs font-semibold">
                        Replace CSV
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => onBenchmarkUpload(ev.target?.result as string);
                            reader.readAsText(file);
                          }}
                        />
                      </label>
                      <button
                        onClick={() => onBenchmarkUpload('')}
                        className="text-xs text-red-500 hover:underline flex items-center gap-1"
                      >
                        <X size={12} /> Clear
                      </button>
                    </div>
                  </div>
                </Card>

                {normalizedNav.length > 0 ? (
                  <Card>
                    <SectionHeader
                      title="Portfolio vs Benchmark (Normalized to 100)"
                      info="Both series normalized to 100 at the portfolio start date for apples-to-apples comparison."
                      icon={<Activity size={16} />}
                    />
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={normalizedNav}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis tickFormatter={v => `${v}`} tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                        <Tooltip formatter={(v: any, name: string) => [`${v}`, name]} />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Line type="monotone" dataKey="portfolio" name="My Portfolio" stroke="#2563eb" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#f97316" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>
                ) : (
                  <Card>
                    <p className="text-slate-400 text-sm text-center py-8">
                      No overlapping dates between portfolio NAV and benchmark. Make sure dates align.
                    </p>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
