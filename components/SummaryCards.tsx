import React from 'react';
import { MarketConstants } from '../types';
import { Calendar, DollarSign, Globe, TrendingUp } from 'lucide-react';

interface SummaryCardsProps {
  data: MarketConstants;
  onUpdate: (key: keyof MarketConstants, value: string | number) => void;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ data, onUpdate }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Date Input */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-blue-50">
          <Calendar className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 block mb-1">Date Current</label>
          <input 
            type="date"
            className="w-full text-sm font-bold text-slate-800 bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none transition-colors"
            value={data.date}
            onChange={(e) => onUpdate('date', e.target.value)}
          />
        </div>
      </div>

      {/* HKD Exchange Input */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-emerald-50">
          <DollarSign className="w-6 h-6 text-emerald-600" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 block mb-1">HKD Exchange</label>
          <input 
            type="number"
            step="0.0001"
            className="w-full text-lg font-bold text-slate-800 bg-transparent border-b border-slate-200 focus:border-emerald-500 focus:outline-none transition-colors"
            value={data.exg_rate}
            onChange={(e) => onUpdate('exg_rate', parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* AUD Exchange Input */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-amber-50">
          <Globe className="w-6 h-6 text-amber-600" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 block mb-1">AUD Exchange</label>
          <input 
            type="number"
            step="0.0001"
            className="w-full text-lg font-bold text-slate-800 bg-transparent border-b border-slate-200 focus:border-amber-500 focus:outline-none transition-colors"
            value={data.aud_exg}
            onChange={(e) => onUpdate('aud_exg', parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* SGD Exchange Input */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-indigo-50">
          <TrendingUp className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500 block mb-1">SGD Exchange</label>
          <input 
            type="number"
            step="0.0001"
            className="w-full text-lg font-bold text-slate-800 bg-transparent border-b border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors"
            value={data.sg_exg}
            onChange={(e) => onUpdate('sg_exg', parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
};

export default SummaryCards;