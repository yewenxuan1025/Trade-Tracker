import React, { useMemo, useRef, useState } from 'react';
import { Archive, CalendarDays, Download, Search, Upload } from 'lucide-react';
import { TradeEventData } from '../types';

interface TradeEventsTableProps {
  events: TradeEventData[];
  asOfDate?: string;
  onUpload: (file: File) => void;
  onExport: () => void;
}

type DateFilter = 'All' | 'Week' | 'Month' | 'Year' | 'Custom';

const formatNumber = (value: number | undefined): string =>
  (Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseDateOnly = (value?: string): Date | null => {
  const matched = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) return null;
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const shiftUtcMonths = (date: Date, months: number): Date => {
  const shifted = new Date(date);
  const originalDay = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(originalDay, lastDay));
  return shifted;
};

const TradeEventsTable: React.FC<TradeEventsTableProps> = ({ events, asOfDate, onUpload, onExport }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assetType, setAssetType] = useState<'All' | 'Stock' | 'Option'>('All');
  const [recordStatus, setRecordStatus] = useState<'All' | TradeEventData['recordStatus']>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('All');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const referenceDate = useMemo(() => {
    const configured = parseDateOnly(asOfDate);
    if (configured) return configured;
    const latestEventDate = [...events]
      .map(event => parseDateOnly(event.date))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return latestEventDate || new Date();
  }, [asOfDate, events]);

  const dateRange = useMemo(() => {
    const end = formatDateOnly(referenceDate);
    if (dateFilter === 'Week') {
      const start = new Date(referenceDate);
      start.setUTCDate(start.getUTCDate() - 6);
      return { start: formatDateOnly(start), end };
    }
    if (dateFilter === 'Month') return { start: formatDateOnly(shiftUtcMonths(referenceDate, -1)), end };
    if (dateFilter === 'Year') return { start: formatDateOnly(shiftUtcMonths(referenceDate, -12)), end };
    if (dateFilter === 'Custom') return { start: customFromDate, end: customToDate };
    return { start: '', end: '' };
  }, [customFromDate, customToDate, dateFilter, referenceDate]);

  const filteredEvents = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return [...events]
      .filter(event => assetType === 'All' || event.assetType === assetType)
      .filter(event => recordStatus === 'All' || event.recordStatus === recordStatus)
      .filter(event => {
        const eventDate = String(event.date || '').slice(0, 10);
        if (dateRange.start && eventDate < dateRange.start) return false;
        if (dateRange.end && eventDate > dateRange.end) return false;
        return true;
      })
      .filter(event => !needle || [
        event.stock,
        event.name,
        event.market,
        event.action,
        event.source,
        event.option,
        event.linkedPnlTradeNumber,
      ].some(value => String(value || '').toLowerCase().includes(needle)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
  }, [assetType, dateRange, events, recordStatus, searchTerm]);

  const recordedCount = events.filter(event => event.recordStatus === 'Recorded').length;

  return (
    <div className="flex flex-col h-full min-h-[620px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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

      <div className="p-5 border-b border-slate-200 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Archive className="w-5 h-5 text-blue-600" /> Trading History
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Permanent trading ledger · {recordedCount} recorded · {events.length} total audit records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <Upload size={15} /> Upload History
            </button>
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Download size={15} /> Export History
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search ticker, name, action, source or P&L number"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={assetType}
            onChange={event => setAssetType(event.target.value as typeof assetType)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            <option value="All">All assets</option>
            <option value="Stock">Stocks</option>
            <option value="Option">Options</option>
          </select>
          <select
            value={recordStatus}
            onChange={event => setRecordStatus(event.target.value as typeof recordStatus)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            <option value="All">All records</option>
            <option value="Recorded">Recorded</option>
            <option value="Superseded">Superseded</option>
            <option value="Deleted">Deleted</option>
          </select>
          <span className="text-xs font-semibold text-slate-400">{filteredEvents.length} shown</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 mr-1 text-xs font-bold text-slate-500">
            <CalendarDays size={14} /> Date range
          </span>
          {([
            ['All', 'All'],
            ['Week', 'Last 7 Days'],
            ['Month', 'Last 1 Month'],
            ['Year', 'Last 1 Year'],
            ['Custom', 'Custom Range'],
          ] as [DateFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDateFilter(value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                dateFilter === value
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {label}
            </button>
          ))}
          {dateFilter === 'Custom' && (
            <div className="flex flex-wrap items-center gap-2 ml-1">
              <input
                type="date"
                value={customFromDate}
                max={customToDate || undefined}
                onChange={event => setCustomFromDate(event.target.value)}
                aria-label="Trading history start date"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customToDate}
                min={customFromDate || undefined}
                onChange={event => setCustomToDate(event.target.value)}
                aria-label="Trading history end date"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600"
              />
            </div>
          )}
          {dateFilter !== 'All' && dateRange.start && dateRange.end && (
            <span className="ml-auto text-[11px] font-medium text-slate-400">
              {dateRange.start} — {dateRange.end}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="min-w-[1550px] w-full text-left">
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              {['Date', 'Asset', 'Stock', 'Name', 'Market', 'Action', 'Price', 'Shares', 'Commission', 'Total', 'Source', 'Option', 'Expiration', 'Strike', 'Status', 'Linked P&L', 'Event ID'].map(label => (
                <th key={label} className="px-4 py-3 font-bold whitespace-nowrap">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEvents.map(event => (
              <tr key={event.id} className="text-sm hover:bg-slate-50/80">
                <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{event.date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black ${event.assetType === 'Option' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {event.assetType}
                  </span>
                </td>
                <td className="px-4 py-3 font-black text-slate-800 whitespace-nowrap">{event.stock}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{event.name}</td>
                <td className="px-4 py-3 text-slate-500">{event.market}</td>
                <td className="px-4 py-3 font-bold text-slate-700">{event.action}</td>
                <td className="px-4 py-3 font-mono text-right">{formatNumber(event.price)}</td>
                <td className="px-4 py-3 font-mono text-right">{formatNumber(event.shares)}</td>
                <td className="px-4 py-3 font-mono text-right">{formatNumber(event.commission)}</td>
                <td className="px-4 py-3 font-mono text-right">{formatNumber(event.total)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{event.source}</td>
                <td className="px-4 py-3 text-slate-500">{event.option}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{event.expiration}</td>
                <td className="px-4 py-3 font-mono text-right">{event.strike ? formatNumber(event.strike) : ''}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black ${
                    event.recordStatus === 'Recorded'
                      ? 'bg-emerald-100 text-emerald-700'
                      : event.recordStatus === 'Superseded'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-200 text-slate-600'
                  }`}>
                    {event.recordStatus}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500 text-center">{event.linkedPnlTradeNumber || ''}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-slate-400 max-w-[180px] truncate" title={String(event.id)}>{event.id}</td>
              </tr>
            ))}
            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={17} className="px-6 py-16 text-center text-sm text-slate-400">
                  No trading history records match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradeEventsTable;
