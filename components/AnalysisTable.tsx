
import React from 'react';
import { History } from 'lucide-react';

interface AnalysisTableProps {
  title: string;
  data: any[];
  currency: string;
}

const AnalysisTable: React.FC<AnalysisTableProps> = ({ title, data, currency }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
    <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
      <h3 className="font-black text-slate-800 flex items-center gap-2 text-xs uppercase tracking-tight">
        <History size={14} className="text-blue-500" /> {title} ({currency})
      </h3>
      <span className="text-[9px] font-black bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{data.length} STOCKS</span>
    </div>
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left text-[11px] whitespace-nowrap table-fixed border-collapse">
        <thead className="bg-slate-100/80 sticky top-0 z-10">
          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b">
            <th className="py-2 px-3 w-24 sticky left-0 bg-slate-100 z-20 border-r">Stock</th>
            <th className="py-2 px-3 w-32">Name</th>
            <th className="py-2 px-3 w-16 text-center">Pos</th>
            <th className="py-2 px-3 w-28 text-right">Current Cost (USD)</th>
            <th className="py-2 px-3 w-28 text-right">Avg Cost</th>
            <th className="py-2 px-3 w-24 text-right">Act Prc</th>
            <th className="py-2 px-3 w-24 text-right">Last Prc</th>
            <th className="py-2 px-3 w-24 text-right">Real P&L (USD)</th>
            <th className="py-2 px-3 w-28 text-right">Unrealized (USD)</th>
            <th className="py-2 px-3 w-20 text-right">Rtn%</th>
            <th className="py-2 px-3 w-28 text-right">Last MV (USD)</th>
            <th className="py-2 px-3 w-20 text-right">MV%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map(row => (
            <tr key={row.Stock} className={`hover:bg-slate-50 transition-colors group ${row.IsZero ? 'opacity-40 grayscale-[0.5]' : ''}`}>
              <td className="py-1.5 px-3 font-black text-blue-600 sticky left-0 bg-white z-10 border-r group-hover:bg-slate-50">{row.Stock}</td>
              <td className="py-1.5 px-3 truncate font-medium text-slate-500">{row.Name}</td>
              <td className="py-1.5 px-3 text-center font-mono">{row.IsZero ? '-' : row.Position.toLocaleString()}</td>
              <td className="py-1.5 px-3 text-right font-mono text-slate-600 font-bold">{row.CurrentCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className="py-1.5 px-3 text-right font-mono text-emerald-600 font-bold">{row.IsZero ? '-' : row.AvgPrice.toFixed(2)}</td>
              <td className="py-1.5 px-3 text-right font-mono text-emerald-700 font-black">{row.IsZero ? '-' : row.ActualPrice.toFixed(2)}</td>
              <td className="py-1.5 px-3 text-right font-mono font-black text-slate-900">{row.IsZero ? '-' : row.LastPrice.toFixed(2)}</td>
              <td className={`py-1.5 px-3 text-right font-black font-mono ${row.RealizedPnL >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {row.RealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
              <td className={`py-1.5 px-3 text-right font-black font-mono ${row.UnrealizedPnL >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {row.UnrealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
              <td className={`py-1.5 px-3 text-right font-black font-mono ${!row.IsZero && row.UnrealizedPct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {row.IsZero ? '-' : (row.UnrealizedPct * 100).toFixed(2)}%
              </td>
              <td className="py-1.5 px-3 text-right font-mono font-black text-slate-800">{row.IsZero ? '-' : row.LastMV.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className="py-1.5 px-3 text-right font-mono text-slate-400">{row.IsZero ? '-' : row.MV_Pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default AnalysisTable;
