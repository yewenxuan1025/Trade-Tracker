
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PnLData, MarketConstants, LookupSheetData } from '../types';
import { AlertCircle, TrendingUp, TrendingDown, Calendar, Percent, Download, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Pencil, X, Upload } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

interface PnLTableProps {
  data: PnLData[];
  marketConstants?: MarketConstants;
  lookupData?: LookupSheetData | null;
  onUpload: (file: File) => void;
  onExport: (filteredData: PnLData[]) => void;
  onEditRecord: (id: string, updated: Partial<PnLData>) => void;
  onDeleteRecord: (id: string | string[]) => void;
}

interface FilterState {
  stock: string;
  name: string;
  market: string;
  buyDate: string;
  sellDate: string;
  minDays: string;
  maxDays: string;
  minPnL: string;
  maxPnL: string;
  minPct: string;
  maxPct: string;
}

const initialFilters: FilterState = {
  stock: '', name: '', market: '', buyDate: '', sellDate: '', 
  minDays: '', maxDays: '', minPnL: '', maxPnL: '', minPct: '', maxPct: ''
};

const PnLTable: React.FC<PnLTableProps> = ({ data, marketConstants, lookupData, onUpload, onExport, onEditRecord, onDeleteRecord }) => {
  const [targetStartDate, setTargetStartDate] = useState('2024-04-23');
  const [targetEndDate, setTargetEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetProfitPct, setTargetProfitPct] = useState(25);
  const [targetLossPct, setTargetLossPct] = useState(10);
  const [editingRecord, setEditingRecord] = useState<PnLData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Pagination State
  const [stockPage, setStockPage] = useState(1);
  const [optionPage, setOptionPage] = useState(1);
  const itemsPerPage = 100;

  // Filter State
  const [showStockFilters, setShowStockFilters] = useState(false);
  const [showOptionFilters, setShowOptionFilters] = useState(false);
  const [stockFilters, setStockFilters] = useState<FilterState>(initialFilters);
  const [optionFilters, setOptionFilters] = useState<FilterState>(initialFilters);


  // Separate State for Stock and Option tables
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [stockSortConfig, setStockSortConfig] = useState<{ key: keyof PnLData; direction: 'asc' | 'desc' } | null>(null);
  const [optionSortConfig, setOptionSortConfig] = useState<{ key: keyof PnLData; direction: 'asc' | 'desc' } | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());

  const [colWidths, setColWidths] = useState<Record<string, number>>({ 
    tradeNumber: 50, stock: 95, name: 160, market: 65, account: 90, quantity: 85, buyDate: 100, sellDate: 100, holdingDays: 65, 
    buyPrice: 90, buyComm: 90, sellPrice: 90, sellComm: 90, totalBuy: 115, totalSell: 115, realizedPnL: 110, returnPercent: 95,
    tgtProfitCost: 110, tgtProfitSales: 110, tgtLossCost: 110, tgtLossSales: 110, option: 80, strike: 80, expiration: 100
  });

  const getRate = (market: string) => {
      const m = (market || '').toUpperCase().trim();
      if (m === 'HK') return marketConstants?.exg_rate || 1;
      if (m === 'SG') return marketConstants?.sg_exg || 1;
      if (m === 'AUD' || m === 'AUS') return marketConstants?.aud_exg || 1;
      return 1;
  };

  const { stockPnl, optionPnl, aggregatedSummary } = useMemo(() => {
    const lookupMap = new Map<string, string>((lookupData?.stocks || []).map(s => [s.ticker.toUpperCase(), s.companyName]));
    const enrich = (r: PnLData): PnLData => (!r.name && r.stock ? { ...r, name: lookupMap.get(r.stock.toUpperCase()) || r.stock } : r);
    const stocks = data.filter(r => !r.option || !['Call', 'Put'].includes(r.option)).map(enrich);
    const options = data.filter(r => r.option && ['Call', 'Put'].includes(r.option)).map(enrich);
    
    // Aggregated Summary Calculation (converted to USD)
    const all = [...stocks, ...options];
    const inRange = all.filter(r => r.sellDate >= targetStartDate && r.sellDate <= targetEndDate);
    
    // Target Winners
    const winners = inRange.filter(r => r.returnPercent >= targetProfitPct);
    const winCost = winners.reduce((sum, r) => sum + (Math.abs(r.totalBuy) / getRate(r.market || '')), 0);
    const winSales = winners.reduce((sum, r) => sum + (r.totalSell / getRate(r.market || '')), 0);
    const winPnl = winners.reduce((sum, r) => sum + (r.realizedPnL / getRate(r.market || '')), 0);
    
    // Target Losers
    const losers = inRange.filter(r => r.returnPercent <= -Math.abs(targetLossPct));
    const lossCost = losers.reduce((sum, r) => sum + (Math.abs(r.totalBuy) / getRate(r.market || '')), 0);
    const lossSales = losers.reduce((sum, r) => sum + (r.totalSell / getRate(r.market || '')), 0);
    const lossPnl = losers.reduce((sum, r) => sum + (r.realizedPnL / getRate(r.market || '')), 0);

    return { 
        stockPnl: stocks, 
        optionPnl: options,
        aggregatedSummary: {
            winners: {
                count: winners.length,
                cost: winCost,
                sales: winSales,
                profit: winPnl,
                pct: winCost ? (winPnl / winCost) * 100 : 0
            },
            losers: {
                count: losers.length,
                cost: lossCost,
                sales: lossSales,
                profit: lossPnl,
                pct: lossCost ? (lossPnl / lossCost) * 100 : 0
            }
        }
    };
  }, [data, targetStartDate, targetEndDate, targetProfitPct, targetLossPct, marketConstants]);

  const processData = (rawData: PnLData[], config: typeof stockSortConfig, filters: FilterState) => {
      // 1. Filter by Specific Columns (Local Filters)
      let filtered = rawData;

      if (filters.stock) filtered = filtered.filter(r => (r.stock || '').toLowerCase().includes(filters.stock.toLowerCase()));
      if (filters.name) filtered = filtered.filter(r => (r.name || '').toLowerCase().includes(filters.name.toLowerCase()));
      if (filters.market) filtered = filtered.filter(r => (r.market || '').toLowerCase().includes(filters.market.toLowerCase()));
      if (filters.buyDate) filtered = filtered.filter(r => (r.buyDate || '').includes(filters.buyDate));
      if (filters.sellDate) filtered = filtered.filter(r => (r.sellDate || '').includes(filters.sellDate));
      
      if (filters.minDays) filtered = filtered.filter(r => (r.holdingDays || 0) >= parseFloat(filters.minDays));
      if (filters.maxDays) filtered = filtered.filter(r => (r.holdingDays || 0) <= parseFloat(filters.maxDays));
      
      if (filters.minPnL) filtered = filtered.filter(r => r.realizedPnL >= parseFloat(filters.minPnL));
      if (filters.maxPnL) filtered = filtered.filter(r => r.realizedPnL <= parseFloat(filters.maxPnL));
      
      if (filters.minPct) filtered = filtered.filter(r => r.returnPercent >= parseFloat(filters.minPct));
      if (filters.maxPct) filtered = filtered.filter(r => r.returnPercent <= parseFloat(filters.maxPct));

      let res = filtered.map(record => {
        const metrics = { profitCost: 0, profitSales: 0, lossCost: 0, lossSales: 0 };
        const rate = getRate(record.market || '');
        
        // Calculation for target columns (Converted to USD)
        if (record.returnPercent >= targetProfitPct) {
            metrics.profitCost = Math.abs(record.totalBuy) / rate;
            metrics.profitSales = record.totalSell / rate;
        } else if (record.returnPercent <= -Math.abs(targetLossPct)) {
            metrics.lossCost = Math.abs(record.totalBuy) / rate;
            metrics.lossSales = record.totalSell / rate;
        }
        
        return { ...record, tgtProfitCost: metrics.profitCost, tgtProfitSales: metrics.profitSales, tgtLossCost: metrics.lossCost, tgtLossSales: metrics.lossSales };
    });

    if (config) res.sort((a, b) => {
        const aVal = (a as any)[config.key]; const bVal = (b as any)[config.key];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1; if (bVal === undefined || bVal === null) return -1;
        return aVal < bVal ? (config.direction === 'asc' ? -1 : 1) : (config.direction === 'asc' ? 1 : -1);
    });
    return res;
  };

  const processedStocks = useMemo(() => processData(stockPnl, stockSortConfig, stockFilters), [stockPnl, stockSortConfig, targetStartDate, targetEndDate, targetProfitPct, targetLossPct, stockFilters, marketConstants]);
  const processedOptions = useMemo(() => processData(optionPnl, optionSortConfig, optionFilters), [optionPnl, optionSortConfig, targetStartDate, targetEndDate, targetProfitPct, targetLossPct, optionFilters, marketConstants]);

  // Default to Last Page on Data Change
  useEffect(() => {
      const total = Math.ceil(processedStocks.length / itemsPerPage);
      setStockPage(total > 0 ? total : 1);
  }, [processedStocks.length]);

  useEffect(() => {
      const total = Math.ceil(processedOptions.length / itemsPerPage);
      setOptionPage(total > 0 ? total : 1);
  }, [processedOptions.length]);

  // Sync selection
  useEffect(() => {
    const currentStockIds = new Set(processedStocks.map(p => p.id));
    setSelectedStockIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (currentStockIds.has(id)) next.add(id); });
      return next.size !== prev.size ? next : prev;
    });
    
    const currentOptionIds = new Set(processedOptions.map(p => p.id));
    setSelectedOptionIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (currentOptionIds.has(id)) next.add(id); });
      return next.size !== prev.size ? next : prev;
    });
  }, [data, processedStocks, processedOptions]);


  const formatNumber = (val: number | undefined) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00';
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatUsd = (val: number) => `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault(); const startX = e.pageX; const startW = colWidths[key] || 100;
    const handleMove = (m: MouseEvent) => setColWidths(prev => ({ ...prev, [key]: Math.max(50, startW + (m.pageX - startX)) }));
    const handleUp = () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp);
  };

  const HeaderCell = ({ label, field, sortConfig, setSortConfig, stickyLeft = false, leftOffset = 0 }: any) => (
    <th className={`px-3 py-3 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 relative bg-slate-50 sticky top-0 z-20 ${stickyLeft ? 'left-0 !z-40 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}`} style={{ width: colWidths[field], minWidth: colWidths[field], left: stickyLeft ? leftOffset : 'auto' }}>
        <div className="flex items-center cursor-pointer hover:bg-slate-200/50 p-1 rounded" onClick={() => {
            const dir = sortConfig?.key === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
            setSortConfig({ key: field as keyof PnLData, direction: dir as 'asc' | 'desc' });
        }}>
          <span className="truncate">{label}</span>
          {sortConfig?.key === field && (sortConfig.direction === 'asc' ? <ArrowUp size={10} className="ml-1"/> : <ArrowDown size={10} className="ml-1"/>)}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20" onMouseDown={(e) => handleResizeStart(e, field)} />
    </th>
  );

  const handleEditSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingRecord) return;
      const qty = editingRecord.quantity || 0;
      const bp = editingRecord.buyPrice || 0;
      const bc = editingRecord.buyComm || 0;
      const sp = editingRecord.sellPrice || 0;
      const sc = editingRecord.sellComm || 0;
      
      const totalBuy = -(bp * qty) - bc;
      const totalSell = (sp * qty) - sc;
      const realizedPnL = totalBuy + totalSell;
      const returnPercent = totalBuy !== 0 ? (realizedPnL / Math.abs(totalBuy)) * 100 : 0;
      
      const updated = { ...editingRecord, totalBuy, totalSell, realizedPnL, returnPercent };
      onEditRecord(editingRecord.id, updated);
      setIsEditModalOpen(false);
      setEditingRecord(null);
  };

  const renderTable = (title: string, tableData: any[], selectedIds: Set<string>, setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>, sortConfig: any, setSortConfig: any, isOption = false, page: number, setPage: (p: number) => void, showFilters: boolean, setShowFilters: (s: boolean) => void, filters: FilterState, setFilters: (f: FilterState) => void) => {
    const totalPages = Math.ceil(tableData.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const paginatedData = tableData.slice(startIndex, startIndex + itemsPerPage);

    return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px] flex-shrink-0 relative overflow-hidden">
       <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
          <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                  <h2 className="text-lg font-bold text-slate-800">{title} <span className="text-sm font-normal text-slate-400">({tableData.length})</span></h2>
                  <button onClick={() => setShowFilters(!showFilters)} className={`p-1.5 rounded-lg transition-colors border ${showFilters ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`} title="Toggle Filters">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                  </button>
                  {selectedIds.size > 0 && (
                      <div className="flex items-center gap-2">
                         {selectedIds.size === 1 && <button onClick={() => { const rec = data.find(p => p.id === Array.from(selectedIds)[0]); if(rec) { setEditingRecord(rec); setIsEditModalOpen(true); } }} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"><Pencil size={14}/></button>}
                         <button onClick={() => { setConfirmState({ message: `Delete ${selectedIds.size} record${selectedIds.size > 1 ? 's' : ''}?`, onConfirm: () => { onDeleteRecord(Array.from(selectedIds)); setSelectedIds(new Set()); setConfirmState(null); } }); }} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200"><Trash2 size={14}/></button>
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedIds.size} Selected</span>
                      </div>
                  )}
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                      <button 
                          onClick={() => setPage(Math.max(1, page - 1))} 
                          disabled={page === 1}
                          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                      >
                          <ArrowUp className="rotate-[-90deg]" size={14} />
                      </button>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                        .map((p, i, arr) => (
                          <React.Fragment key={p}>
                              {i > 0 && arr[i - 1] !== p - 1 && <span className="text-xs text-slate-400 px-1">...</span>}
                              <button 
                                  onClick={() => setPage(p)}
                                  className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold transition-colors ${page === p ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                  {p}
                              </button>
                          </React.Fragment>
                      ))}

                      <button 
                          onClick={() => setPage(Math.min(totalPages, page + 1))} 
                          disabled={page === totalPages}
                          className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                      >
                          <ArrowUp className="rotate-90deg" size={14} />
                      </button>
                  </div>
              )}
          </div>
          
          {/* Filter Panel */}
          {showFilters && (
              <div className="px-4 pb-4 bg-slate-50 border-t border-slate-200 grid grid-cols-6 gap-3 pt-3">
                  <div><input placeholder="Stock..." className="w-full text-[10px] p-1.5 border rounded" value={filters.stock} onChange={e => setFilters({...filters, stock: e.target.value})}/></div>
                  <div><input placeholder="Name..." className="w-full text-[10px] p-1.5 border rounded" value={filters.name} onChange={e => setFilters({...filters, name: e.target.value})}/></div>
                  <div><input placeholder="Market..." className="w-full text-[10px] p-1.5 border rounded" value={filters.market} onChange={e => setFilters({...filters, market: e.target.value})}/></div>
                  <div><input placeholder="Open Date..." className="w-full text-[10px] p-1.5 border rounded" value={filters.buyDate} onChange={e => setFilters({...filters, buyDate: e.target.value})}/></div>
                  <div><input placeholder="Close Date..." className="w-full text-[10px] p-1.5 border rounded" value={filters.sellDate} onChange={e => setFilters({...filters, sellDate: e.target.value})}/></div>
                  <div className="flex gap-1"><input placeholder="Min Days" className="w-1/2 text-[10px] p-1.5 border rounded" value={filters.minDays} onChange={e => setFilters({...filters, minDays: e.target.value})}/><input placeholder="Max" className="w-1/2 text-[10px] p-1.5 border rounded" value={filters.maxDays} onChange={e => setFilters({...filters, maxDays: e.target.value})}/></div>
                  <div className="flex gap-1"><input placeholder="Min P&L" className="w-1/2 text-[10px] p-1.5 border rounded" value={filters.minPnL} onChange={e => setFilters({...filters, minPnL: e.target.value})}/><input placeholder="Max" className="w-1/2 text-[10px] p-1.5 border rounded" value={filters.maxPnL} onChange={e => setFilters({...filters, maxPnL: e.target.value})}/></div>
                  <div className="flex gap-1"><input placeholder="Min %" className="w-1/2 text-[10px] p-1.5 border rounded" value={filters.minPct} onChange={e => setFilters({...filters, minPct: e.target.value})}/><input placeholder="Max" className="w-1/2 text-[10px] p-1.5 border rounded" value={filters.maxPct} onChange={e => setFilters({...filters, maxPct: e.target.value})}/></div>
                  <div className="col-span-6 flex justify-end"><button onClick={() => setFilters(initialFilters)} className="text-[10px] text-red-500 hover:underline">Clear Filters</button></div>
              </div>
          )}
       </div>
       <div className="overflow-scroll custom-scrollbar flex-1 bg-white">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="bg-slate-50 shadow-sm">
            <tr>
              <th className="px-3 py-3 border-b border-slate-200 w-10 sticky left-0 top-0 bg-slate-50 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"><input type="checkbox" checked={selectedIds.size === tableData.length && tableData.length > 0} onChange={(e) => setSelectedIds(e.target.checked ? new Set(tableData.map((p: any) => p.id)) : new Set())}/></th>
              <HeaderCell label="No." field="tradeNumber" sortConfig={sortConfig} setSortConfig={setSortConfig} stickyLeft leftOffset={40} />
              <HeaderCell label="Stock" field="stock" sortConfig={sortConfig} setSortConfig={setSortConfig} stickyLeft leftOffset={90} />
              {isOption && <HeaderCell label="Option" field="option" sortConfig={sortConfig} setSortConfig={setSortConfig} />}
              {isOption && <HeaderCell label="Strike" field="strike" sortConfig={sortConfig} setSortConfig={setSortConfig} />}
              {isOption && <HeaderCell label="Exp" field="expiration" sortConfig={sortConfig} setSortConfig={setSortConfig} />}
              {isOption && <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap border-b border-slate-200">Action</th>}
              <HeaderCell label="Name" field="name" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Mkt" field="market" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Qty" field="quantity" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Open" field="buyDate" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Close" field="sellDate" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Days" field="holdingDays" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Buy Prc" field="buyPrice" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Buy Comm" field="buyComm" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Sell Prc" field="sellPrice" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Sell Comm" field="sellComm" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Cost" field="totalBuy" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Sales" field="totalSell" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="P&L" field="realizedPnL" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="P&L %" field="returnPercent" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Tgt Prof Cost" field="tgtProfitCost" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Tgt Prof Sales" field="tgtProfitSales" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Tgt Loss Cost" field="tgtLossCost" sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <HeaderCell label="Tgt Loss Sales" field="tgtLossSales" sortConfig={sortConfig} setSortConfig={setSortConfig} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.map((r) => (
              <tr key={r.id} className={`group cursor-pointer transition-colors ${selectedIds.has(r.id) ? 'bg-blue-50' : 'hover:bg-slate-50/50'}`} onClick={() => { const n = new Set(selectedIds); if(n.has(r.id)) n.delete(r.id); else n.add(r.id); setSelectedIds(n); }}>
                <td className={`px-3 py-2 sticky left-0 z-10 border-r ${selectedIds.has(r.id) ? 'bg-blue-50' : 'bg-white group-hover:bg-slate-50/50'}`} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => { const n = new Set(selectedIds); if(n.has(r.id)) n.delete(r.id); else n.add(r.id); setSelectedIds(n); }}/></td>
                <td className={`px-3 py-2 text-center text-[10px] text-slate-400 sticky left-[40px] z-10 border-r ${selectedIds.has(r.id) ? 'bg-blue-50' : 'bg-white group-hover:bg-slate-50/50'}`}>{r.tradeNumber}</td>
                <td className={`px-3 py-2 font-extrabold text-blue-600 sticky left-[90px] z-10 border-r text-xs ${selectedIds.has(r.id) ? 'bg-blue-50' : 'bg-white group-hover:bg-slate-50/50'}`}>{r.stock}</td>
                {isOption && <td className="px-3 py-2 text-[10px] text-purple-600 font-bold">{r.option}</td>}
                {isOption && <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-600">{r.strike}</td>}
                {isOption && <td className="px-3 py-2 text-[10px] text-slate-500">{r.expiration}</td>}
                {isOption && <td className="px-3 py-2 text-[10px] text-slate-500">{(r as any).optionAction || ''}</td>}
                <td className="px-3 py-2 text-[10px] text-slate-600 truncate">{r.name}</td>
                <td className="px-3 py-2 text-[10px] text-slate-400">{r.market}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{r.quantity.toLocaleString()}</td>
                <td className="px-3 py-2 text-[10px] text-slate-500">{r.buyDate}</td>
                <td className="px-3 py-2 text-[10px] text-slate-500">{r.sellDate}</td>
                <td className="px-3 py-2 text-center text-[10px] text-slate-500 font-bold">{r.holdingDays}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-400">{formatNumber(r.buyPrice)}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-300">{formatNumber(r.buyComm)}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-400">{formatNumber(r.sellPrice)}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-300">{formatNumber(r.sellComm)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-slate-500 font-bold">{formatNumber(r.totalBuy)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-slate-500 font-bold">{formatNumber(r.totalSell)}</td>
                <td className={`px-3 py-2 text-right font-extrabold font-mono text-xs ${r.realizedPnL >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>{formatNumber(r.realizedPnL)}</td>
                <td className={`px-3 py-2 text-right font-extrabold font-mono text-xs ${r.returnPercent >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>{r.returnPercent.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-mono text-[9px] text-slate-400 italic">{r.tgtProfitCost ? formatNumber(r.tgtProfitCost) : '-'}</td>
                <td className="px-3 py-2 text-right font-mono text-[9px] text-slate-400 italic">{r.tgtProfitSales ? formatNumber(r.tgtProfitSales) : '-'}</td>
                <td className="px-3 py-2 text-right font-mono text-[9px] text-slate-400 italic">{r.tgtLossCost ? formatNumber(r.tgtLossCost) : '-'}</td>
                <td className="px-3 py-2 text-right font-mono text-[9px] text-slate-400 italic">{r.tgtLossSales ? formatNumber(r.tgtLossSales) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800">Realized P&L Overview</h2>
            <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase flex items-center gap-1"><Calendar size={12} /> Range:</span>
                    <input type="date" value={targetStartDate} onChange={e => setTargetStartDate(e.target.value)} className="text-xs border border-slate-200 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"/>
                    <span className="text-slate-300 font-bold">-</span>
                    <input type="date" value={targetEndDate} onChange={e => setTargetEndDate(e.target.value)} className="text-xs border border-slate-200 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"/>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase flex items-center gap-1"><Percent size={12} /> Profit:</span>
                    <input type="number" value={targetProfitPct} onChange={e => setTargetProfitPct(parseFloat(e.target.value) || 0)} className="w-16 text-xs border border-slate-200 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-red-500 bg-white shadow-sm"/>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase flex items-center gap-1"><Percent size={12} /> Loss:</span>
                    <input type="number" value={targetLossPct} onChange={e => setTargetLossPct(parseFloat(e.target.value) || 0)} className="w-16 text-xs border border-slate-200 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-emerald-500 bg-white shadow-sm"/>
                </div>
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium shadow-sm transition-all cursor-pointer">
                    <Upload size={14} />Upload
                    <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => { if(e.target.files?.[0]) onUpload(e.target.files[0]); }} />
                </label>
                <button onClick={() => onExport([...processedStocks, ...processedOptions])} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"><Download size={14} />Export</button>
            </div>
        </div>
        
        {/* Performance Summary Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
             <div className="space-y-1">
                 <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Target Winners ({aggregatedSummary.winners.count})</h4>
                 <div className="flex justify-between items-end border-b border-slate-200 pb-1">
                     <span className="text-xs text-slate-500">Total Cost</span>
                     <span className="font-mono font-bold text-sm text-slate-800">{formatUsd(aggregatedSummary.winners.cost)}</span>
                 </div>
                 <div className="flex justify-between items-end border-b border-slate-200 pb-1">
                     <span className="text-xs text-slate-500">Total Sales</span>
                     <span className="font-mono font-bold text-sm text-slate-800">{formatUsd(aggregatedSummary.winners.sales)}</span>
                 </div>
                 <div className="flex justify-between items-end pt-1">
                     <span className="text-xs text-slate-500">Net Profit</span>
                     <div className="text-right">
                         <div className="font-mono font-black text-sm text-red-500">{formatUsd(aggregatedSummary.winners.profit)}</div>
                         <div className="text-[10px] font-bold text-red-400">{aggregatedSummary.winners.pct.toFixed(2)}%</div>
                     </div>
                 </div>
             </div>
             <div className="space-y-1 md:col-start-3">
                 <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Target Losers ({aggregatedSummary.losers.count})</h4>
                 <div className="flex justify-between items-end border-b border-slate-200 pb-1">
                     <span className="text-xs text-slate-500">Total Cost</span>
                     <span className="font-mono font-bold text-sm text-slate-800">{formatUsd(aggregatedSummary.losers.cost)}</span>
                 </div>
                 <div className="flex justify-between items-end border-b border-slate-200 pb-1">
                     <span className="text-xs text-slate-500">Total Sales</span>
                     <span className="font-mono font-bold text-sm text-slate-800">{formatUsd(aggregatedSummary.losers.sales)}</span>
                 </div>
                 <div className="flex justify-between items-end pt-1">
                     <span className="text-xs text-slate-500">Net Loss</span>
                     <div className="text-right">
                         <div className="font-mono font-black text-sm text-emerald-500">{formatUsd(aggregatedSummary.losers.profit)}</div>
                         <div className="text-[10px] font-bold text-emerald-400">{aggregatedSummary.losers.pct.toFixed(2)}%</div>
                     </div>
                 </div>
             </div>
        </div>
      </div>

      {renderTable("Stock Realized P&L", processedStocks, selectedStockIds, setSelectedStockIds, stockSortConfig, setStockSortConfig, false, stockPage, setStockPage, showStockFilters, setShowStockFilters, stockFilters, setStockFilters)}
      {renderTable("Option Realized P&L", processedOptions, selectedOptionIds, setSelectedOptionIds, optionSortConfig, setOptionSortConfig, true, optionPage, setOptionPage, showOptionFilters, setShowOptionFilters, optionFilters, setOptionFilters)}

      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">Edit Realized P&L: {editingRecord.stock}</h3>
                <button onClick={() => setIsEditModalOpen(false)} className="hover:bg-slate-200 p-1.5 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Trade No.</label><input type="number" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.tradeNumber} onChange={e => setEditingRecord({...editingRecord!, tradeNumber: parseInt(e.target.value)})}/></div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Ticker</label><input className="w-full border border-slate-200 rounded-lg p-2.5 text-sm uppercase font-bold" value={editingRecord.stock} onChange={e => setEditingRecord({...editingRecord!, stock: e.target.value.toUpperCase()})}/></div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Buy Date</label><input type="date" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.buyDate} onChange={e => setEditingRecord({...editingRecord!, buyDate: e.target.value})}/></div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Sell Date</label><input type="date" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.sellDate} onChange={e => setEditingRecord({...editingRecord!, sellDate: e.target.value})}/></div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Quantity</label><input type="number" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.quantity} onChange={e => setEditingRecord({...editingRecord!, quantity: parseFloat(e.target.value) || 0})}/></div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Market</label><input className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.market} onChange={e => setEditingRecord({...editingRecord!, market: e.target.value})}/></div>
                    
                    {/* Option fields */}
                    {editingRecord.option && ['Call', 'Put'].includes(editingRecord.option) && (
                        <>
                         <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Option Type</label><select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.option} onChange={e => setEditingRecord({...editingRecord!, option: e.target.value})}><option value="Call">Call</option><option value="Put">Put</option></select></div>
                         <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Strike</label><input type="number" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.strike} onChange={e => setEditingRecord({...editingRecord!, strike: parseFloat(e.target.value)})}/></div>
                         <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Expiration</label><input type="date" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.expiration} onChange={e => setEditingRecord({...editingRecord!, expiration: e.target.value})}/></div>
                        </>
                    )}

                    <div className="col-span-2 border-t pt-4 mt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Buy Price</label><input type="number" step="0.000001" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.buyPrice} onChange={e => setEditingRecord({...editingRecord!, buyPrice: parseFloat(e.target.value) || 0})}/></div>
                            <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Buy Comm</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.buyComm} onChange={e => setEditingRecord({...editingRecord!, buyComm: parseFloat(e.target.value) || 0})}/></div>
                            <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Sell Price</label><input type="number" step="0.000001" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.sellPrice} onChange={e => setEditingRecord({...editingRecord!, sellPrice: parseFloat(e.target.value) || 0})}/></div>
                            <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Sell Comm</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingRecord.sellComm} onChange={e => setEditingRecord({...editingRecord!, sellComm: parseFloat(e.target.value) || 0})}/></div>
                        </div>
                    </div>
                </div>
                <div className="pt-6 border-t flex justify-end gap-3 mt-6">
                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-6 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                    <button type="submit" className="px-10 py-2.5 bg-blue-600 text-white rounded-xl font-extrabold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:-translate-y-0.5">SAVE CHANGES</button>
                </div>
            </form>
          </div>
        </div>
      )}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
};

export default PnLTable;
