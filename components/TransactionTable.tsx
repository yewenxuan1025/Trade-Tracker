
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TransactionData, LookupSheetData, EXERCISE_OPTIONS } from '../types';
import { generateId } from '../services/excelService';
import { Search, Download, X, Plus, Pencil, Upload, ArrowUp, ArrowDown, Trash2, Copy, Scissors } from 'lucide-react';

interface TransactionTableProps {
  transactions: TransactionData[];
  optionTransactions?: TransactionData[];
  lookupData: LookupSheetData | null;
  onExport: () => void;
  onUpload: (file: File) => void;
  onUploadOptions?: (file: File) => void;
  onAppend?: (file: File) => void;
  onSplitTransaction: (originalId: string, split1: { shares: number; commission: number; total: number; lastMv: number }, split2: { shares: number; commission: number; total: number; lastMv: number }) => void;
  onCreatePnL: (ids: string[]) => void;
  onCreateOptionPnL?: (ids: string[]) => void;
  onAddTransaction: (txn: Partial<TransactionData>) => void;
  onEditTransaction: (id: string, txn: Partial<TransactionData>) => void;
  onDeleteTransaction: (id: string | string[]) => void;
  onDuplicateTransaction: (id: string) => void;
  onAddOptionTransaction?: (txn: Partial<TransactionData>) => void;
  onEditOptionTransaction?: (id: string, txn: Partial<TransactionData>) => void;
  onDeleteOptionTransaction?: (id: string | string[]) => void;
}

