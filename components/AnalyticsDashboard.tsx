
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, ReferenceLine, Treemap
} from 'recharts';
import {
  Info, TrendingUp, TrendingDown, Activity, BarChart3,
  PieChart as PieChartIcon, Target, Zap, Award, Clock,
  Upload, X, ChevronDown, ChevronUp, Layers, Archive, Calendar, Download
} from 'lucide-react';
import { PnLData, TransactionData, LookupSheetData, MarketConstants, NavData, DividendData, InterestData, CashLedgerEntry, BenchmarkData } from '../types';
import { calculatePortfolioAnalysis } from '../services/excelService';

interface AnalyticsDashboardProps {
  pnlData: PnLData[];
  transactions: TransactionData[];
  lookupData: LookupSheetData | null;
  marketConstants: MarketConstants;
  navData: NavData[];
  cashPosition: number;
  optionPosition: number;
  benchmarkData: BenchmarkData;
  onBenchmarkUpload: (file: File) => void;
  onBenchmarkClear: () => void;
  dividendData: DividendData[];
  interestData: InterestData[];
  cashLedger: CashLedgerEntry[];
  onIncomeUpload?: (file: File) => void;
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

// ── ISO week number helper ──────────────────────────────────────────────────
const getISOWeek = (dateStr: string): string => {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil((((d.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(Math.min(week, 52)).padStart(2, '0')}`;
};

const getFrequencyKey = (dateStr: string, freq: string): string => {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (freq === 'annual') return `${year}`;
  if (freq === 'quarterly') return `${year}-Q${Math.floor(month / 3) + 1}`;
  if (freq === 'weekly') return getISOWeek(dateStr);
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

type HeatFreq = 'weekly' | 'monthly' | 'quarterly' | 'annual';

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  pnlData,
  transactions,
  lookupData,
  marketConstants,
  navData,
  cashPosition,
  optionPosition,
  benchmarkData,
  onBenchmarkUpload,
  onBenchmarkClear,
  dividendData,
  interestData,
  cashLedger,
  onIncomeUpload,
}) => {
  const [activeTab, setActiveTab] = useState<'pnl' | 'trades' | 'stocks' | 'portfolio' | 'benchmark' | 'income'>('pnl');
  const [enlargedChart, setEnlargedChart] = useState<string | null>(null);
  const [concentrationThreshold, setConcentrationThreshold] = useState(5);
  const [treemapEnlarged, setTreemapEnlarged] = useState(false);
  const [isWinnersExpanded, setIsWinnersExpanded] = useState(false);
  const [isLosersExpanded, setIsLosersExpanded] = useState(false);
  const [heatFreq, setHeatFreq] = useState<HeatFreq>('monthly');

  // ── Benchmark blend state (persisted to localStorage) ─────────────────────
  const BLEND_WEIGHTS_KEY = 'trade_tracker_blend_weights';
  // Derive available index keys from benchmarkData columns
  const availableIndices = useMemo(() => {
    if (!benchmarkData.length) return [];
    return Object.keys(benchmarkData[0]).filter(k => k !== 'date');
  }, [benchmarkData]);
  // weights: {indexCode: number 0-100} — load from localStorage on mount
  const [blendWeights, setBlendWeights] = useState<Record<string, number>>(() => {
    try { const s = localStorage.getItem(BLEND_WEIGHTS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  // Persist blend weights whenever they change
  useEffect(() => {
    localStorage.setItem(BLEND_WEIGHTS_KEY, JSON.stringify(blendWeights));
  }, [blendWeights]);
  // Initialize blend weights when indices change (add new, keep existing)
  useEffect(() => {
    if (!availableIndices.length) return;
    setBlendWeights(prev => {
      const next: Record<string, number> = {};
      availableIndices.forEach(idx => { next[idx] = prev[idx] ?? 0; });
      return next;
    });
  }, [availableIndices]);

  // ── Single global date range ──────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const [globalStart, setGlobalStart] = useState('');
  const [globalEnd, setGlobalEnd] = useState(today);

  useEffect(() => {
    setGlobalStart(s => s || '2024-01-01');
  }, []);

  // ── Single filtered data memo ──────────────────────────────────────────────
  const filtered = useMemo(() =>
    pnlData.filter(p => p.sellDate && (!globalStart || p.sellDate >= globalStart) && p.sellDate <= globalEnd),
    [pnlData, globalStart, globalEnd]);

  // ── pnlMetrics ──────────────────────────────────────────────────────────────
  const pnlMetrics = useMemo(() => {
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
  }, [filtered, marketConstants]);

  // ── cumulativeData ───────────────────────────────────────────────────────────
  const cumulativeData = useMemo(() => {
    const sorted = [...filtered]
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
  }, [filtered, marketConstants]);

  // ── heatmapData (supports weekly/monthly/quarterly/annual) ───────────────────
  const heatmapData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    filtered.forEach(p => {
      if (!p.sellDate) return;
      const key = getFrequencyKey(p.sellDate, heatFreq);
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      const cur = map.get(key) || { total: 0, count: 0 };
      map.set(key, { total: cur.total + usd, count: cur.count + 1 });
    });
    // Compute period totals for % contribution
    const periodTotals = new Map<string, number>();
    map.forEach((v, k) => {
      const parentKey = heatFreq === 'annual' ? k :
        heatFreq === 'quarterly' ? k.substring(0, 4) :
        heatFreq === 'weekly' ? k.substring(0, 4) :
        k.substring(0, 4);
      periodTotals.set(parentKey, (periodTotals.get(parentKey) || 0) + v.total);
    });
    const result = new Map<string, { total: number; count: number; pct: number }>();
    map.forEach((v, k) => {
      const parentKey = heatFreq === 'annual' ? k : k.substring(0, 4);
      const parentTotal = periodTotals.get(parentKey) || 0;
      result.set(k, { ...v, pct: parentTotal !== 0 ? (v.total / Math.abs(parentTotal)) * 100 : 0 });
    });
    return result;
  }, [filtered, marketConstants, heatFreq]);

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
    filtered.forEach(p => {
      const r = p.returnPercent || 0;
      const b = buckets.find(b => r >= b.min && r < b.max) || buckets[buckets.length - 1];
      b.count++;
    });
    return buckets;
  }, [filtered]);

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
    filtered.forEach(p => {
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
  }, [filtered, lookupData, marketConstants]);

  // ── streakData ───────────────────────────────────────────────────────────────
  const streakData = useMemo(() => {
    const sorted = [...filtered]
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
  }, [filtered, marketConstants]);

  // ── holdingOutcome ───────────────────────────────────────────────────────────
  const holdingOutcome = useMemo(() => {
    const wins = filtered.filter(p => (p.holdingDays || 0) > 0 && p.realizedPnL > 0).map(p => p.holdingDays || 0);
    const losses = filtered.filter(p => (p.holdingDays || 0) > 0 && p.realizedPnL <= 0).map(p => p.holdingDays || 0);
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
  }, [filtered]);

  // ── holdingDistribution (now used in Trades tab) ──────────────────────────────
  const holdingDistribution = useMemo(() => {
    const buckets = [
      { range: '0-7d', count: 0 },
      { range: '8-30d', count: 0 },
      { range: '1-3mo', count: 0 },
      { range: '3-6mo', count: 0 },
      { range: '6-12mo', count: 0 },
      { range: '>1yr', count: 0 },
    ];
    filtered.forEach(p => {
      const d = p.holdingDays || 0;
      if (d <= 7) buckets[0].count++;
      else if (d <= 30) buckets[1].count++;
      else if (d <= 90) buckets[2].count++;
      else if (d <= 180) buckets[3].count++;
      else if (d <= 365) buckets[4].count++;
      else buckets[5].count++;
    });
    return buckets;
  }, [filtered]);

  // ── stockStats ───────────────────────────────────────────────────────────────
  const stockStats = useMemo(() => {
    const stats = new Map<string, { count: number; wins: number; totalPnl: number }>();
    filtered.forEach(p => {
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
  }, [filtered, marketConstants]);

  // ── expectancyMetrics ────────────────────────────────────────────────────────
  const expectancyMetrics = useMemo(() => {
    const wins = filtered.filter(p => p.realizedPnL > 0);
    const losses = filtered.filter(p => p.realizedPnL <= 0);
    const total = filtered.length;
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
  }, [filtered, marketConstants]);

  // ── topWinnersLosers ─────────────────────────────────────────────────────────
  const topWinnersLosers = useMemo(() => {
    const byStock = new Map<string, { stock: string; pnl: number }>();
    filtered.forEach(p => {
      const rate = getRate(p.market || '', marketConstants);
      const usd = p.realizedPnL / rate;
      const cur = byStock.get(p.stock) || { stock: p.stock, pnl: 0 };
      cur.pnl += usd;
      byStock.set(p.stock, cur);
    });
    const arr = Array.from(byStock.values()).sort((a, b) => b.pnl - a.pnl);
    return { winners: arr.filter(x => x.pnl > 0), losers: arr.filter(x => x.pnl < 0).reverse() };
  }, [filtered, marketConstants]);

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

  // ── price ratio charts (Last Price / Avg Cost per market) ─────────────────────
  const priceRatioCharts = useMemo(() => {
    const toBar = (arr: any[]) =>
      arr.filter((h: any) => (h.AvgCost || 0) > 0 && (h.LastPrice || 0) > 0)
        .map((h: any) => ({ ticker: h.Stock, name: h.Name || h.Stock, ratio: h.LastPrice / h.AvgCost }))
        .sort((a: any, b: any) => b.ratio - a.ratio);
    return {
      hk: toBar(portfolioAnalysis.g2Hk || []),
      ccs: toBar(portfolioAnalysis.g2Ccs || []),
      us: toBar((portfolioAnalysis.g2Us || []).filter((h: any) => (h.Market || '').toUpperCase() !== 'AUS')),
      aus: toBar((portfolioAnalysis.g2Us || []).filter((h: any) => (h.Market || '').toUpperCase() === 'AUS')),
    };
  }, [portfolioAnalysis]);

  // ── normalizedNav (multi-index + blend) ───────────────────────────────────
  const normalizedNav = useMemo(() => {
    if (!navData.length || !benchmarkData.length) return [];
    // Filter NAV by global date range
    let navSorted = [...navData].sort((a, b) => a.date.localeCompare(b.date));
    if (globalStart) navSorted = navSorted.filter(n => n.date >= globalStart);
    if (globalEnd) navSorted = navSorted.filter(n => n.date <= globalEnd);
    if (!navSorted.length) return [];
    const benchMap = new Map(benchmarkData.map(b => [b.date, b]));
    const startDate = navSorted[0].date;
    const navBase = navSorted[0].nav2 || navSorted[0].nav1 || 1;

    // Find the base values for each index at portfolio start date
    const basePoint = benchmarkData.find(b => b.date >= startDate);
    if (!basePoint) return [];

    // Compute total blend weight
    const totalBlendW = (Object.values(blendWeights) as number[]).reduce((s: number, w: number) => s + w, 0);

    return navSorted.map(n => {
      const benchPoint = benchMap.get(n.date);
      const row: any = {
        date: n.date,
        portfolio: Math.round(((n.nav2 || n.nav1 || navBase) / navBase) * 100 * 100) / 100,
      };
      // Individual indices (normalized to 100 at start)
      availableIndices.forEach(idx => {
        const baseVal = basePoint[idx] as number;
        const curVal = benchPoint?.[idx] as number;
        if (curVal && baseVal) {
          row[idx] = Math.round((curVal / baseVal) * 100 * 100) / 100;
        }
      });
      // Custom blend
      if ((totalBlendW as number) > 0) {
        let blendVal = 0;
        let blendCoverage = 0;
        availableIndices.forEach(idx => {
          const w: number = blendWeights[idx] || 0;
          const baseVal: number = basePoint[idx];
          const curVal: number = benchPoint?.[idx];
          if (w > 0 && curVal && baseVal) {
            blendVal += (curVal / baseVal) * (w / (totalBlendW as number));
            blendCoverage += w;
          }
        });
        if (blendCoverage > 0) row['Custom Blend'] = Math.round(blendVal * 100 * 100) / 100;
      }
      return row;
    }).filter(r => availableIndices.some(idx => r[idx] !== undefined) || r['Custom Blend'] !== undefined);
  }, [navData, benchmarkData, availableIndices, blendWeights]);

  // ── P&L by dimension aggregation for donut charts ─────────────────────────────
  // Build a normalised lookup map (case-insensitive ticker → stock info)
  const lookupStockMap = useMemo(() => {
    const m = new Map<string, { class: string; type: string; category: string }>();
    (lookupData?.stocks || []).forEach(s => {
      m.set(s.ticker.toUpperCase(), {
        // Normalise class / type / category to title case to prevent double-counting
        class: (s.class || 'Other').trim(),
        type: (s.type || 'Other').trim(),
        category: (s.category || 'Other').trim(),
      });
    });
    return m;
  }, [lookupData]);

  const portfolioByClass = useMemo(() => {
    const m = new Map<string, number>();
    group2Data.forEach((h: any) => {
      const info = lookupStockMap.get((h.Stock || '').toUpperCase());
      // Normalise to lowercase for grouping to prevent "HK Stock" vs "HK stock"
      const cls = info?.class || 'Other';
      const key = cls.toLowerCase();
      m.set(key, (m.get(key) || 0) + (h.LastMV || 0));
    });
    // Restore display-friendly names
    const nameMap = new Map<string, string>();
    (lookupData?.stocks || []).forEach(s => { if (s.class) nameMap.set(s.class.toLowerCase(), s.class.trim()); });
    return Array.from(m.entries())
      .map(([key, value]) => ({ name: nameMap.get(key) || key, value: Math.round(value) }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [group2Data, lookupStockMap, lookupData]);

  const portfolioByType = useMemo(() => {
    const m = new Map<string, number>();
    group2Data.forEach((h: any) => {
      const info = lookupStockMap.get((h.Stock || '').toUpperCase());
      const tp = (info?.type || 'Other').toLowerCase();
      m.set(tp, (m.get(tp) || 0) + (h.LastMV || 0));
    });
    const nameMap = new Map<string, string>();
    (lookupData?.stocks || []).forEach(s => { if (s.type) nameMap.set(s.type.toLowerCase(), s.type.trim()); });
    return Array.from(m.entries())
      .map(([key, value]) => ({ name: nameMap.get(key) || key, value: Math.round(value) }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [group2Data, lookupStockMap, lookupData]);

  const portfolioByCategory = useMemo(() => {
    const m = new Map<string, number>();
    group2Data.forEach((h: any) => {
      const info = lookupStockMap.get((h.Stock || '').toUpperCase());
      const cat = (info?.category || 'Other').toLowerCase();
      m.set(cat, (m.get(cat) || 0) + (h.LastMV || 0));
    });
    const nameMap = new Map<string, string>();
    (lookupData?.stocks || []).forEach(s => { if (s.category) nameMap.set(s.category.toLowerCase(), s.category.trim()); });
    return Array.from(m.entries())
      .map(([key, value]) => ({ name: nameMap.get(key) || key, value: Math.round(value) }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [group2Data, lookupStockMap, lookupData]);

  const daysSince = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return `${d}d`;
  };

  const fmtUsd = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString()}`;
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  const displayWinners = isWinnersExpanded ? topWinnersLosers.winners : topWinnersLosers.winners.slice(0, 5);
  const displayLosers = isLosersExpanded ? topWinnersLosers.losers : topWinnersLosers.losers.slice(0, 5);

  // ── Heatmap display helpers ────────────────────────────────────────────────────
  const heatmapYears = useMemo(() =>
    [...new Set([...heatmapData.keys()].map(k => k.substring(0, 4)))].sort(),
    [heatmapData]);

  const heatmapColumns = useMemo((): string[] => {
    if (heatFreq === 'monthly') return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (heatFreq === 'quarterly') return ['Q1', 'Q2', 'Q3', 'Q4'];
    if (heatFreq === 'annual') return ['Annual'];
    // weekly: W01..W52
    return Array.from({ length: 52 }, (_, i) => `W${String(i + 1).padStart(2, '0')}`);
  }, [heatFreq]);

  const maxAbsHeat = Math.max(...[...heatmapData.values()].map(v => Math.abs(v.total)), 1);
  const heatColor = (val: number) => {
    if (!val) return '#f1f5f9';
    const intensity = Math.min(Math.abs(val) / maxAbsHeat, 1);
    if (val > 0) return `rgba(239,68,68,${0.15 + intensity * 0.75})`;   // profit = red
    return `rgba(16,185,129,${0.15 + intensity * 0.75})`;                // loss = green
  };

  const getHeatKey = (year: string, col: string, idx: number): string => {
    if (heatFreq === 'monthly') return `${year}-${String(idx + 1).padStart(2, '0')}`;
    if (heatFreq === 'quarterly') return `${year}-${col}`;
    if (heatFreq === 'annual') return year;
    return `${year}-${col}`;
  };

  // ── Analytics Export ───────────────────────────────────────────────────────────
  const handleExportAnalytics = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: P&L Metrics
    const metricsRows = [
      { Metric: 'Period Start', Value: globalStart },
      { Metric: 'Period End', Value: globalEnd },
      { Metric: 'Total Trades', Value: pnlMetrics.totalTrades },
      { Metric: 'Net Realized P&L (USD)', Value: Math.round(pnlMetrics.totalPnl) },
      { Metric: 'Win Rate (%)', Value: pnlMetrics.winRate.toFixed(2) },
      { Metric: 'Profit Factor', Value: pnlMetrics.profitFactor.toFixed(2) },
      { Metric: 'Avg P&L / Trade (USD)', Value: Math.round(pnlMetrics.totalPnl / Math.max(pnlMetrics.totalTrades, 1)) },
      { Metric: 'Total Win (USD)', Value: Math.round(pnlMetrics.totalWin) },
      { Metric: 'Winning Trades', Value: pnlMetrics.wins.length },
      { Metric: 'Avg Win (USD)', Value: Math.round(pnlMetrics.avgWin) },
      { Metric: 'Median Win (USD)', Value: Math.round(pnlMetrics.medianWin) },
      { Metric: 'Total Loss (USD)', Value: Math.round(pnlMetrics.totalLoss) },
      { Metric: 'Losing Trades', Value: pnlMetrics.losses.length },
      { Metric: 'Avg Loss (USD)', Value: Math.round(pnlMetrics.avgLoss) },
      { Metric: 'Median Loss (USD)', Value: Math.round(pnlMetrics.medianLoss) },
      { Metric: 'Expectancy (USD)', Value: Math.round(expectancyMetrics.expectancy) },
      { Metric: 'Kelly %', Value: expectancyMetrics.kelly.toFixed(2) },
      { Metric: 'Half-Kelly %', Value: expectancyMetrics.halfKelly.toFixed(2) },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metricsRows), 'P&L Metrics');

    // Sheet 2: Heatmap
    const heatRows: any[] = [];
    heatmapYears.forEach(year => {
      const row: any = { Year: year };
      heatmapColumns.forEach((col, idx) => {
        const key = getHeatKey(year, col, idx);
        const d = heatmapData.get(key);
        row[col] = d ? Math.round(d.total) : 0;
      });
      heatRows.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(heatRows), 'P&L Heatmap');

    // Sheet 3: Top Winners & Losers
    const winnersRows = topWinnersLosers.winners.map((s, i) => ({ Rank: i + 1, Stock: s.stock, 'P&L (USD)': Math.round(s.pnl) }));
    const losersRows = topWinnersLosers.losers.map((s, i) => ({ Rank: i + 1, Stock: s.stock, 'P&L (USD)': Math.round(s.pnl) }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(winnersRows), 'Top Winners');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(losersRows), 'Top Losers');

    // Sheet 4: Stock Performance
    const stockRows = stockStats.map(s => ({
      Stock: s.stock, Trades: s.count, Wins: s.wins, Losses: s.losses,
      'Win Rate (%)': s.winRate, 'Avg P&L (USD)': s.avgPnl, 'Total P&L (USD)': s.totalPnl,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows), 'Stock Performance');

    // Sheet 5: Return Distribution
    const returnRows = returnBuckets.map(b => ({ Range: b.range, 'Trade Count': b.count }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(returnRows), 'Return Distribution');

    // Sheet 6: Holding Period Distribution
    const holdingRows = holdingDistribution.map(b => ({ Range: b.range, 'Trade Count': b.count }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(holdingRows), 'Holding Period');

    // Sheet 7: P&L by Dimension
    const dimRows = [
      ...pnlByDimension.byType.map(x => ({ Dimension: 'Type', Name: x.name, 'P&L (USD)': x.value })),
      ...pnlByDimension.byCategory.map(x => ({ Dimension: 'Category', Name: x.name, 'P&L (USD)': x.value })),
      ...pnlByDimension.byClass.map(x => ({ Dimension: 'Class', Name: x.name, 'P&L (USD)': x.value })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dimRows), 'P&L by Dimension');

    XLSX.writeFile(wb, `Analytics_${globalStart}_to_${globalEnd}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Activity size={20} className="text-blue-600" /> Analytics
          </h2>
          {/* Global Period Picker + Export */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Calendar size={12} className="text-slate-400" />
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Period:</span>
              <input
                type="date"
                value={globalStart}
                onChange={e => setGlobalStart(e.target.value)}
                className="text-xs font-bold border border-slate-200 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              <span className="text-slate-300 font-bold text-xs">–</span>
              <input
                type="date"
                value={globalEnd}
                onChange={e => setGlobalEnd(e.target.value)}
                className="text-xs font-bold border border-slate-200 rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
            </div>
            <button
              onClick={handleExportAnalytics}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Download size={13} /> Export
            </button>
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {(['pnl', 'trades', 'stocks', 'portfolio', 'benchmark', 'income'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab === 'pnl' ? 'P&L' : tab === 'trades' ? 'Trades' : tab === 'stocks' ? 'Stocks' : tab === 'portfolio' ? 'Portfolio' : tab === 'benchmark' ? 'Benchmark' : 'Income'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

        {/* ══════════════════════════════════ P&L TAB ══════════════════════════════════ */}
        {activeTab === 'pnl' && (
          <>
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

          </>
        )}

        {/* ══════════════════════════════════ TRADES TAB ══════════════════════════════════ */}
        {activeTab === 'trades' && (
          <>
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
                      <Cell key={i} fill={b.min >= 0 ? '#ef4444' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* B1.5: Holding Period Distribution (moved from Portfolio) */}
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
                            <Cell key={i} fill={entry.value >= 0 ? '#ef4444' : '#10b981'} />
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
                      <Cell key={i} fill={entry.isWin ? '#ef4444' : '#10b981'} />
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
                    <button onClick={() => setTreemapEnlarged(true)} className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors" title="Enlarge">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </button>
                  </div>
                </div>
                {(() => {
                  const treemapData = group2Data
                    .filter((h: any) => (h.LastMV || 0) > 0)
                    .map((h: any) => ({
                      name: h.Stock,
                      size: Math.abs(h.LastMV || 0),
                      mvPct: (h.MVPct || 0) * 100,
                      isOver: ((h.MVPct || 0) * 100) > concentrationThreshold,
                    }));
                  const totalMv = treemapData.reduce((a: number, b: any) => a + b.size, 0);
                  // Compute MVPct from actual data if MVPct is 0
                  const withPct = treemapData.map((d: any) => ({
                    ...d,
                    mvPct: d.mvPct || (totalMv > 0 ? (d.size / totalMv) * 100 : 0),
                    isOver: (d.mvPct || (totalMv > 0 ? (d.size / totalMv) * 100 : 0)) > concentrationThreshold,
                  }));
                  if (withPct.length === 0) return <p className="text-slate-400 text-sm text-center py-8">No holdings data available</p>;
                  return (
                    <ResponsiveContainer width="100%" height={300}>
                      <Treemap
                        data={withPct}
                        dataKey="size"
                        aspectRatio={4 / 3}
                        content={({ x, y, width, height, name, mvPct, isOver }: any) => {
                          // Guard: recharts passes a synthetic root node — skip it
                          if (!name || width <= 0 || height <= 0) return <g />;
                          const fill = isOver ? '#ef4444' : '#6366f1';
                          const showName = width > 28 && height > 18;
                          const showPct = width > 28 && height > 32;
                          const midY = y + height / 2;
                          const pctLabel = typeof mvPct === 'number' ? mvPct.toFixed(1) + '%' : '';
                          return (
                            <g>
                              <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} rx={3} />
                              {showName && (
                                <text
                                  x={x + width / 2}
                                  y={showPct ? midY - 7 : midY}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="white"
                                  fontSize={Math.min(Math.max(width / ((name?.length || 1) + 1) * 1.5, 8), 13)}
                                  fontWeight="600"
                                >
                                  {name}
                                </text>
                              )}
                              {showPct && pctLabel && (
                                <text x={x + width / 2} y={midY + 8} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.85)" fontSize={9}>
                                  {pctLabel}
                                </text>
                              )}
                            </g>
                          );
                        }}
                      />
                    </ResponsiveContainer>
                  );
                })()}
              </Card>
            )}
            {group2Data.length === 0 && (
              <Card>
                <div className="text-center py-12">
                  <PieChartIcon size={40} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-400 text-sm">No current holdings data available.</p>
                  <p className="text-slate-400 text-xs mt-1">Upload transaction data to see portfolio analysis.</p>
                </div>
              </Card>
            )}

            {/* D3: Allocation Donuts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {[
                { title: 'By Asset Class', info: 'Current portfolio allocation by asset class.', data: portfolioByClass },
                { title: 'By Investment Type', info: 'Current portfolio allocation by investment type.', data: portfolioByType },
                { title: 'By Category', info: 'Current portfolio allocation by category (Turnaround, Cyclical, Value, Growth).', data: portfolioByCategory },
              ].map(({ title, info, data }) => (
                <Card key={title}>
                  <SectionHeader title={title} info={info} icon={<PieChartIcon size={16} />} />
                  {data.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">No data — ensure lookup categories are set.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={data}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                          fontSize={9}
                        >
                          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => `$${Math.round(v).toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              ))}
            </div>

            {/* D4: Last Price / Avg Cost Ratio Charts */}
            {(() => {
              const PriceRatioChart = ({ data, label, chartId }: { data: any[], label: string, chartId: string }) => {
                if (!data.length) return null;
                const barW = Math.max(24, Math.min(60, 600 / data.length));
                const chartW = Math.max(400, data.length * (barW + 8) + 80);
                return (
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <SectionHeader title={`Last / Cost — ${label}`} info="Ratio > 1 = profit (red), < 1 = loss (green). Reference line at 1× (break-even). Sorted largest to smallest." icon={<Target size={16} />} />
                      <button onClick={() => setEnlargedChart(chartId)} className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors" title="Enlarge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <div style={{ width: `${chartW}px`, height: '260px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data} margin={{ top: 20, right: 16, bottom: 40, left: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="ticker" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={50} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v.toFixed(1)}×`} domain={['auto', 'auto']} />
                            <Tooltip
                              formatter={(v: any) => [`${Number(v).toFixed(3)}×`, 'Ratio']}
                              labelFormatter={(l: any) => { const d = data.find((x: any) => x.ticker === l); return d ? `${l} — ${d.name}` : l; }}
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 11 }}
                            />
                            <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: '1×', position: 'insideLeft', fontSize: 9, fill: '#94a3b8' }} />
                            <Bar dataKey="ratio" barSize={barW} radius={[4, 4, 4, 4]} baseValue={1}>
                              {data.map((d: any, i: number) => <Cell key={i} fill={d.ratio >= 1 ? '#ef4444' : '#10b981'} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </Card>
                );
              };
              return (
                <>
                  <PriceRatioChart data={priceRatioCharts.hk} label="HK" chartId="ratio-hk" />
                  <PriceRatioChart data={priceRatioCharts.ccs} label="CCS" chartId="ratio-ccs" />
                  <PriceRatioChart data={priceRatioCharts.us} label="US" chartId="ratio-us" />
                  <PriceRatioChart data={priceRatioCharts.aus} label="AUS" chartId="ratio-aus" />
                </>
              );
            })()}

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
          </>
        )}

        {/* ══════════════════════════════════ BENCHMARK TAB ══════════════════════════════════ */}
        {activeTab === 'benchmark' && (() => {
          const benchLineColors = ['#f97316','#8b5cf6','#0ea5e9','#10b981','#f59e0b','#ef4444','#84cc16'];
          const totalBlendW: number = (Object.values(blendWeights) as number[]).reduce((s: number, w: number) => s + w, 0);
          return (
            <>
              {benchmarkData.length === 0 ? (
                <Card>
                  <div className="text-center py-20">
                    <Upload size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 mb-4">Upload the "Benchmark Indicies" Excel file</p>
                    <p className="text-slate-400 text-xs mb-6">Format: Date column + one column per index (e.g. SPX.GI, HSI.HI, NDX.GI…)</p>
                    <label className="px-6 py-3 bg-blue-600 text-white rounded-xl cursor-pointer hover:bg-blue-700 transition-colors text-sm font-semibold">
                      Upload Benchmark Excel
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onBenchmarkUpload(f); }} />
                    </label>
                  </div>
                </Card>
              ) : (
                <>
                  {/* Header: file info + replace/clear */}
                  <Card>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-700 mb-1">Benchmark Indices Loaded</p>
                        <p className="text-xs text-slate-500">
                          {benchmarkData.length} days · {availableIndices.length} indices ({benchmarkData[0]?.date} – {benchmarkData[benchmarkData.length - 1]?.date})
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{availableIndices.join(' · ')}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg cursor-pointer hover:bg-slate-200 text-xs font-semibold">
                          Replace
                          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onBenchmarkUpload(f); }} />
                        </label>
                        <button onClick={onBenchmarkClear} className="text-xs text-red-500 hover:underline flex items-center gap-1"><X size={12} /> Clear</button>
                      </div>
                    </div>
                  </Card>

                  {/* Custom Blend Builder */}
                  <Card>
                    <SectionHeader title="Custom Blend" info="Set weights (0–100) for each index. They are automatically normalised so they sum to 100%." icon={<Target size={16} />} />
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {availableIndices.map((idx, ci) => (
                        <div key={idx} className="flex flex-col gap-1 p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{idx}</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number" min={0} max={100} step={5}
                              value={blendWeights[idx] ?? 0}
                              onChange={e => setBlendWeights(prev => ({ ...prev, [idx]: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                              className="w-16 text-xs font-bold border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <span className="text-xs text-slate-400">%</span>
                          </div>
                          {totalBlendW > 0 && ((blendWeights[idx] as number) || 0) > 0 && (
                            <span className="text-[9px] text-slate-400">({((((blendWeights[idx] as number) || 0) / totalBlendW) * 100).toFixed(0)}% of blend)</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {totalBlendW > 0 && (
                      <p className="text-xs text-slate-500 mt-3">Total weight: {totalBlendW} → normalised to 100%</p>
                    )}
                  </Card>

                  {/* Chart */}
                  {normalizedNav.length > 0 ? (
                    <Card>
                      <SectionHeader title="Portfolio vs Indices (Normalized to 100)" info="All series normalized to 100 at the first portfolio NAV date for comparison." icon={<Activity size={16} />} />
                      <ResponsiveContainer width="100%" height={360}>
                        <LineChart data={normalizedNav}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                          <YAxis tickFormatter={v => `${v}`} tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                          <Tooltip formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}`, name]} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                          <Line type="monotone" dataKey="portfolio" name="My Portfolio" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                          {availableIndices.map((idx, ci) => (
                            <Line key={idx} type="monotone" dataKey={idx} name={idx} stroke={benchLineColors[ci % benchLineColors.length]} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                          ))}
                          {totalBlendW > 0 && (
                            <Line type="monotone" dataKey="Custom Blend" name="Custom Blend" stroke="#ef4444" strokeWidth={2} dot={false} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                  ) : (
                    <Card>
                      <p className="text-slate-400 text-sm text-center py-8">No overlapping dates between portfolio NAV and benchmark data.</p>
                    </Card>
                  )}

                  {/* Index performance summary table */}
                  {normalizedNav.length > 0 && (() => {
                    const first = normalizedNav[0] as any;
                    const last = normalizedNav[normalizedNav.length - 1] as any;
                    const allKeys = ['portfolio', ...availableIndices, ...(totalBlendW > 0 ? ['Custom Blend'] : [])];
                    return (
                      <Card>
                        <SectionHeader title="Performance Summary" info="Return over the overlapping period (normalized to 100 at start)." icon={<BarChart3 size={16} />} />
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="text-left py-2 font-bold text-slate-500">Index</th>
                                <th className="text-right py-2 font-bold text-slate-500">Start</th>
                                <th className="text-right py-2 font-bold text-slate-500">End</th>
                                <th className="text-right py-2 font-bold text-slate-500">Return</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allKeys.map(k => {
                                const startVal = first[k] as number;
                                const endVal = last[k] as number;
                                if (!startVal || !endVal) return null;
                                const ret = ((endVal - startVal) / startVal) * 100;
                                return (
                                  <tr key={k} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="py-2 font-bold text-slate-700">{k === 'portfolio' ? 'My Portfolio' : k}</td>
                                    <td className="py-2 text-right text-slate-500">{startVal.toFixed(1)}</td>
                                    <td className="py-2 text-right text-slate-500">{endVal.toFixed(1)}</td>
                                    <td className={`py-2 text-right font-bold ${ret >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    );
                  })()}
                </>
              )}
            </>
          );
        })()}

        {/* ══════════════════════════════════ INCOME TAB ══════════════════════════════════ */}
        {activeTab === 'income' && (() => {
          // Filter by global date range
          const filtDivs = dividendData.filter(d => d.date && (!globalStart || d.date >= globalStart) && d.date <= globalEnd);
          const filtInts = interestData.filter(d => d.date && (!globalStart || d.date >= globalStart) && d.date <= globalEnd);
          const filtCash = cashLedger.filter(d => d.date && (!globalStart || d.date >= globalStart) && d.date <= globalEnd);

          // Totals (convert to USD using fixed rates for non-USD)
          const toUsd = (amount: number, currency: string) => {
            const c = (currency || 'USD').toUpperCase();
            if (c === 'HKD') return amount / marketConstants.exg_rate;
            if (c === 'AUD') return amount / marketConstants.aud_exg;
            if (c === 'SGD') return amount / marketConstants.sg_exg;
            return amount;
          };

          const totalDivGross = filtDivs.reduce((s, d) => s + toUsd(d.grossAmount, d.currency), 0);
          const totalDivTax = filtDivs.reduce((s, d) => s + toUsd(d.withholdingTax, d.currency), 0);
          const totalDivNet = filtDivs.reduce((s, d) => s + toUsd(d.netAmount, d.currency), 0);
          const totalInt = filtInts.reduce((s, d) => s + toUsd(d.amount, d.currency), 0);
          const totalIncome = totalDivNet + totalInt;

          // Cash ledger: deposits, withdrawals, fees
          const deposits = filtCash.filter(c => c.type.toLowerCase() === 'deposit').reduce((s, c) => s + toUsd(c.amount, c.currency), 0);
          const withdrawals = filtCash.filter(c => c.type.toLowerCase() === 'withdrawal').reduce((s, c) => s + toUsd(c.amount, c.currency), 0);
          const fees = filtCash.filter(c => c.type.toLowerCase() === 'fee').reduce((s, c) => s + toUsd(c.amount, c.currency), 0);
          const netCash = filtCash.reduce((s, c) => s + toUsd(c.amount, c.currency), 0);
          // Net cash flows for the filtered period
          const runningBalance = filtCash
            .filter(c => ['deposit','withdrawal','fee'].includes(c.type.toLowerCase()))
            .reduce((s, c) => s + toUsd(c.amount, c.currency), 0);

          // Monthly dividend aggregation
          const divByMonth = new Map<string, number>();
          filtDivs.forEach(d => {
            const key = d.date.substring(0, 7);
            divByMonth.set(key, (divByMonth.get(key) || 0) + toUsd(d.netAmount, d.currency));
          });
          const divMonthlyChart = Array.from(divByMonth.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([month, net]) => ({ month, net: Math.round(net) }));

          // Dividend by stock
          const divByStock = new Map<string, number>();
          filtDivs.forEach(d => { divByStock.set(d.symbol, (divByStock.get(d.symbol) || 0) + toUsd(d.netAmount, d.currency)); });
          const divStockChart = Array.from(divByStock.entries()).sort(([,a],[,b]) => b - a).slice(0, 15).map(([stock, net]) => ({ stock, net: Math.round(net) }));

          // Interest by type
          const intByType = new Map<string, number>();
          filtInts.forEach(d => { intByType.set(d.type || 'Other', (intByType.get(d.type || 'Other') || 0) + toUsd(d.amount, d.currency)); });
          const intTypeChart = Array.from(intByType.entries()).map(([type, amt]) => ({ type, amt: Math.round(amt) }));

          // Cash ledger timeline
          const cashTimeline: any[] = [];
          let runBal = 0;
          cashLedger.sort((a, b) => a.date.localeCompare(b.date)).forEach(c => {
            runBal += toUsd(c.amount, c.currency);
            cashTimeline.push({ date: c.date, balance: Math.round(runBal) });
          });

          const fmtUsd = (v: number) => v >= 0 ? `+$${Math.round(Math.abs(v)).toLocaleString()}` : `-$${Math.round(Math.abs(v)).toLocaleString()}`;

          return (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Net Dividend Income', value: totalDivNet, sub: `Tax withheld: $${Math.round(totalDivTax).toLocaleString()}` },
                  { label: 'Interest Income', value: totalInt, sub: `${filtInts.length} entries` },
                  { label: 'Total Income', value: totalIncome, sub: 'Div + Interest (USD)' },
                  { label: 'Net Cash Flows', value: runningBalance, sub: `Deposits: ${fmtUsd(deposits)}  Withdrawals: ${fmtUsd(withdrawals)}` },
                ].map(({ label, value, sub }) => (
                  <Card key={label}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                    <p className={`text-2xl font-black ${value >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {value >= 0 ? '+' : ''}{value < 0 ? '-' : ''}${Math.round(Math.abs(value)).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                  </Card>
                ))}
              </div>

              {/* Monthly dividend chart */}
              {divMonthlyChart.length > 0 && (
                <Card>
                  <SectionHeader title="Monthly Dividend Income (USD)" info="Net dividend received each month, converted to USD." icon={<TrendingUp size={16} />} />
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={divMonthlyChart}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                      <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Net Dividend']} />
                      <Bar dataKey="net" name="Net Dividend" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dividend by stock */}
                {divStockChart.length > 0 && (() => {
                  const maxTickerLen = Math.max(...divStockChart.map(d => (d.stock || '').length), 4);
                  const yAxisWidth = Math.max(60, maxTickerLen * 7 + 8);
                  const chartHeight = Math.max(240, divStockChart.length * 22 + 40);
                  return (
                    <Card>
                      <SectionHeader title="Dividend by Stock (USD Net)" info="Top 15 dividend-paying stocks in the period." icon={<Award size={16} />} />
                      <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={divStockChart} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                          <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fontSize: 9 }} />
                          <YAxis type="category" dataKey="stock" tick={{ fontSize: 9 }} width={yAxisWidth} />
                          <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Net Div']} />
                          <Bar dataKey="net" fill="#ef4444" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  );
                })()}

                {/* Interest by type */}
                {intTypeChart.length > 0 && (
                  <Card>
                    <SectionHeader title="Interest by Type (USD)" info="Interest/money-market income grouped by type." icon={<Zap size={16} />} />
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={intTypeChart}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="type" tick={{ fontSize: 9 }} />
                        <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Amount']} />
                        <Bar dataKey="amt" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>

              {/* Cash balance timeline */}
              {cashTimeline.length > 0 && (
                <Card>
                  <SectionHeader title="Cumulative Net Cash Flows" info="Running total of all cash ledger entries (deposits, withdrawals, fees). This is NOT the brokerage account cash balance — set that manually in Summary." icon={<Clock size={16} />} />
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={cashTimeline}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Balance']} />
                      <Area type="monotone" dataKey="balance" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Cash Ledger detail table */}
              {filtCash.length > 0 && (
                <Card>
                  <SectionHeader title="Cash Ledger" info="All cash transactions in the selected period." icon={<Layers size={16} />} />
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-100">
                          {['Date','Type','Description','Amount','Currency','Source'].map(h => (
                            <th key={h} className="text-left py-2 px-2 font-bold text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...filtCash].sort((a, b) => b.date.localeCompare(a.date)).map(c => (
                          <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-1.5 px-2 text-slate-600">{c.date}</td>
                            <td className="py-1.5 px-2">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${c.type.toLowerCase() === 'deposit' ? 'bg-red-50 text-red-600' : c.type.toLowerCase() === 'withdrawal' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{c.type}</span>
                            </td>
                            <td className="py-1.5 px-2 text-slate-600 max-w-xs truncate">{c.description}</td>
                            <td className={`py-1.5 px-2 font-bold text-right ${c.amount >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{c.amount >= 0 ? '+' : ''}{c.amount.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-slate-400">{c.currency}</td>
                            <td className="py-1.5 px-2 text-slate-400">{c.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Upload panel for independent income data upload */}
              {onIncomeUpload && (
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Upload Income Data</p>
                      <p className="text-xs text-slate-400 mt-0.5">Upload an Excel file containing Dividends, Interest, and/or Cash Ledger sheets to add income data independently.</p>
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl cursor-pointer hover:bg-blue-700 transition-colors text-xs font-semibold whitespace-nowrap">
                      <Upload size={13} /> Upload Income File
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { onIncomeUpload(f); e.target.value = ''; } }} />
                    </label>
                  </div>
                  {dividendData.length > 0 || interestData.length > 0 || cashLedger.length > 0 ? (
                    <div className="mt-3 flex gap-4 text-xs text-slate-500">
                      {dividendData.length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{dividendData.length} dividend records</span>}
                      {interestData.length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />{interestData.length} interest records</span>}
                      {cashLedger.length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />{cashLedger.length} cash ledger entries</span>}
                    </div>
                  ) : null}
                </Card>
              )}

              {filtDivs.length === 0 && filtInts.length === 0 && filtCash.length === 0 && (
                <Card>
                  <div className="text-center py-16">
                    <Upload size={40} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 text-sm">No income data for the selected period.</p>
                    <p className="text-slate-400 text-xs mt-1">Upload a file with Dividends, Interest, or Cash Ledger sheets.</p>
                  </div>
                </Card>
              )}
            </>
          );
        })()}
      </div>

      {/* Treemap Lightbox */}
      {treemapEnlarged && (() => {
        const treemapData = group2Data
          .filter((h: any) => (h.LastMV || 0) > 0)
          .map((h: any) => ({ name: h.Stock, size: Math.abs(h.LastMV || 0), mvPct: (h.MVPct || 0) * 100 }));
        const totalMv = treemapData.reduce((a: number, b: any) => a + b.size, 0);
        const withPct = treemapData.map((d: any) => ({
          ...d,
          mvPct: d.mvPct || (totalMv > 0 ? (d.size / totalMv) * 100 : 0),
          isOver: (d.mvPct || (totalMv > 0 ? (d.size / totalMv) * 100 : 0)) > concentrationThreshold,
        }));
        return (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6" onClick={() => setTreemapEnlarged(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[90vw] h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">Concentration Risk — threshold {concentrationThreshold}%</h3>
                <button onClick={() => setTreemapEnlarged(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><X size={18} /></button>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={withPct}
                    dataKey="size"
                    aspectRatio={16 / 9}
                    content={({ x, y, width, height, name, mvPct, isOver }: any) => {
                      if (!name || width <= 0 || height <= 0) return <g />;
                      const fill = isOver ? '#ef4444' : '#6366f1';
                      const showName = width > 28 && height > 18;
                      const showPct = width > 28 && height > 32;
                      const midY = y + height / 2;
                      const pctLabel = typeof mvPct === 'number' ? mvPct.toFixed(1) + '%' : '';
                      return (
                        <g>
                          <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} rx={3} />
                          {showName && <text x={x + width / 2} y={showPct ? midY - 7 : midY} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={Math.min(Math.max(width / ((name?.length || 1) + 1) * 1.5, 8), 14)} fontWeight="600">{name}</text>}
                          {showPct && pctLabel && <text x={x + width / 2} y={midY + 9} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.85)" fontSize={10}>{pctLabel}</text>}
                        </g>
                      );
                    }}
                  />
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Chart Lightbox */}
      {enlargedChart && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6" onClick={() => setEnlargedChart(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[85vw] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 text-sm">
                {enlargedChart === 'ratio-hk' ? 'Last / Cost — HK' : enlargedChart === 'ratio-ccs' ? 'Last / Cost — CCS' : enlargedChart === 'ratio-us' ? 'Last / Cost — US' : enlargedChart === 'ratio-aus' ? 'Last / Cost — AUS' : enlargedChart}
              </h3>
              <button onClick={() => setEnlargedChart(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><X size={18} /></button>
            </div>
            {(() => {
              const chartDataMap: Record<string, any[]> = { 'ratio-hk': priceRatioCharts.hk, 'ratio-ccs': priceRatioCharts.ccs, 'ratio-us': priceRatioCharts.us, 'ratio-aus': priceRatioCharts.aus };
              const data = chartDataMap[enlargedChart] || [];
              if (!data.length) return <p className="text-slate-400 text-sm text-center py-8">No data</p>;
              const barW = Math.max(20, Math.min(60, 900 / data.length));
              const chartW = Math.max(600, data.length * (barW + 8) + 100);
              return (
                <div className="overflow-x-auto">
                  <div style={{ width: `${chartW}px`, height: '400px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 20, right: 20, bottom: 50, left: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="ticker" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={55} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(1)}×`} domain={['auto', 'auto']} />
                        <Tooltip formatter={(v: any) => [`${Number(v).toFixed(3)}×`, 'Ratio']} labelFormatter={(l: any) => { const d = data.find((x: any) => x.ticker === l); return d ? `${l} — ${d.name}` : l; }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 12 }} />
                        <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: '1×', position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                        <Bar dataKey="ratio" barSize={barW} radius={[4, 4, 4, 4]} baseValue={1}>
                          {data.map((d: any, i: number) => <Cell key={i} fill={d.ratio >= 1 ? '#ef4444' : '#10b981'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
