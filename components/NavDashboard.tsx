import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Save, X, Trash2, TrendingUp, Upload, Calendar, Expand } from 'lucide-react';
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
  cashLedger?: CashLedgerEntry[];
  marketConstants?: MarketConstants;
}

const INITIAL_SHARES = 600_000;

/** Recompute shares, nav1, nav2, cumulativeReturn for every row from AUM + cashFlow.
 *  Formula:
 *    Day 0  → shares = 600,000 ; adjNAV = AUM / 600,000
 *    Day N (cashFlow = 0) → shares unchanged ; adjNAV = AUM / shares
 *    Day N (cashFlow ≠ 0) → adjNAV = (AUM − cashFlow) / prevShares
 *                            newShares = prevShares + cashFlow / adjNAV
 *                            adjNAV = AUM / newShares  (self-consistent by algebra)
 */
const recomputeAll = (rawData: NavData[]): NavData[] => {
  const sorted = [...rawData].sort((a, b) =>
    new Date(a.date.replace(/\//g, '-')).getTime() - new Date(b.date.replace(/\//g, '-')).getTime()
  );
  let prevShares = INITIAL_SHARES;
  let baseNav = 1;
  return sorted.map((item, index) => {
    const cashFlow = item.cashFlow || 0;
    let shares: number;
    let adjNav: number;
    if (index === 0) {
      shares = INITIAL_SHARES;
      adjNav = INITIAL_SHARES > 0 ? item.aum / INITIAL_SHARES : 1;
      baseNav = adjNav;
    } else if (cashFlow !== 0) {
      // Algebraically: adjNAV*(prevShares + cashFlow/adjNAV) = AUM  ⟹  adjNAV = (AUM−cashFlow)/prevShares
      adjNav = prevShares > 0 ? (item.aum - cashFlow) / prevShares : 1;
      if (adjNav <= 0) adjNav = 1e-6;
      shares = prevShares + cashFlow / adjNav;
    } else {
      shares = prevShares;
      adjNav = shares > 0 ? item.aum / shares : 1;
    }
    prevShares = shares;
    const cumReturn = baseNav !== 0 ? (adjNav - baseNav) / baseNav : 0;
    return { ...item, shares, nav1: adjNav, nav2: adjNav, cumulativeReturn: cumReturn };
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NavDashboard: React.FC<NavDashboardProps> = ({ data, onUpdate, onUpload, cashLedger: _cashLedger, marketConstants: _marketConstants }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRecord, setNewRecord] = useState<Partial<NavData>>({ date: new Date().toISOString().split('T')[0], aum: 0, cashFlow: 0 });
  const [editRecord, setEditRecord] = useState<Partial<NavData>>({});
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [navHeatFreq, setNavHeatFreq] = useState<NavHeatFreq>('monthly');
  const [heatmapEnlarged, setHeatmapEnlarged] = useState(false);

  // sortedData = raw data sorted + all derived fields recomputed
  const sortedData = useMemo(() => recomputeAll(data), [data]);

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
    if (!startRecord || !endRecord || startRecord.nav2 === 0) return null;
    return (endRecord.nav2 - startRecord.nav2) / startRecord.nav2;
  }, [sortedData, periodStart, periodEnd]);

  const handleAdd = () => {
    if (!newRecord.date || newRecord.aum === undefined) return;
    const newItem: NavData = {
      id: generateId(),
      date: newRecord.date,
      aum: newRecord.aum || 0,
      cashFlow: newRecord.cashFlow || 0,
      shares: 0, nav1: 0, nav2: 0, cumulativeReturn: 0, // recomputed by recomputeAll via sortedData
    };
    onUpdate([...data, newItem]);
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
    onUpdate(updatedData);
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

  // Chart Data
  const chartData = sortedData.map(item => ({
    date: item.date,
    aum: item.aum,
    cumulativeReturn: item.cumulativeReturn * 100 // Convert to %
  }));

  // NAV-based Cumulative Return & Drawdown (simple return from base NAV)
  const navReturnData = useMemo(() => {
    if (sortedData.length === 0) return [];
    const base = sortedData[0].nav1 || sortedData[0].nav2 || 1;
    let peakNav = base;
    return sortedData.map(n => {
      const nav = n.nav1 || n.nav2 || base;
      peakNav = Math.max(peakNav, nav);
      return {
        date: n.date,
        cumReturn: parseFloat(((nav - base) / base * 100).toFixed(2)),
        drawdown: parseFloat(((nav - peakNav) / peakNav * 100).toFixed(2)),
      };
    });
  }, [sortedData]);

  // NAV-based Heatmap (frequency-aware, date-format-safe)
  const navHeatmap = useMemo(() => {
    if (sortedData.length === 0) return { cells: [], years: [], columns: [] };
    const periodMap = new Map<string, { first: number; last: number }>();
    sortedData.forEach(n => {
      const key = getNavFreqKey(n.date, navHeatFreq);
      if (!key) return;
      const nav = n.nav1 || n.nav2 || 1;
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
                        <p className="text-sm text-slate-400">Cumulative Return</p>
                        <p className={`text-2xl font-bold ${(sortedData[sortedData.length - 1]?.cumulativeReturn || 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {((sortedData[sortedData.length - 1]?.cumulativeReturn || 0) * 100).toFixed(2)}%
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Latest NAV</p>
                        <p className="text-2xl font-bold text-slate-800">{(sortedData[sortedData.length - 1]?.nav2 || 0).toFixed(4)}</p>
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
            <button onClick={() => setIsAdding(true)} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={16} /><span>Add Record</span>
            </button>
          </div>
        </div>
        
        {isAdding && (
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
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                        type="number"
                        placeholder="Cash Flow (+ deposit / − withdrawal)"
                        value={newRecord.cashFlow || ''}
                        onChange={e => setNewRecord({...newRecord, cashFlow: parseFloat(e.target.value) || 0})}
                        className="pl-7 pr-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                    />
                </div>
                <button onClick={handleAdd} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Save size={18} /></button>
                <button onClick={() => setIsAdding(false)} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg"><X size={18} /></button>
            </div>
        )}

        {/* Frozen header: outer div must have overflow-y-auto + fixed height so sticky thead works */}
        <div className="overflow-x-auto">
          <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 whitespace-nowrap">Date</th>
                <th className="px-6 py-4 whitespace-nowrap">AUM</th>
                <th className="px-6 py-4 whitespace-nowrap">Cash Flow</th>
                <th className="px-6 py-4 whitespace-nowrap">Adj NAV</th>
                <th className="px-6 py-4 whitespace-nowrap">Cumulative Return</th>
                <th className="px-6 py-4 whitespace-nowrap">Adj Shares</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedData.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">No NAV records found. Upload a file or add a record.</td></tr>
              ) : (
                [...sortedData].reverse().map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                        {editingId === item.id ? (
                            <input
                                type="date"
                                value={editRecord.date}
                                onChange={e => setEditRecord({...editRecord, date: e.target.value})}
                                className="px-2 py-1 rounded border border-slate-300"
                            />
                        ) : item.date}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600 whitespace-nowrap">
                        {editingId === item.id ? (
                            <input
                                type="number"
                                value={editRecord.aum}
                                onChange={e => setEditRecord({...editRecord, aum: parseFloat(e.target.value)})}
                                className="px-2 py-1 rounded border border-slate-300 w-32"
                            />
                        ) : `$${item.aum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                    </td>
                    <td className={`px-6 py-4 font-mono whitespace-nowrap ${(item.cashFlow || 0) > 0 ? 'text-blue-600' : (item.cashFlow || 0) < 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {editingId === item.id ? (
                            <input
                                type="number"
                                value={editRecord.cashFlow ?? 0}
                                onChange={e => setEditRecord({...editRecord, cashFlow: parseFloat(e.target.value) || 0})}
                                className="px-2 py-1 rounded border border-slate-300 w-32"
                            />
                        ) : (item.cashFlow && item.cashFlow !== 0)
                            ? `${item.cashFlow > 0 ? '+' : ''}$${item.cashFlow.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                            : '—'
                        }
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600 whitespace-nowrap">{(item.nav2 || 0).toFixed(4)}</td>
                    <td className={`px-6 py-4 font-mono font-medium whitespace-nowrap ${(item.cumulativeReturn || 0) >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {((item.cumulativeReturn || 0) * 100).toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500 whitespace-nowrap">
                        {Math.round(item.shares).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
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