const TransactionTable: React.FC<TransactionTableProps> = ({ 
    transactions = [], 
    optionTransactions = [],
    lookupData, 
    onExport, 
    onUpload, 
    onUploadOptions,
    onAppend,
    onSplitTransaction,
    onCreatePnL, 
    onCreateOptionPnL,
    onAddTransaction, 
    onEditTransaction, 
    onDeleteTransaction,
    onDuplicateTransaction,
    onAddOptionTransaction,
    onEditOptionTransaction,
    onDeleteOptionTransaction
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof TransactionData; direction: 'asc' | 'desc' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const optionFileInputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>({ 
    stock: 110, name: 160, market: 80, action: 80, price: 100, shares: 100, date: 105, commission: 85, total: 115, source: 120, lastPrice: 100, lastMv: 115,
    option: 80, expiration: 100, strike: 80, exercise: 100
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txnForm, setTxnForm] = useState<Partial<TransactionData>>({ 
    stock: '', action: 'Buy', price: 0, shares: 0, date: new Date().toISOString().split('T')[0], commission: 0, source: 'IB AUS'
  });

  // State for Option Table
  const [optionSearchTerm, setOptionSearchTerm] = useState('');
  const [optionSortConfig, setOptionSortConfig] = useState<{ key: keyof TransactionData; direction: 'asc' | 'desc' } | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optionForm, setOptionForm] = useState<Partial<TransactionData>>({
    stock: '', name: '', market: '', action: 'Buy', price: 0, shares: 0, date: new Date().toISOString().split('T')[0], commission: 0, source: 'IB AUS', option: 'Call', expiration: '', strike: 0, exercise: 'No'
  });

  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitForm, setSplitForm] = useState<{ split1Shares: string | number }>({ split1Shares: 0 });

  useEffect(() => {
      if (isSplitModalOpen && editingId) {
          const txn = transactions.find(t => t.id === editingId);
          if (txn) {
              setSplitForm({ split1Shares: txn.shares / 2 });
          }
      }
  }, [isSplitModalOpen, editingId]);

  const handleSplitSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingId) return;
      const original = transactions.find(t => t.id === editingId);
      if (!original) return;

      const s1Shares = Number(splitForm.split1Shares);
      const s2Shares = original.shares - s1Shares;

      if (s1Shares === 0 || s2Shares === 0) {
          alert("Split parts cannot be zero");
          return;
      }
      
      // Allow negative shares (for short positions), but ensure we don't divide by zero
      if (original.shares === 0) {
          alert("Original shares cannot be zero");
          return;
      }

      const ratio = s1Shares / original.shares;
      const s1Comm = original.commission * ratio;
      const s2Comm = original.commission - s1Comm;

      const action = (original.action || 'Buy').toLowerCase();
      const price = original.price || 0;

      // Recalculate totals
      const calcTotal = (shares: number, comm: number) => {
          return action.includes('buy') 
            ? -Math.abs(price * shares) - comm 
            : Math.abs(price * shares) - comm;
      };

      const s1Total = calcTotal(s1Shares, s1Comm);
      const s2Total = calcTotal(s2Shares, s2Comm);

      const lastPrice = original.lastPrice || 0;
      const s1LastMv = lastPrice * s1Shares;
      const s2LastMv = lastPrice * s2Shares;

      onSplitTransaction(
          editingId, 
          { shares: s1Shares, commission: s1Comm, total: s1Total, lastMv: s1LastMv }, 
          { shares: s2Shares, commission: s2Comm, total: s2Total, lastMv: s2LastMv }
      );
      setIsSplitModalOpen(false);
      setEditingId(null);
      setSelectedIds(new Set());
  };

  useEffect(() => {
    const currentIds = new Set(transactions.map(t => t.id));
    setSelectedIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (currentIds.has(id)) next.add(id); });
      return next.size !== prev.size ? next : prev;
    });
  }, [transactions]);

  useEffect(() => {
    const currentIds = new Set(optionTransactions.map(t => t.id));
    setSelectedOptionIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (currentIds.has(id)) next.add(id); });
      return next.size !== prev.size ? next : prev;
    });
  }, [optionTransactions]);

  const handleTickerChange = (ticker: string, formSetter: React.Dispatch<React.SetStateAction<Partial<TransactionData>>>) => {
    const upperTicker = ticker.toUpperCase();
    formSetter(prev => {
      const newState = { ...prev, stock: upperTicker };
      if (lookupData) {
        const match = lookupData.stocks.find(s => s.ticker.toUpperCase() === upperTicker);
        if (match) {
          newState.name = match.companyName;
          newState.market = match.market;
          newState.lastPrice = match.closePrice;
        }
      }
      return newState;
    });
  };

  const formatNumber = (val: number | undefined | null) => {
    const num = Number(val);
    if (val === undefined || val === null || isNaN(num)) return '0.00';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const safeFixed = (val: any) => {
      return (Number(val) || 0).toFixed(2);
  };

  const filtered = useMemo(() => {
    let res = transactions.filter(t => 
      (t.stock || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (t.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (sortConfig) res.sort((a, b) => {
        if (sortConfig.key === 'stock') {
            const cleanA = (a.stock || '').replace(/^0+/, '');
            const cleanB = (b.stock || '').replace(/^0+/, '');
            return sortConfig.direction === 'asc' ? cleanA.localeCompare(cleanB) : cleanB.localeCompare(cleanA);
        }
        const aVal = (a as any)[sortConfig.key]; const bVal = (b as any)[sortConfig.key];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1; if (bVal === undefined || bVal === null) return -1;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        return sortConfig.direction === 'asc' ? 1 : -1;
    });
    return res;
  }, [transactions, searchTerm, sortConfig]);

  const filteredOptions = useMemo(() => {
    let res = optionTransactions.filter(t => 
      (t.stock || '').toLowerCase().includes(optionSearchTerm.toLowerCase()) ||
      (t.name || '').toLowerCase().includes(optionSearchTerm.toLowerCase())
    );
    if (optionSortConfig) res.sort((a, b) => {
        if (optionSortConfig.key === 'stock') {
            const cleanA = (a.stock || '').replace(/^0+/, '');
            const cleanB = (b.stock || '').replace(/^0+/, '');
            return optionSortConfig.direction === 'asc' ? cleanA.localeCompare(cleanB) : cleanB.localeCompare(cleanA);
        }
        const aVal = (a as any)[optionSortConfig.key]; const bVal = (b as any)[optionSortConfig.key];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1; if (bVal === undefined || bVal === null) return -1;
        if (aVal < bVal) return optionSortConfig.direction === 'asc' ? -1 : 1;
        return optionSortConfig.direction === 'asc' ? 1 : -1;
    });
    return res;
  }, [optionTransactions, optionSearchTerm, optionSortConfig]);

  const handleSort = (key: keyof TransactionData, isOption = false) => {
    const currentConfig = isOption ? optionSortConfig : sortConfig;
    const setConfig = isOption ? setOptionSortConfig : setSortConfig;
    let direction: 'asc' | 'desc' = 'asc';
    if (currentConfig?.key === key && currentConfig.direction === 'asc') direction = 'desc';
    setConfig({ key, direction });
  };

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault(); const startX = e.pageX; const startW = colWidths[key] || 100;
    const handleMove = (m: MouseEvent) => setColWidths(prev => ({ ...prev, [key]: Math.max(50, startW + (m.pageX - startX)) }));
    const handleUp = () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp);
  };

  const HeaderCell = ({ label, field, stickyLeft = false, leftOffset = 0, isOption = false }: { label: string, field: keyof TransactionData, stickyLeft?: boolean, leftOffset?: number, isOption?: boolean }) => {
    const config = isOption ? optionSortConfig : sortConfig;
    return (
      <th className={`px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 relative sticky top-0 bg-slate-50 z-20 ${stickyLeft ? 'left-0 !z-40 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}`} style={{ width: colWidths[field], minWidth: colWidths[field], left: stickyLeft ? leftOffset : 'auto' }}>
          <div className="flex items-center cursor-pointer hover:bg-slate-200/50 p-1 rounded" onClick={() => handleSort(field, isOption)}>
            <span className="truncate">{label}</span>
            {config?.key === field && (config.direction === 'asc' ? <ArrowUp size={10} className="ml-1"/> : <ArrowDown size={10} className="ml-1"/>)}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20" onMouseDown={(e) => handleResizeStart(e, field)} />
      </th>
    );
  };

  const handleFormSubmit = (e: React.FormEvent, isOption = false) => {
      e.preventDefault();
      const form = isOption ? optionForm : txnForm;
      const shares = form.shares || 0;
      const price = form.price || 0;
      const commission = form.commission || 0;
      const action = (form.action || 'Buy').toLowerCase();
      
      // Calculate Total (Cash Flow)
      // Buy = Negative Cash Flow (Cost)
      // Sell = Positive Cash Flow (Proceeds)
      const total = action.includes('buy') 
        ? -Math.abs(price * shares) - commission 
        : Math.abs(price * shares) - commission;
      
      // Determine Last Price (Use existing lastPrice if available (from lookup/edit), otherwise use transaction price)
      const lastPrice = form.lastPrice !== undefined && form.lastPrice !== 0 ? form.lastPrice : price;
      
      // Calculate Last MV
      const lastMv = lastPrice * shares;

      const finalTxn: TransactionData = { 
        id: generateId(),
        stock: form.stock || '',
        name: form.name || '',
        market: form.market || '',
        action: form.action || 'Buy',
        price: price,
        shares: shares,
        date: form.date || '',
        commission: commission,
        total: total,
        source: form.source || '',
        lastPrice: lastPrice,
        lastMv: lastMv,
        option: form.option || (isOption ? 'Call' : ''),
        expiration: form.expiration || '',
        strike: form.strike || 0,
        exercise: form.exercise || (isOption ? 'No' : undefined)
      };
      
      if (isOption) {
          if (editingOptionId && onEditOptionTransaction) onEditOptionTransaction(editingOptionId, finalTxn);
          else if (onAddOptionTransaction) onAddOptionTransaction(finalTxn);
          setIsOptionModalOpen(false);
      } else {
          if (editingId) onEditTransaction(editingId, finalTxn);
          else onAddTransaction(finalTxn);
          setIsModalOpen(false);
      }
  };

  const handleBulkDelete = (isOption = false) => {
    const ids = isOption ? Array.from(selectedOptionIds) : Array.from(selectedIds);
    if (ids.length === 0) return;
    if (window.confirm(`Permanently delete ${ids.length} selected records?`)) {
        if (isOption && onDeleteOptionTransaction) {
            onDeleteOptionTransaction(ids);
            setSelectedOptionIds(new Set());
        } else if (!isOption) {
            onDeleteTransaction(ids);
            setSelectedIds(new Set());
        }
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      {/* --- STOCK TRANSACTIONS --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px] relative">
        <input type="file" ref={fileInputRef} onChange={(e) => { if(e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ''; }} accept=".xlsx, .xls" className="hidden" />
        <input type="file" ref={appendInputRef} onChange={(e) => { if(e.target.files?.[0] && onAppend) onAppend(e.target.files[0]); e.target.value = ''; }} accept=".xlsx, .xls" className="hidden" />
        
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div><h2 className="text-lg font-bold text-slate-800">Stock Transactions</h2><p className="text-xs text-slate-500">{filtered.length} records</p></div>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition-colors"><Upload size={14} /><span>Upload</span></button>
                  {onAppend && <button onClick={() => appendInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition-colors"><Plus size={14} /><span>Append</span></button>}
                  <button onClick={() => { setEditingId(null); setTxnForm({ stock: '', action: 'Buy', price: 0, shares: 0, date: new Date().toISOString().split('T')[0], commission: 0, source: 'IB AUS' }); setIsModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"><Plus size={14} /><span>Add Record</span></button>
                  
                  {selectedIds.size > 0 && (
                    <button onClick={() => handleBulkDelete(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-all"><Trash2 size={14} /><span>Delete ({selectedIds.size})</span></button>
                  )}
                  {selectedIds.size === 1 && (
                    <>
                      <button onClick={() => { const id = Array.from(selectedIds)[0]; onDuplicateTransaction(id); setSelectedIds(new Set()); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-xs font-bold transition-all shadow-sm"><Copy size={14} /><span>Duplicate</span></button>
                      <button onClick={() => { const id = Array.from(selectedIds)[0]; const txn = transactions.find(t => t.id === id); if(txn) { setEditingId(txn.id); setTxnForm({...txn}); setIsModalOpen(true); } }} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"><Pencil size={14}/></button>
                      <button onClick={() => { const id = Array.from(selectedIds)[0]; const txn = transactions.find(t => t.id === id); if(txn) { setEditingId(txn.id); setIsSplitModalOpen(true); } }} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg text-xs font-bold transition-all shadow-sm"><Scissors size={14} /><span>Split</span></button>
                    </>
                  )}
                  {selectedIds.size === 2 && (
                    <button onClick={() => onCreatePnL(Array.from(selectedIds))} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-indigo-700 transition-colors uppercase tracking-wider">Pair & P&L</button>
                  )}
                  <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"><Download size={14} /><span>Export</span></button>
                </div>
              </div>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search..." className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-xs w-full outline-none focus:ring-1 focus:ring-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            </div>
        </div>

        <div className="overflow-auto custom-scrollbar flex-1 bg-white">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 z-30 bg-slate-50 shadow-sm">
              <tr>
                <th className="px-4 py-3 border-b border-slate-200 w-10 sticky left-0 top-0 bg-slate-50 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"><input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={(e) => setSelectedIds(e.target.checked ? new Set(filtered.map(t => t.id)) : new Set())}/></th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase sticky left-10 top-0 bg-slate-50 z-40 border-b border-slate-200 w-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">#</th>
                <HeaderCell label="Stock" field="stock" stickyLeft leftOffset={88} />
                <HeaderCell label="Name" field="name" />
                <HeaderCell label="Mkt" field="market" />
                <HeaderCell label="Action" field="action" />
                <HeaderCell label="Price" field="price" />
                <HeaderCell label="Shares" field="shares" />
                <HeaderCell label="Date" field="date" />
                <HeaderCell label="Comm" field="commission" />
                <HeaderCell label="Total" field="total" />
                <HeaderCell label="Source" field="source" />
                <HeaderCell label="Last Prc" field="lastPrice" />
                <HeaderCell label="Last MV" field="lastMv" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t, i) => (
                  <tr key={t.id} className={`hover:bg-blue-50/20 group cursor-pointer transition-colors ${selectedIds.has(t.id) ? 'bg-blue-50/40' : ''}`} onClick={() => { const n = new Set(selectedIds); if(n.has(t.id)) n.delete(t.id); else n.add(t.id); setSelectedIds(n); }}>
                    <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r group-hover:bg-blue-50/20" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => { const n = new Set(selectedIds); if(n.has(t.id)) n.delete(t.id); else n.add(t.id); setSelectedIds(n); }}/></td>
                    <td className="px-4 py-2 text-[10px] text-slate-400 sticky left-10 bg-white z-10 border-r group-hover:bg-blue-50/20">{i + 1}</td>
                    <td className="px-4 py-2 font-bold text-blue-600 truncate sticky left-[88px] bg-white z-10 border-r group-hover:bg-blue-50/20">{t.stock}</td>
                    <td className="px-4 py-2 text-slate-600 truncate text-xs">{t.name}</td>
                    <td className="px-4 py-2 text-[10px] text-slate-400">{t.market}</td>
                    <td className={`px-4 py-2 text-[10px] font-bold uppercase ${t.action.toLowerCase().includes('buy') ? 'text-red-500' : 'text-emerald-500'}`}>{t.action}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(t.price)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{t.shares}</td>
                    <td className="px-4 py-2 text-[10px] text-slate-500">{t.date}</td>
                    <td className="px-4 py-2 text-right font-mono text-[10px] text-slate-400">{safeFixed(t.commission)}</td>
                    <td className="px-4 py-2 text-right font-bold font-mono text-xs text-slate-700">{formatNumber(t.total)}</td>
                    <td className="px-4 py-2 text-[10px] truncate text-slate-400">{t.source}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">{safeFixed(t.lastPrice)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">{formatNumber(t.lastMv)}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- OPTION TRANSACTIONS --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px] relative">
        <input type="file" ref={optionFileInputRef} onChange={(e) => { if(e.target.files?.[0] && onUploadOptions) onUploadOptions(e.target.files[0]); e.target.value = ''; }} accept=".xlsx, .xls" className="hidden" />

        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-800">Option Transactions</h2>
                    <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">{filteredOptions.length}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => optionFileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition-colors"><Upload size={14} /><span>Upload History</span></button>
                  <button onClick={() => { setEditingOptionId(null); setOptionForm({ stock: '', action: 'Buy', price: 0, shares: 0, date: new Date().toISOString().split('T')[0], commission: 0, source: 'IB AUS', option: 'Call', expiration: '', strike: 0, exercise: 'No' }); setIsOptionModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium shadow-sm transition-all"><Plus size={14} /><span>Add Option</span></button>
                  
                  {selectedOptionIds.size > 0 && (
                    <button onClick={() => handleBulkDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-all"><Trash2 size={14} /><span>Delete ({selectedOptionIds.size})</span></button>
                  )}
                  {selectedOptionIds.size === 1 && (
                     <button onClick={() => { const id = Array.from(selectedOptionIds)[0]; const txn = optionTransactions.find(t => t.id === id); if(txn) { setEditingOptionId(txn.id); setOptionForm({...txn}); setIsOptionModalOpen(true); } }} className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"><Pencil size={14}/></button>
                  )}
                  {selectedOptionIds.size === 2 && onCreateOptionPnL && (
                    <button onClick={() => onCreateOptionPnL(Array.from(selectedOptionIds))} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-indigo-700 transition-colors uppercase tracking-wider">Pair & P&L</button>
                  )}
                </div>
              </div>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="text" placeholder="Search Options..." className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-xs w-full outline-none focus:ring-1 focus:ring-purple-500" value={optionSearchTerm} onChange={(e) => setOptionSearchTerm(e.target.value)} /></div>
            </div>
        </div>

        <div className="overflow-auto custom-scrollbar flex-1 bg-white">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="sticky top-0 z-30 bg-slate-50 shadow-sm">
              <tr>
                <th className="px-4 py-3 border-b border-slate-200 w-10 sticky left-0 top-0 bg-slate-50 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"><input type="checkbox" checked={selectedOptionIds.size === filteredOptions.length && filteredOptions.length > 0} onChange={(e) => setSelectedOptionIds(e.target.checked ? new Set(filteredOptions.map(t => t.id)) : new Set())}/></th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase sticky left-10 top-0 bg-slate-50 z-40 border-b border-slate-200 w-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">#</th>
                <HeaderCell label="Stock" field="stock" stickyLeft leftOffset={88} isOption />
                <HeaderCell label="Name" field="name" isOption />
                <HeaderCell label="Option" field="option" isOption />
                <HeaderCell label="Expiration" field="expiration" isOption />
                <HeaderCell label="Strike" field="strike" isOption />
                <HeaderCell label="Action" field="action" isOption />
                <HeaderCell label="Price" field="price" isOption />
                <HeaderCell label="Shares" field="shares" isOption />
                <HeaderCell label="Date" field="date" isOption />
                <HeaderCell label="Comm" field="commission" isOption />
                <HeaderCell label="Total" field="total" isOption />
                <HeaderCell label="Exercise" field="exercise" isOption />
                <HeaderCell label="Source" field="source" isOption />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOptions.map((t, i) => (
                  <tr key={t.id} className={`hover:bg-purple-50/20 group cursor-pointer transition-colors ${selectedOptionIds.has(t.id) ? 'bg-purple-50/40' : ''}`} onClick={() => { const n = new Set(selectedOptionIds); if(n.has(t.id)) n.delete(t.id); else n.add(t.id); setSelectedOptionIds(n); }}>
                    <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r group-hover:bg-purple-50/20" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedOptionIds.has(t.id)} onChange={() => { const n = new Set(selectedOptionIds); if(n.has(t.id)) n.delete(t.id); else n.add(t.id); setSelectedOptionIds(n); }}/></td>
                    <td className="px-4 py-2 text-[10px] text-slate-400 sticky left-10 bg-white z-10 border-r group-hover:bg-purple-50/20">{i + 1}</td>
                    <td className="px-4 py-2 font-bold text-purple-600 truncate sticky left-[88px] bg-white z-10 border-r group-hover:bg-purple-50/20">{t.stock}</td>
                    <td className="px-4 py-2 text-slate-600 truncate text-xs">{t.name}</td>
                    <td className="px-4 py-2 text-xs font-bold text-slate-700">{t.option}</td>
                    <td className="px-4 py-2 text-[10px] text-slate-500">{t.expiration}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{t.strike}</td>
                    <td className={`px-4 py-2 text-[10px] font-bold uppercase ${t.action.toLowerCase().includes('buy') ? 'text-red-500' : 'text-emerald-500'}`}>{t.action}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(t.price)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{t.shares}</td>
                    <td className="px-4 py-2 text-[10px] text-slate-500">{t.date}</td>
                    <td className="px-4 py-2 text-right font-mono text-[10px] text-slate-400">{safeFixed(t.commission)}</td>
                    <td className="px-4 py-2 text-right font-bold font-mono text-xs text-slate-700">{formatNumber(t.total)}</td>
                    <td className="px-4 py-2 text-[10px] text-slate-600 italic">{t.exercise || 'No'}</td>
                    <td className="px-4 py-2 text-[10px] truncate text-slate-400">{t.source}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- STOCK MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">{editingId ? 'Edit Transaction' : 'Add New Record'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-slate-200 p-1.5 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={(e) => handleFormSubmit(e, false)} className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-1">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Ticker (Auto lookup)</label>
                  <input required className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase font-bold text-blue-600" value={txnForm.stock} onChange={e => handleTickerChange(e.target.value, setTxnForm)} placeholder="e.g. AAPL"/>
                </div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Action</label><select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={txnForm.action} onChange={e => setTxnForm({...txnForm, action: e.target.value})}><option value="Buy">Buy</option><option value="Sell">Sell</option></select></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Company Name</label><input readOnly className="w-full border border-slate-100 rounded-lg p-2.5 text-sm bg-slate-50 text-slate-400 italic" value={txnForm.name || ''}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Market</label><input readOnly className="w-full border border-slate-100 rounded-lg p-2.5 text-sm bg-slate-50 text-slate-400 italic" value={txnForm.market || ''}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Price</label><input required type="number" step="0.000001" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={txnForm.price} onChange={e => setTxnForm({...txnForm, price: parseFloat(e.target.value)})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Shares</label><input required type="number" step="0.0001" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={txnForm.shares} onChange={e => setTxnForm({...txnForm, shares: parseFloat(e.target.value)})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Date</label><input required type="date" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={txnForm.date} onChange={e => setTxnForm({...txnForm, date: e.target.value})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Commission</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={txnForm.commission} onChange={e => setTxnForm({...txnForm, commission: parseFloat(e.target.value)})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Source</label><select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={txnForm.source} onChange={e => setTxnForm({...txnForm, source: e.target.value})}><option value="IB AUS">IB AUS</option><option value="IB">IB</option><option value="Vanguard">Vanguard</option><option value="Manual">Manual</option></select></div>
              </div>
              <div className="pt-6 border-t flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                  <button type="submit" className="px-10 py-2.5 bg-blue-600 text-white rounded-xl font-extrabold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:-translate-y-0.5">SAVE TRANSACTION</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- OPTION MODAL --- */}
      {isOptionModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">{editingOptionId ? 'Edit Option' : 'Add New Option'}</h3>
              <button onClick={() => setIsOptionModalOpen(false)} className="hover:bg-slate-200 p-1.5 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={(e) => handleFormSubmit(e, true)} className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="col-span-1">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Ticker</label>
                  <input required className="w-full border border-slate-200 rounded-lg p-2.5 text-sm uppercase font-bold text-purple-600" value={optionForm.stock} onChange={e => handleTickerChange(e.target.value, setOptionForm)} placeholder="e.g. TSLA"/>
                </div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Option Type</label><select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.option} onChange={e => setOptionForm({...optionForm, option: e.target.value})}><option value="Call">Call</option><option value="Put">Put</option></select></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Expiration</label><input type="date" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.expiration} onChange={e => setOptionForm({...optionForm, expiration: e.target.value})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Strike Price</label><input type="number" step="0.5" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.strike} onChange={e => setOptionForm({...optionForm, strike: parseFloat(e.target.value)})}/></div>
                
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Action</label><select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.action} onChange={e => setOptionForm({...optionForm, action: e.target.value})}><option value="Buy">Buy</option><option value="Sell">Sell</option></select></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Shares/Contracts</label><input required type="number" step="0.0001" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.shares} onChange={e => setOptionForm({...optionForm, shares: parseFloat(e.target.value)})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Price (Prem)</label><input required type="number" step="0.000001" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.price} onChange={e => setOptionForm({...optionForm, price: parseFloat(e.target.value)})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Exercise</label><select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.exercise} onChange={e => setOptionForm({...optionForm, exercise: e.target.value})}>{EXERCISE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
                
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Date</label><input required type="date" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.date} onChange={e => setOptionForm({...optionForm, date: e.target.value})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Commission</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.commission} onChange={e => setOptionForm({...optionForm, commission: parseFloat(e.target.value)})}/></div>
                <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Source</label><select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={optionForm.source} onChange={e => setOptionForm({...optionForm, source: e.target.value})}><option value="IB AUS">IB AUS</option><option value="IB">IB</option><option value="Manual">Manual</option></select></div>
              </div>
              <div className="pt-6 border-t flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setIsOptionModalOpen(false)} className="px-6 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                  <button type="submit" className="px-10 py-2.5 bg-purple-600 text-white rounded-xl font-extrabold shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all hover:-translate-y-0.5">SAVE OPTION</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SPLIT MODAL --- */}
      {isSplitModalOpen && editingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">Split Transaction</h3>
              <button onClick={() => setIsSplitModalOpen(false)} className="hover:bg-slate-200 p-1.5 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleSplitSubmit} className="p-6 space-y-4">
                {(() => {
                   const original = transactions.find(t => t.id === editingId);
                   if (!original) return <div className="text-red-500">Transaction not found</div>;
                   
                   const s1Shares = Number(splitForm.split1Shares);
                   const s2Shares = original.shares - s1Shares;
                   const ratio = original.shares !== 0 ? s1Shares / original.shares : 0;
                   const s1Comm = original.commission * ratio;
                   const s2Comm = original.commission - s1Comm;

                   return (
                    <>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                            <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Original Shares:</span><span className="font-mono font-bold">{original.shares}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-slate-500">Original Commission:</span><span className="font-mono font-bold">{original.commission.toFixed(2)}</span></div>
                        </div>

                        <div>
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Split 1 Shares</label>
                            <input required type="number" step="0.0001" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-blue-600" value={splitForm.split1Shares} onChange={e => setSplitForm({ split1Shares: e.target.value === '' ? '' : parseFloat(e.target.value) })}/>
                            <div className="mt-1 text-xs text-slate-400 flex justify-between">
                                <span>Comm: {s1Comm.toFixed(2)}</span>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Split 2 Shares (Remaining)</label>
                            <input readOnly className="w-full border border-slate-100 rounded-lg p-2.5 text-sm bg-slate-50 text-slate-500 font-mono" value={s2Shares.toFixed(4)}/>
                            <div className="mt-1 text-xs text-slate-400 flex justify-between">
                                <span>Comm: {s2Comm.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t flex justify-end gap-3 mt-4">
                            <button type="button" onClick={() => setIsSplitModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors font-bold text-xs">Cancel</button>
                            <button type="submit" className="px-6 py-2 bg-orange-500 text-white rounded-lg font-bold shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all text-xs">CONFIRM SPLIT</button>
                        </div>
                    </>
                   );
                })()}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionTable;
