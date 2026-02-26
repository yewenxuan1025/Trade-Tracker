
import React, { useMemo, useState } from 'react';
import { PnLData, MarketConstants, TransactionData, LookupSheetData } from '../types';
import { calculatePortfolioAnalysis } from '../services/excelService';
import AnalysisTable from './AnalysisTable';
import { ZoomIn, ZoomOut, Archive, TrendingUp, BarChart2, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, ComposedChart } from 'recharts';

interface HistoryDashboardProps {
  pnlData: PnLData[];
  transactions: TransactionData[];
  lookupData: LookupSheetData | null;
  marketConstants: MarketConstants;
  cashPosition: number;
  optionPosition: number;
}

const HistoryDashboard: React.FC<HistoryDashboardProps> = ({ pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition }) => {
  const [zoomLevel, setZoomLevel] = useState(1);

  const { group1 } = useMemo(() => {
    const analysis = calculatePortfolioAnalysis(pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition);
    return {
      group1: {
        hk: analysis.g1Hk,
        nonHk: analysis.g1NonHk
      }
    };
  }, [pnlData, transactions, lookupData, marketConstants, cashPosition, optionPosition]);

  // Filter for IsZero === true (Historical/Closed Positions)
  const historyHk = group1.hk.filter(s => s.IsZero);
  const historyNonHk = group1.nonHk.filter(s => s.IsZero);

  const dateStr = marketConstants.date.replace(/-/g, '');

  // --- Chart Data Preparation ---

  // 1. Cumulative P&L Data
  const cumulativePnlData = useMemo(() => {
    const sorted = [...pnlData].sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());
    let cumulative = 0;
    return sorted.map(p => {
        let rate = 1;
        const m = (p.market || '').toUpperCase().trim();
        if (m === 'HK') rate = marketConstants.exg_rate;
        else if (m === 'SG') rate = marketConstants.sg_exg;
        else if (m === 'AUD' || m === 'AUS') rate = marketConstants.aud_exg;
        
        const pnlUsd = p.realizedPnL / rate;
        cumulative += pnlUsd;
        return {
            date: p.sellDate,
            pnl: cumulative,
            dailyPnl: pnlUsd
        };
    });
  }, [pnlData, marketConstants]);

  // 2. Stock Frequency & Avg P&L
  const stockStats = useMemo(() => {
    const stats = new Map<string, { count: number, totalPnl: number }>();
    pnlData.forEach(p => {
        const stock = p.stock.toUpperCase();
        let rate = 1;
        const m = (p.market || '').toUpperCase().trim();
        if (m === 'HK') rate = marketConstants.exg_rate;
        else if (m === 'SG') rate = marketConstants.sg_exg;
        else if (m === 'AUD' || m === 'AUS') rate = marketConstants.aud_exg;
        
        const pnlUsd = p.realizedPnL / rate;
        
        const current = stats.get(stock) || { count: 0, totalPnl: 0 };
        current.count += 1;
        current.totalPnl += pnlUsd;
        stats.set(stock, current);
    });
    
    return Array.from(stats.entries()).map(([stock, { count, totalPnl }]) => ({
        stock,
        count,
        avgPnl: totalPnl / count
    })).sort((a, b) => b.count - a.count).slice(0, 15); // Top 15 by frequency
  }, [pnlData, marketConstants]);

  // 3. Holding Period Distribution
  const holdingDistribution = useMemo(() => {
    const buckets = {
        '0-7 Days': 0,
        '8-30 Days': 0,
        '1-3 Months': 0,
        '3-6 Months': 0,
        '6-12 Months': 0,
        '> 1 Year': 0
    };
    
    pnlData.forEach(p => {
        const days = p.holdingDays || 0;
        if (days <= 7) buckets['0-7 Days']++;
        else if (days <= 30) buckets['8-30 Days']++;
        else if (days <= 90) buckets['1-3 Months']++;
        else if (days <= 180) buckets['3-6 Months']++;
        else if (days <= 365) buckets['6-12 Months']++;
        else buckets['> 1 Year']++;
    });
    
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  }, [pnlData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg">
          <p className="text-xs font-bold text-slate-700 mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs font-mono" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? 
                (entry.name.includes('P&L') || entry.name.includes('Avg') ? `$${entry.value.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}` : entry.value) 
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-1 pb-20">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-800 uppercase flex items-center gap-3">
             <div className="p-2 bg-slate-200 rounded-lg"><Archive className="text-slate-600 w-6 h-6" /></div>
             Historical / Closed Positions
        </h2>
        <div className="flex items-center gap-4 bg-white border px-3 py-1.5 rounded-xl shadow-sm">
            <ZoomOut size={14} className="text-slate-400" />
            <input type="range" min="50" max="100" step="5" value={zoomLevel * 100} onChange={(e) => setZoomLevel(parseInt(e.target.value) / 100)} className="w-24 accent-blue-600" />
            <ZoomIn size={14} className="text-slate-400" />
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* 1. Cumulative P&L Line Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Cumulative P&L Over Time (USD)</h3>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cumulativePnlData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} minTickGap={30} />
                        <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}} />
                        <Line type="monotone" dataKey="pnl" name="Cumulative P&L" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* 2. Trading Frequency & Avg P&L */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Top Traded Stocks & Avg P&L</h3>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={stockStats} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="stock" tick={{fontSize: 9}} tickLine={false} axisLine={false} interval={0} />
                        <YAxis yAxisId="left" orientation="left" tick={{fontSize: 10}} tickLine={false} axisLine={false} label={{ value: 'Trades', angle: -90, position: 'insideLeft', style: {fontSize: 10, fill: '#94a3b8'} }} />
                        <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}} />
                        <Bar yAxisId="left" dataKey="count" name="Trade Count" fill="#8b5cf6" barSize={20} radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="avgPnl" name="Avg P&L (USD)" stroke="#10b981" strokeWidth={2} dot={{r: 3}} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* 3. Holding Period Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-orange-500" />
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Holding Period Distribution</h3>
            </div>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={holdingDistribution} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="range" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                        <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Trades" fill="#f97316" radius={[4, 4, 0, 0]}>
                            {holdingDistribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412'][index % 6]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

      </div>
      
      <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left', width: `${100 / zoomLevel}%` }}>
        <AnalysisTable title={`Historical HK Stocks (${dateStr})`} data={historyHk} currency="HKD" />
        <AnalysisTable title={`Historical US/Global Stocks (${dateStr})`} data={historyNonHk} currency="USD" />
      </div>
    </div>
  );
};

export default HistoryDashboard;
