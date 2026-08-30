import React from 'react';
import { MarketConstants } from '../types';
import { Calendar, DollarSign, Globe, TrendingUp } from 'lucide-react';

interface SummaryCardsProps {
  data: MarketConstants;
  onUpdate: (key: keyof MarketConstants, value: string | number) => void;
}

interface ExchangeRateInputProps {
  value: number;
  focusClassName: string;
  onChange: (value: number) => void;
}

const formatExchangeRate = (value: number) => Number.isFinite(value) ? value.toFixed(2) : '';

const ExchangeRateInput: React.FC<ExchangeRateInputProps> = ({ value, focusClassName, onChange }) => {
  const [draft, setDraft] = React.useState(() => formatExchangeRate(value));
  const isEditing = React.useRef(false);

  React.useEffect(() => {
    if (!isEditing.current) setDraft(formatExchangeRate(value));
  }, [value]);

  return (
    <input
      type="number"
      step="0.01"
      className={`w-full text-lg font-bold text-slate-800 bg-transparent border-b border-slate-200 focus:outline-none transition-colors ${focusClassName}`}
      value={draft}
      onFocus={() => { isEditing.current = true; }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        const parsed = Number(nextDraft);
        if (nextDraft !== '' && Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        isEditing.current = false;
        const parsed = Number(draft);
        setDraft(draft !== '' && Number.isFinite(parsed) ? parsed.toFixed(2) : formatExchangeRate(value));
      }}
    />
  );
};

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
          <ExchangeRateInput
            value={data.exg_rate}
            focusClassName="focus:border-emerald-500"
            onChange={(value) => onUpdate('exg_rate', value)}
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
          <ExchangeRateInput
            value={data.aud_exg}
            focusClassName="focus:border-amber-500"
            onChange={(value) => onUpdate('aud_exg', value)}
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
          <ExchangeRateInput
            value={data.sg_exg}
            focusClassName="focus:border-indigo-500"
            onChange={(value) => onUpdate('sg_exg', value)}
          />
        </div>
      </div>
    </div>
  );
};

export default SummaryCards;
