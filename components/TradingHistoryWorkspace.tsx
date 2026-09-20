import React, { useRef, useState } from 'react';
import { Archive, Download, Link2, Upload } from 'lucide-react';
import { TradeEventAllocationData, TradeEventData } from '../types';
import TradeEventAllocationsTable from './TradeEventAllocationsTable';
import TradeEventsTable from './TradeEventsTable';

interface TradingHistoryWorkspaceProps {
  events: TradeEventData[];
  allocations: TradeEventAllocationData[];
  asOfDate?: string;
  onUpload: (file: File) => void;
  onExport: () => void;
}

type View = 'events' | 'allocations';

const TradingHistoryWorkspace: React.FC<TradingHistoryWorkspaceProps> = ({
  events,
  allocations,
  asOfDate,
  onUpload,
  onExport,
}) => {
  const [view, setView] = useState<View>('events');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full min-h-[680px] flex-col gap-4 pb-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = '';
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setView('events')}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
              view === 'events' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Archive size={15} /> Trade Events
            <span className="font-mono text-[10px] text-slate-400">{events.length.toLocaleString()}</span>
          </button>
          <button
            type="button"
            onClick={() => setView('allocations')}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
              view === 'allocations' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Link2 size={15} /> P&amp;L Allocations
            <span className="font-mono text-[10px] text-slate-400">{allocations.length.toLocaleString()}</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <Upload size={15} /> Upload Records
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
          >
            <Download size={15} /> Export Records
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'events' ? (
          <TradeEventsTable
            events={events}
            allocations={allocations}
            asOfDate={asOfDate}
          />
        ) : (
          <TradeEventAllocationsTable allocations={allocations} events={events} />
        )}
      </div>
    </div>
  );
};

export default TradingHistoryWorkspace;
