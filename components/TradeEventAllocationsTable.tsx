import React, { useMemo, useState } from 'react';
import { AlertTriangle, Link2, Search } from 'lucide-react';
import { TradeEventAllocationData, TradeEventData } from '../types';

interface TradeEventAllocationsTableProps {
  allocations: TradeEventAllocationData[];
  events: TradeEventData[];
}

type LinkStatus = 'All' | 'Linked' | 'Missing event';

const formatNumber = (value: number | undefined): string =>
  (Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TradeEventAllocationsTable: React.FC<TradeEventAllocationsTableProps> = ({ allocations, events }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assetType, setAssetType] = useState<'All' | TradeEventAllocationData['assetType']>('All');
  const [leg, setLeg] = useState<'All' | TradeEventAllocationData['leg']>('All');
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('All');

  const eventById = useMemo(
    () => new Map(events.map(event => [String(event.id), event])),
    [events],
  );

  const orphanCount = useMemo(
    () => allocations.filter(allocation => !eventById.has(String(allocation.tradeEventId))).length,
    [allocations, eventById],
  );

  const filteredAllocations = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return [...allocations]
      .filter(allocation => assetType === 'All' || allocation.assetType === assetType)
      .filter(allocation => leg === 'All' || allocation.leg === leg)
      .filter(allocation => {
        const linked = eventById.has(String(allocation.tradeEventId));
        if (linkStatus === 'Linked') return linked;
        if (linkStatus === 'Missing event') return !linked;
        return true;
      })
      .filter(allocation => {
        if (!needle) return true;
        const event = eventById.get(String(allocation.tradeEventId));
        return [
          allocation.stock,
          allocation.name,
          allocation.market,
          allocation.leg,
          allocation.source,
          allocation.allocationSource,
          allocation.pnlTradeNumber,
          allocation.pnlId,
          allocation.tradeEventId,
          event?.date,
          event?.action,
        ].some(value => String(value || '').toLowerCase().includes(needle));
      })
      .sort((left, right) =>
        String(right.allocationDate || '').localeCompare(String(left.allocationDate || ''))
        || Number(right.pnlTradeNumber || 0) - Number(left.pnlTradeNumber || 0)
        || String(left.id).localeCompare(String(right.id)));
  }, [allocations, assetType, eventById, leg, linkStatus, searchTerm]);

  return (
    <div className="flex h-full min-h-[620px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-slate-800">
              <Link2 className="h-5 w-5 text-blue-600" /> P&amp;L Allocations
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {allocations.length.toLocaleString()} allocation records · {new Set(allocations.map(item => item.tradeEventId)).size.toLocaleString()} trade events
            </p>
          </div>
          {orphanCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              <AlertTriangle size={15} /> {orphanCount.toLocaleString()} missing trade event{orphanCount === 1 ? '' : 's'}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] max-w-lg flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search ticker, P&L number, event ID or source"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <select
            value={assetType}
            onChange={event => setAssetType(event.target.value as typeof assetType)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            aria-label="Allocation asset type"
          >
            <option value="All">All assets</option>
            <option value="Stock">Stocks</option>
            <option value="Option">Options</option>
          </select>
          <select
            value={leg}
            onChange={event => setLeg(event.target.value as typeof leg)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            aria-label="Allocation leg"
          >
            <option value="All">All legs</option>
            <option value="Buy">Buy</option>
            <option value="Sell">Sell</option>
          </select>
          <select
            value={linkStatus}
            onChange={event => setLinkStatus(event.target.value as LinkStatus)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            aria-label="Allocation link status"
          >
            <option value="All">All links</option>
            <option value="Linked">Linked</option>
            <option value="Missing event">Missing event</option>
          </select>
          <span className="text-xs font-semibold text-slate-400">{filteredAllocations.length.toLocaleString()} shown</span>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-auto">
        <table className="w-full min-w-[1760px] text-left">
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
              {[
                'Allocation Date', 'P&L No.', 'Leg', 'Asset', 'Stock', 'Name', 'Market',
                'Price', 'Shares', 'Commission', 'Total', 'Trade Source', 'Allocation Source',
                'Raw Event', 'Link Status', 'Trade Event ID', 'P&L ID',
              ].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-bold">{label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAllocations.map(allocation => {
              const linkedEvent = eventById.get(String(allocation.tradeEventId));
              return (
                <tr key={allocation.id} className="text-sm hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{allocation.allocationDate}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs font-bold text-blue-700">
                    {allocation.pnlTradeNumber ? `#${allocation.pnlTradeNumber}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${allocation.leg === 'Buy' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {allocation.leg}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-600">{allocation.assetType}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-slate-800">{allocation.stock}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-slate-600" title={allocation.name}>{allocation.name}</td>
                  <td className="px-4 py-3 text-slate-500">{allocation.market}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatNumber(allocation.allocatedPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatNumber(allocation.allocatedShares)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatNumber(allocation.allocatedCommission)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatNumber(allocation.allocatedTotal)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{allocation.source}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{allocation.allocationSource}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {linkedEvent ? `${linkedEvent.date} · ${linkedEvent.action}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${linkedEvent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {linkedEvent ? 'Linked' : 'Missing event'}
                    </span>
                  </td>
                  <td className="max-w-[190px] truncate px-4 py-3 font-mono text-[10px] text-slate-400" title={allocation.tradeEventId}>{allocation.tradeEventId}</td>
                  <td className="max-w-[190px] truncate px-4 py-3 font-mono text-[10px] text-slate-400" title={allocation.pnlId}>{allocation.pnlId}</td>
                </tr>
              );
            })}
            {filteredAllocations.length === 0 && (
              <tr>
                <td colSpan={17} className="px-6 py-16 text-center text-sm text-slate-400">
                  No allocation records match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradeEventAllocationsTable;
