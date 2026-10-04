import React, { useMemo, useState } from 'react';
import { Archive, CalendarDays, Pencil, Search, Trash2, X } from 'lucide-react';
import { TradeEventAllocationData, TradeEventData } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface TradeEventsTableProps {
  events: TradeEventData[];
  allocations: TradeEventAllocationData[];
  asOfDate?: string;
  onEditEvent: (id: string, updated: Partial<TradeEventData>) => void;
  onDeleteEvent: (id: string) => void;
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

const TradeEventsTable: React.FC<TradeEventsTableProps> = ({
  events,
  allocations,
  asOfDate,
  onEditEvent,
  onDeleteEvent,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assetType, setAssetType] = useState<'All' | 'Stock' | 'Option'>('All');
  const [recordStatus, setRecordStatus] = useState<'All' | TradeEventData['recordStatus']>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('All');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');
  const [editingEvent, setEditingEvent] = useState<TradeEventData | null>(null);
  const [commissionInput, setCommissionInput] = useState('');
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);

  const openEditor = (event: TradeEventData) => {
    setEditingEvent({ ...event });
    setCommissionInput(String(event.commission ?? 0));
  };

  const updateEditingEvent = <K extends keyof TradeEventData>(key: K, value: TradeEventData[K]) => {
    setEditingEvent(current => current ? { ...current, [key]: value } : current);
  };

  const handleEditSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingEvent) return;
    const parsedCommission = parseFloat(commissionInput);
    onEditEvent(String(editingEvent.id), {
      stock: editingEvent.stock,
      name: editingEvent.name,
      market: editingEvent.market,
      action: editingEvent.action,
      price: Number(editingEvent.price) || 0,
      shares: Number(editingEvent.shares) || 0,
      date: editingEvent.date,
      commission: Number.isFinite(parsedCommission) ? parsedCommission : 0,
      total: Number(editingEvent.total) || 0,
      source: editingEvent.source,
      option: editingEvent.option,
      expiration: editingEvent.expiration,
      strike: Number(editingEvent.strike) || 0,
      exercise: editingEvent.exercise,
    });
    setEditingEvent(null);
  };

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

  const pnlLinksByEventId = useMemo(() => {
    const map = new Map<string, { label: string; title: string }>();
    const grouped = new Map<string, TradeEventAllocationData[]>();
    allocations.forEach(allocation => {
      const id = String(allocation.tradeEventId || '');
      if (!id) return;
      grouped.set(id, [...(grouped.get(id) || []), allocation]);
    });

    grouped.forEach((group, eventId) => {
      const numbers = Array.from(new Set(group
        .map(allocation => allocation.pnlTradeNumber)
        .filter((value): value is number => value !== undefined && value !== null && !Number.isNaN(Number(value)))
        .map(value => Number(value))))
        .sort((left, right) => left - right);
      const ids = Array.from(new Set(group.map(allocation => allocation.pnlId).filter(Boolean)));
      map.set(eventId, {
        label: numbers.length > 0 ? numbers.map(value => `#${value}`).join(', ') : ids.length > 0 ? `${ids.length} link${ids.length > 1 ? 's' : ''}` : '',
        title: group.map(allocation => {
          const numberLabel = allocation.pnlTradeNumber ? `#${allocation.pnlTradeNumber}` : allocation.pnlId;
          return `${numberLabel}: ${allocation.leg} ${allocation.allocatedShares} shares, total ${allocation.allocatedTotal}`;
        }).join('\n'),
      });
    });

    return map;
  }, [allocations]);

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
        pnlLinksByEventId.get(String(event.id))?.label || event.linkedPnlTradeNumber,
      ].some(value => String(value || '').toLowerCase().includes(needle)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
  }, [assetType, dateRange, events, pnlLinksByEventId, recordStatus, searchTerm]);

  const recordedCount = events.filter(event => event.recordStatus === 'Recorded').length;

  return (
    <div className="flex flex-col h-full min-h-[620px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
        <table className="min-w-[1620px] w-full text-left">
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              {['Date', 'Asset', 'Stock', 'Name', 'Market', 'Action', 'Price', 'Shares', 'Commission', 'Total', 'Source', 'Option', 'Expiration', 'Strike', 'Status', 'Linked P&L', 'Event ID', 'Actions'].map(label => (
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
                <td className="px-4 py-3 font-mono text-xs text-slate-500 text-center" title={pnlLinksByEventId.get(String(event.id))?.title || event.linkedPnlId || ''}>
                  {pnlLinksByEventId.get(String(event.id))?.label || (event.linkedPnlTradeNumber ? `#${event.linkedPnlTradeNumber}` : '')}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-slate-400 max-w-[180px] truncate" title={String(event.id)}>{event.id}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditor(event)}
                      title="Edit trading history record"
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteEventId(String(event.id))}
                      title="Delete trading history record"
                      className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={18} className="px-6 py-16 text-center text-sm text-slate-400">
                  No trading history records match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingEvent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-slate-50 p-4">
              <div>
                <h3 className="font-extrabold uppercase tracking-tight text-slate-800">Edit Trading History</h3>
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">{editingEvent.id}</p>
              </div>
              <button type="button" onClick={() => setEditingEvent(null)} className="rounded-full p-1.5 hover:bg-slate-200"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Asset</label><input readOnly value={editingEvent.assetType} className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-sm text-slate-500" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Date</label><input required type="date" value={editingEvent.date || ''} onChange={event => updateEditingEvent('date', event.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Ticker</label><input required value={editingEvent.stock || ''} onChange={event => updateEditingEvent('stock', event.target.value.toUpperCase())} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm font-bold uppercase text-blue-600" /></div>
                <div className="lg:col-span-2"><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Name</label><input value={editingEvent.name || ''} onChange={event => updateEditingEvent('name', event.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Market</label><input value={editingEvent.market || ''} onChange={event => updateEditingEvent('market', event.target.value.toUpperCase())} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm uppercase" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Action</label><select value={editingEvent.action || 'Buy'} onChange={event => updateEditingEvent('action', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"><option value="Buy">Buy</option><option value="Sell">Sell</option><option value="Short">Short</option><option value="Cover">Cover</option></select></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Price</label><input type="number" step="any" value={editingEvent.price ?? 0} onChange={event => updateEditingEvent('price', event.target.valueAsNumber)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Shares / Contracts</label><input type="number" step="any" value={editingEvent.shares ?? 0} onChange={event => updateEditingEvent('shares', event.target.valueAsNumber)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Commission</label><input type="text" inputMode="decimal" value={commissionInput} onChange={event => setCommissionInput(event.target.value)} placeholder="e.g. -1.25" className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Total</label><input type="number" step="any" value={editingEvent.total ?? 0} onChange={event => updateEditingEvent('total', event.target.valueAsNumber)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Source</label><input value={editingEvent.source || ''} onChange={event => updateEditingEvent('source', event.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                {editingEvent.assetType === 'Option' && (
                  <>
                    <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Option</label><select value={editingEvent.option || 'Call'} onChange={event => updateEditingEvent('option', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"><option value="Call">Call</option><option value="Put">Put</option></select></div>
                    <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Expiration</label><input type="date" value={editingEvent.expiration || ''} onChange={event => updateEditingEvent('expiration', event.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                    <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Strike</label><input type="number" step="any" value={editingEvent.strike ?? 0} onChange={event => updateEditingEvent('strike', event.target.valueAsNumber)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                    <div><label className="mb-1 block text-[10px] font-extrabold uppercase text-slate-400">Exercise</label><input value={editingEvent.exercise || ''} onChange={event => updateEditingEvent('exercise', event.target.value)} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></div>
                  </>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t pt-5">
                <button type="button" onClick={() => setEditingEvent(null)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="rounded-xl bg-blue-600 px-7 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 hover:bg-blue-700">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteEventId && (
        <ConfirmDialog
          message="Permanently delete this Trading History record? Linked P&L allocations for this record will also be removed."
          onConfirm={() => {
            onDeleteEvent(deleteEventId);
            setDeleteEventId(null);
          }}
          onCancel={() => setDeleteEventId(null)}
        />
      )}
    </div>
  );
};

export default TradeEventsTable;
