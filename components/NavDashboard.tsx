import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Save, X, Trash2, TrendingUp, Upload, Calendar, Expand, Download } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { NavData, CashLedgerEntry, MarketConstants } from '../types';
import { generateId } from '../services/excelService';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area } from 'recharts';

type NavHeatFreq = 'weekly' | 'monthly' | 'quarterly' | 'annual';

const getNavFreqKey = (dateStr: string, freq: NavHeatFreq): string => {
  const d = new Date(dateStr.replace(/\//g, '-'));
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = d.getMonth();
  if (freq === 'annual') return `${year}`;
  if (freq === 'quarterly') return `${year}-Q${Math.floor(month / 3) + 1}`;
  if (freq === 'weekly') {
    const startOfYear = new Date(year, 0, 1);
    const week = Math.ceil((((d.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
    return `${year}-W${String(Math.min(week, 52)).padStart(2, '0')}`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
};

interface NavDashboardProps {
  data: NavData[];
  onUpdate: (data: NavData[]) => void;
  onUpload: (file: File) => void;
  onExport?: (data: NavData[]) => void;
  cashLedger?: CashLedgerEntry[];
  marketConstants?: MarketConstants;
}

const INITIAL_SHARES = 600_000;

/** Build a date→USD cash-flow map from Cash Ledger Deposit/Withdrawal entries. */
const buildLedgerFlowMap = (
  cashLedger: CashLedgerEntry[],
  mc?: MarketConstants
): Map<string, number> => {
  const map = new Map<string, number>();
  cashLedger.forEach(entry => {
    const type = (entry.type || '').toLowerCase();
    if (type !== 'deposit' && type !== 'withdrawal') return;
    // Convert to USD
    let amtUsd = entry.amount;
    if (mc) {
      const c = (entry.currency || 'USD').toUpperCase();
      if (c === 'HKD') amtUsd = amtUsd / mc.exg_rate;
      else if (c === 'AUD') amtUsd = amtUsd / mc.aud_exg;
      else if (c === 'SGD') amtUsd = amtUsd / mc.sg_exg;
    }
    const date = entry.date.replace(/\//g, '-');
    map.set(date, (map.get(date) || 0) + amtUsd);
  });
  return map;
};

/** Compute adjusted NAV fields from AUM + effective cashFlow (manual + ledger).
 *  Preserves original nav1, shares, cumulativeReturn from the uploaded file.
 *  Formula (previous-NAV share issuance):
 *    Day 0  → adjShares = 600,000 ; adjNav = AUM / 600,000
 *    Day N (effectiveCF = 0) → adjShares unchanged ; adjNav = AUM / adjShares
 *    Day N (effectiveCF ≠ 0) → sharesIssued = effectiveCF / prevAdjNav
 *                               adjShares = prevAdjShares + sharesIssued
 *                               adjNav    = AUM / adjShares
 */
const recomputeAll = (
  rawData: NavData[],
  cashLedger: CashLedgerEntry[] = [],
  mc?: MarketConstants
): NavData[] => {
  const ledgerMap = buildLedgerFlowMap(cashLedger, mc);
  const sorted = [...rawData].sort((a, b) =>
    new Date(a.date.replace(/\//g, '-')).getTime() - new Date(b.date.replace(/\//g, '-')).getTime()
  );
  let prevAdjShares = INITIAL_SHARES;
  let prevAdjNav = 1;
  let baseAdjNav = 1;
  return sorted.map((item, index) => {
    const normalizedDate = item.date.replace(/\//g, '-');
    const manualCF = item.cashFlow || 0;
    const ledgerCF = ledgerMap.get(normalizedDate) || 0;
    const effectiveCF = manualCF + ledgerCF;

    let adjShares: number;
    let adjNav: number;
    if (index === 0) {
      adjShares = INITIAL_SHARES;
      adjNav = INITIAL_SHARES > 0 ? item.aum / INITIAL_SHARES : 1;
      baseAdjNav = adjNav;
    } else if (effectiveCF !== 0) {
      // New shares issued at previous day's NAV
      const sharesIssued = prevAdjNav > 0 ? effectiveCF / prevAdjNav : 0;
      adjShares = prevAdjShares + sharesIssued;
      adjNav = adjShares > 0 ? item.aum / adjShares : 1;
    } else {
      adjShares = prevAdjShares;
      adjNav = adjShares > 0 ? item.aum / adjShares : 1;
    }
    prevAdjShares = adjShares;
    prevAdjNav = adjNav;
    const adjCumulativeReturn = baseAdjNav !== 0 ? (adjNav - baseAdjNav) / baseAdjNav : 0;
    return { ...item, adjNav, adjShares, adjCumulativeReturn };
  });
};

const NavDashboard: React.FC<NavDashboardProps> = ({ data, onUpdate, onUpload, onExport, cashLedger = [], marketConstants }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRecord, setNewRecord] = useState<Partial<NavData>>({ date: new Date().toISOString().split('T')[0], aum: 0, cashFlow: 0 });
  const [editRecord, setEditRecord] = useState<Partial<NavData>>({});
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [navHeatFreq, setNavHeatFreq] = useState<NavHeatFreq>('monthly');
  const [heatmapEnlarged, setHeatmapEnlarged] = useState(false);

  // Ledger flow map — rebuilt whenever cashLedger or marketConstants change
  const ledgerFlowMap = useMemo(() => buildLedgerFlowMap(cashLedger, marketConstants), [cashLedger, marketConstants]);

  // sortedData = raw data sorted + all derived adj fields (uses manual cashFlow + ledger flows)
  const sortedData = useMemo(() => recomputeAll(data, cashLedger, marketConstants), [data, cashLedger, marketConstants]);

  // Set periodStart to earliest date when data loads
  useMemo(() => {
    if (sortedData.length > 0 && !periodStart) {
      setPeriodStart(sortedData[0].date);
    }
  }, [sortedData]);

  const periodReturn = useMemo(() => {
    if (!periodStart || sortedData.length === 0) return null;
    const startRecord = sortedData.find(d => d.date >= periodStart);
    const endRecord = [...sortedData].reverse().find(d => d.date <= periodEnd);
    if (!startRecord || !endRecord || !startRecord.adjNav) return null;
    return ((endRecord.adjNav || 0) - startRecord.adjNav) / startRecord.adjNav;
  }, [sortedData, periodStart, periodEnd]);

  const handleAdd = () => {
    if (!newRecord.date || newRecord.aum === undefined) return;
    const newItem: NavData = {
      id: generateId(),
      date: newRecord.date,
      aum: newRecord.aum || 0,
      cashFlow: newRecord.cashFlow || 0,
      shares: 0, nav1: 0, nav2: 0, cumulativeReturn: 0,
    };
    // Compute adj values for the new item in the context of existing data, then
    // back-fill the original columns (nav1/nav2/shares/cumulativeReturn) so they
    // are stored with meaningful values rather than zeros.
    const newDataSet = [...data, newItem];
    const recomputed = recomputeAll(newDataSet, cashLedger, marketConstants);
    const comp = recomputed.find(r => r.id === newItem.id);
    const filledItem: NavData = {
      ...newItem,
      nav1: comp?.adjNav ?? 0,
      nav2: comp?.adjNav ?? 0,
      shares: comp?.adjShares ?? 0,
      cumulativeReturn: comp?.adjCumulativeReturn ?? 0,
    };
    onUpdate(newDataSet.map(d => d.id === newItem.id ? filledItem : d));
    setIsAdding(false);
    setNewRecord({ date: new Date().toISOString().split('T')[0], aum: 0, cashFlow: 0 });
  };

  const handleSaveEdit = () => {
    if (!editingId || !editRecord.date || editRecord.aum === undefined) return;
    const updatedData = data.map(item => {
      if (item.id === editingId) {
        return {
          ...item,
          date: editRecord.date || item.date,
          aum: editRecord.aum || 0,
          cashFlow: editRecord.cashFlow ?? item.cashFlow ?? 0,
        };
      }
      return item;
    });
    // Back-fill original columns for the edited record from newly computed adj values
    const recomputed = recomputeAll(updatedData, cashLedger, marketConstants);
    const filledData = updatedData.map(item => {
      if (item.id === editingId) {
        const comp = recomputed.find(r => r.id === editingId);
        return {
          ...item,
          nav1: comp?.adjNav ?? item.nav1,
          nav2: comp?.adjNav ?? item.nav2,
          shares: comp?.adjShares ?? item.shares,
          cumulativeReturn: comp?.adjCumulativeReturn ?? item.cumulativeReturn,
        };
      }
      return item;
    });
    onUpdate(filledData);
    setEditingId(null);
    setEditRecord({});
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      message: 'Delete this NAV record?',
      onConfirm: () => {
        onUpdate(data.filter(item => item.id !== id));
        setConfirmState(null);
      }
    });
  };

  const startEdit = (item: NavData) => {
    setEditingId(item.id);
    setEditRecord({ date: item.date, aum: item.aum, cashFlow: item.cashFlow ?? 0 });
  };

  // Chart Data (uses adjusted values)
  const chartData = sortedData.map(item => ({
    date: item.date,
    aum: item.aum,
    cumulativeReturn: (item.adjCumulativeReturn || 0) * 100 // Convert to %
  }));

  // NAV-based Cumulative Return & Drawdown (uses adjusted NAV)
  const navReturnData = useMemo(() => {
    if (sortedData.length === 0) return [];
    const base = sortedData[0].adjNav || 1;
    let peakNav = base;
    return sortedData.map(n => {
      const nav = n.adjNav || base;
      peakNav = Math.max(peakNav, nav);
      return {
        date: n.date,
        cumReturn: parseFloat(((nav - base) / base * 100).toFixed(2)),
        drawdown: parseFloat(((nav - peakNav) / peakNav * 100).toFixed(2)),
      };
    });
  }, [sortedData]);

  // NAV-based Heatmap (frequency-aware, date-format-safe, uses adjusted NAV)
  const navHeatmap = useMemo(() => {
    if (sortedData.length === 0) return { cells: [], years: [], columns: [] };
    const periodMap = new Map<string, { first: number; last: number }>();
    sortedData.forEach(n => {
      const key = getNavFreqKey(n.date, navHeatFreq);
      if (!key) return;
      const nav = n.adjNav || 1;
      if (!periodMap.has(key)) periodMap.set(key, { first: nav, last: nav });
      else periodMap.get(key)!.last = nav;
    });
    const cells: Array<{ year: string; col: string; ret: number }> = [];
    periodMap.forEach(({ first, last }, key) => {
      const ret = first !== 0 ? parseFloat(((last - first) / first * 100).toFixed(2)) : 0;
      // Derive year: everything before first '-' after 4th char
      const year = key.substring(0, 4);
      const col = navHeatFreq === 'annual' ? 'Annual' : key.substring(5); // e.g. '10', 'Q3', 'W42'
      cells.push({ year, col, ret });
    });
    const years = [...new Set(cells.map(c => c.year))].filter(y => /^\d{4}$/.test(y)).sort();
    let columns: string[];
    if (navHeatFreq === 'monthly') columns = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    else if (navHeatFreq === 'quarterly') columns = ['Q1','Q2','Q3','Q4'];
    else if (navHeatFreq === 'annual') columns = ['Annual'];
    else columns = Array.from({ length: 52 }, (_, i) => `W${String(i + 1).padStart(2, '0')}`);
    return { cells, years, columns };
  }, [sortedData, navHeatFreq]);

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><TrendingUp className="w-5 h-5 mr-2 text-blue-600" /> AUM & Cumulative Return</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorAum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{fontSize: 12}} tickLine={false} axisLine={false} tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12}} tickLine={false} axisLine={false} tickFormatter={(val) => `${val.toFixed(0)}%`} />
                <Tooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: number, name: string) => [
                        name === 'Cumulative Return' ? `${value.toFixed(2)}%` : `$${value.toLocaleString()}`,
                        name
                    ]}
                />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="aum" name="AUM" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAum)" />
                <Line yAxisId="right" type="monotone" dataKey="cumulativeReturn" name="Cumulative Return" stroke="#ef4444" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Latest Stats</h3>
                <div className="space-y-4">
                    <div>
                        <p className="text-sm text-slate-400">Current AUM</p>
                        <p className="text-2xl font-bold text-slate-800">${(sortedData[sortedData.length - 1]?.aum || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Adj Cumulative Return</p>
                        <p className={`text-2xl font-bold ${(sortedData[sortedData.length - 1]?.adjCumulativeReturn || 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {((sortedData[sortedData.length - 1]?.adjCumulativeReturn || 0) * 100).toFixed(2)}%
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Latest Adj NAV</p>
                        <p className="text-2xl font-bold text-slate-800">{(sortedData[sortedData.length - 1]?.adjNav || 0).toFixed(4)}</p>
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Calendar size={14} />Period Return</h3>
                <div className="space-y-2 mb-3">
                    <div>
                        <p className="text-xs text-slate-400 mb-1">From</p>
                        <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 mb-1">To</p>
                        <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                </div>
                {periodReturn !== null ? (
                    <p className={`text-2xl font-bold ${periodReturn >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {(periodReturn * 100).toFixed(2)}%
                    </p>
                ) : (
                    <p className="text-slate-400 text-sm">No data for selected period</p>
                )}
            </div>
        </div>
      </div>

      {/* NAV Cumulative Return & Drawdown */}
      {navReturnData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><TrendingUp className="w-5 h-5 mr-2 text-blue-600" /> Cumulative Return & Drawdown (NAV)</h3>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={navReturnData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 11 }} formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}%`, name]} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line yAxisId="left" type="monotone" dataKey="cumReturn" name="Cumulative Return" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Area yAxisId="right" type="monotone" dataKey="drawdown" name="Drawdown %" stroke="#ef4444" fill="#fecaca" fillOpacity={0.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* NAV Return Heatmap */}
      {navHeatmap.years.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">Return Heatmap (NAV)</h3>
            <div className="flex items-center gap-2">
              {(['weekly','monthly','quarterly','annual'] as NavHeatFreq[]).map(f => (
                <button key={f} onClick={() => setNavHeatFreq(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${navHeatFreq === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <button onClick={() => setHeatmapEnlarged(true)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Enlarge">
                <Expand size={14} />
              </button>
            </div>
          </div>
          {(() => {
            const absMax = Math.max(...navHeatmap.cells.map(c => Math.abs(c.ret)), 1);
            const cellBg = (ret: number, hasData: boolean) => {
              if (!hasData) return '#f1f5f9';
              const intensity = Math.min(Math.abs(ret) / absMax, 1);
              // red = profit, green = loss (app color semantics)
              return ret >= 0
                ? `rgba(239,68,68,${0.15 + intensity * 0.65})`
                : `rgba(16,185,129,${0.15 + intensity * 0.65})`;
            };
            const colLabels = navHeatFreq === 'monthly' ? MONTH_LABELS : navHeatmap.columns;
            const numCols = navHeatmap.columns.length;
            return (
              <div className="overflow-x-auto">
                <div style={{ minWidth: numCols > 12 ? `${numCols * 28 + 60}px` : '500px' }}>
                  <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `60px repeat(${numCols}, 1fr)` }}>
                    <div />
                    {colLabels.map(l => <div key={l} className="text-[9px] text-slate-400 text-center">{l}</div>)}
                  </div>
                  {navHeatmap.years.map(year => (
                    <div key={year} className="grid gap-1 mb-1" style={{ gridTemplateColumns: `60px repeat(${numCols}, 1fr)` }}>
                      <div className="text-[9px] text-slate-500 flex items-center pr-2">{year}</div>
                      {navHeatmap.columns.map(col => {
                        const cell = navHeatmap.cells.find(c => c.year === year && c.col === col);
                        const ret = cell?.ret ?? 0;
                        const intensity = Math.min(Math.abs(ret) / absMax, 1);
                        return (
                          <div key={col}
                            title={cell ? `${year}-${col}: ${ret > 0 ? '+' : ''}${ret.toFixed(2)}%` : `${year}-${col}: no data`}
                            className="h-10 rounded cursor-default flex items-center justify-center text-[9px] font-bold"
                            style={{ backgroundColor: cellBg(ret, !!cell), color: intensity > 0.5 ? 'white' : '#374151' }}>
                            {cell ? `${ret > 0 ? '+' : ''}${ret.toFixed(1)}%` : ''}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Heatmap Lightbox */}
      {heatmapEnlarged && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6" onClick={() => setHeatmapEnlarged(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[90vw] max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Return Heatmap (NAV) — {navHeatFreq}</h3>
              <button onClick={() => setHeatmapEnlarged(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X size={18} /></button>
            </div>
            {(() => {
              const absMax = Math.max(...navHeatmap.cells.map(c => Math.abs(c.ret)), 1);
              const colLabels = navHeatFreq === 'monthly' ? MONTH_LABELS : navHeatmap.columns;
              const numCols = navHeatmap.columns.length;
              return (
                <div>
                  <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `70px repeat(${numCols}, 1fr)` }}>
                    <div />
                    {colLabels.map(l => <div key={l} className="text-[10px] text-slate-400 text-center">{l}</div>)}
                  </div>
                  {navHeatmap.years.map(year => (
                    <div key={year} className="grid gap-1 mb-1" style={{ gridTemplateColumns: `70px repeat(${numCols}, 1fr)` }}>
                      <div className="text-[10px] text-slate-500 flex items-center pr-2">{year}</div>
                      {navHeatmap.columns.map(col => {
                        const cell = navHeatmap.cells.find(c => c.year === year && c.col === col);
                        const ret = cell?.ret ?? 0;
                        const intensity = Math.min(Math.abs(ret) / absMax, 1);
                        const bg = !cell ? '#f1f5f9' : ret >= 0
                          ? `rgba(239,68,68,${0.15 + intensity * 0.65})`
                          : `rgba(16,185,129,${0.15 + intensity * 0.65})`;
                        return (
                          <div key={col}
                            title={cell ? `${year}-${col}: ${ret > 0 ? '+' : ''}${ret.toFixed(2)}%` : `${year}-${col}: no data`}
                            className="h-12 rounded cursor-default flex items-center justify-center text-[10px] font-bold"
                            style={{ backgroundColor: bg, color: intensity > 0.5 ? 'white' : '#374151' }}>
                            {cell ? `${ret > 0 ? '+' : ''}${ret.toFixed(1)}%` : ''}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">Daily NAV Records</h3>
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">
              <Upload size={16} /><span>Upload</span>
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => { if(e.target.files?.[0]) onUpload(e.target.files[0]); }} />
            </label>
            {onExport && (
              <button onClick={() => onExport(sortedData)} className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                <Download size={16} /><span>Export</span>
              </button>
            )}
            <button onClick={() => setIsAdding(true)} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={16} /><span>Add Record</span>
            </button>
          </div>
        </div>
        
        {isAdding && (() => {
            const ledgerHint = newRecord.date ? (ledgerFlowMap.get(newRecord.date.replace(/\//g, '-')) || 0) : 0;
            return (
            <div className="p-4 bg-blue-50 border-b border-blue-100 flex flex-wrap items-center gap-3 animate-in slide-in-from-top-2">
                <input
                    type="date"
                    value={newRecord.date}
                    onChange={e => setNewRecord({...newRecord, date: e.target.value})}
                    className="px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                        type="number"
                        placeholder="AUM"
                        value={newRecord.aum || ''}
                        onChange={e => setNewRecord({...newRecord, aum: parseFloat(e.target.value)})}
                        className="pl-7 pr-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                    />
                </div>
                <div className="flex flex-col gap-0.5">
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input
                            type="number"
                            placeholder="Manual cash flow (optional)"
                            value={newRecord.cashFlow || ''}
                            onChange={e => setNewRecord({...newRecord, cashFlow: parseFloat(e.target.value) || 0})}
                            className="pl-7 pr-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                        />
                    </div>
                    {ledgerHint !== 0 && (
                        <span className="text-[11px] text-indigo-600 font-medium px-1">
                            Ledger: {ledgerHint > 0 ? '+' : ''}${ledgerHint.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} will be added automatically
                        </span>
                    )}
                </div>
                <button onClick={handleAdd} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Save size={18} /></button>
                <button onClick={() => setIsAdding(false)} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg"><X size={18} /></button>
            </div>
            );
        })()}

        {/* Frozen header: outer div must have overflow-y-auto + fixed height so sticky thead works */}
        <div className="overflow-x-auto">
          <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap">AUM</th>
                <th className="px-4 py-3 whitespace-nowrap text-slate-400">NAV</th>
                <th className="px-4 py-3 whitespace-nowrap text-slate-400">Cum. Return</th>
                <th className="px-4 py-3 whitespace-nowrap text-slate-400">Shares</th>
                <th className="px-4 py-3 whitespace-nowrap" title="Manual cash flow + Cash Ledger deposits/withdrawals">Cash Flow</th>
                <th className="px-4 py-3 whitespace-nowrap text-blue-600">Adj NAV</th>
                <th className="px-4 py-3 whitespace-nowrap text-blue-600">Adj Shares</th>
                <th className="px-4 py-3 whitespace-nowrap text-blue-600">Adj Cum. Return</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedData.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-8 text-center text-slate-400">No NAV records found. Upload a file or add a record.</td></tr>
              ) : (
                [...sortedData].reverse().map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {editingId === item.id ? (
                            <input
                                type="date"
                                value={editRecord.date}
                                onChange={e => setEditRecord({...editRecord, date: e.target.value})}
                                className="px-2 py-1 rounded border border-slate-300"
                            />
                        ) : item.date}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                        {editingId === item.id ? (
                            <input
                                type="number"
                                value={editRecord.aum}
                                onChange={e => setEditRecord({...editRecord, aum: parseFloat(e.target.value)})}
                                className="px-2 py-1 rounded border border-slate-300 w-32"
                            />
                        ) : `$${item.aum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                    </td>
                    {/* Original values from file */}
                    <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap text-xs">{item.nav1 ? item.nav1.toFixed(4) : '—'}</td>
                    <td className={`px-4 py-3 font-mono whitespace-nowrap text-xs ${(item.cumulativeReturn || 0) >= 0 ? 'text-slate-400' : 'text-slate-400'}`}>
                        {item.cumulativeReturn != null ? `${(item.cumulativeReturn * 100).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap text-xs">
                        {item.shares ? Math.round(item.shares).toLocaleString() : '—'}
                    </td>
                    {/* Cash Flow — shows effective total (manual + ledger) */}
                    {(() => {
                      const normalizedDate = item.date.replace(/\//g, '-');
                      const ledgerCF = ledgerFlowMap.get(normalizedDate) || 0;
                      const manualCF = item.cashFlow || 0;
                      const effectiveCF = manualCF + ledgerCF;
                      return (
                        <td className={`px-4 py-3 font-mono whitespace-nowrap ${effectiveCF > 0 ? 'text-blue-600' : effectiveCF < 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {editingId === item.id ? (
                            <div className="flex flex-col gap-0.5">
                              <input
                                type="number"
                                value={editRecord.cashFlow ?? 0}
                                onChange={e => setEditRecord({...editRecord, cashFlow: parseFloat(e.target.value) || 0})}
                                className="px-2 py-1 rounded border border-slate-300 w-32"
                              />
                              {ledgerCF !== 0 && (
                                <span className="text-[10px] text-indigo-500">+Ledger: {ledgerCF > 0 ? '+' : ''}${ledgerCF.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
                              )}
                            </div>
                          ) : effectiveCF !== 0 ? (
                            <div className="flex flex-col leading-tight">
                              <span>{effectiveCF > 0 ? '+' : ''}${effectiveCF.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                              {ledgerCF !== 0 && (
                                <span className="text-[10px] text-indigo-400 font-normal">
                                  {manualCF !== 0 ? `Manual ${manualCF > 0 ? '+' : ''}$${manualCF.toLocaleString(undefined, {maximumFractionDigits: 0})} · ` : ''}
                                  Ledger {ledgerCF > 0 ? '+' : ''}${ledgerCF.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                </span>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                      );
                    })()}
                    {/* Adjusted values */}
                    <td className="px-4 py-3 font-mono text-blue-700 font-semibold whitespace-nowrap">{(item.adjNav || 0).toFixed(4)}</td>
                    <td className="px-4 py-3 font-mono text-blue-600 whitespace-nowrap">
                        {Math.round(item.adjShares || 0).toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 font-mono font-semibold whitespace-nowrap ${(item.adjCumulativeReturn || 0) >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {((item.adjCumulativeReturn || 0) * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                        {editingId === item.id ? (
                            <div className="flex justify-end space-x-2">
                                <button onClick={handleSaveEdit} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded"><Save size={16} /></button>
                                <button onClick={() => setEditingId(null)} className="text-slate-500 hover:bg-slate-100 p-1 rounded"><X size={16} /></button>
                            </div>
                        ) : (
                            <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEdit(item)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                            </div>
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
      {confirmState && <ConfirmDialog message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default NavDashboard;
