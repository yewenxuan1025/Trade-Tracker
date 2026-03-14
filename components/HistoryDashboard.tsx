
import React, { useMemo, useState } from 'react';
import { PnLData, MarketConstants, TransactionData, LookupSheetData } from '../types';
import { calculatePortfolioAnalysis } from '../services/excelService';
import AnalysisTable from './AnalysisTable';
import { ZoomIn, ZoomOut, Archive } from 'lucide-react';

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

      <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left', width: `${100 / zoomLevel}%` }}>
        <AnalysisTable title={`Historical HK Stocks (${dateStr})`} data={historyHk} currency="HKD" />
        <AnalysisTable title={`Historical US/Global Stocks (${dateStr})`} data={historyNonHk} currency="USD" />
      </div>
    </div>
  );
};

export default HistoryDashboard;
