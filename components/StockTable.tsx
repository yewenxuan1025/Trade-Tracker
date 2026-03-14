
import React, { useState, useMemo, useRef } from 'react';
import { StockData, TYPE_OPTIONS, CATEGORY_OPTIONS, CLASS_OPTIONS, MARKET_OPTIONS } from '../types';
import { Search, AlertCircle, Download, Upload, ArrowUpDown, ArrowUp, ArrowDown, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

interface StockTableProps {
  stocks: StockData[];
  onStockAdd: (stock: StockData) => void;
  onStockEdit: (index: number, stock: StockData) => void;
  onStockDelete: (indices: number[]) => void;
  onExport: () => void;
  onUpload: (file: File) => void;
}

const StockTable: React.FC<StockTableProps> = ({ stocks, onStockAdd, onStockEdit, onStockDelete, onExport, onUpload }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof StockData; direction: 'asc' | 'desc' } | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<StockData | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // Original index in the main array

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>({ ticker: 100, companyName: 200, isChinese: 80, tradingCode: 100, closePrice: 100, marketCap: 120, peTTM: 80, pb: 80, dividendYield: 100, roeTTM: 80, psQuantile: 100, type: 120, category: 120, class: 120, market: 80 });

  const processedStocks = useMemo(() => {
    let result = stocks.map((s, i) => ({ ...s, originalIndex: i })).filter(s => 
      (s.ticker || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (s.companyName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (sortConfig) result.sort((a, b) => {
        const aVal = a[sortConfig.key]; const bVal = b[sortConfig.key];
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1; if (bVal === undefined || bVal === null) return -1;
        return aVal < bVal ? (sortConfig.direction === 'asc' ? -1 : 1) : (sortConfig.direction === 'asc' ? 1 : -1);
    });
    return result;
  }, [stocks, searchTerm, sortConfig]);

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault(); const startX = e.pageX; const startW = colWidths[key] || 100;
    const handleMove = (m: MouseEvent) => setColWidths(prev => ({ ...prev, [key]: Math.max(50, startW + (m.pageX - startX)) }));
    const handleUp = () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp);
  };

  const safeFixed = (val: any) => {
      const num = Number(val);
      return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const formatPrice = (val: any) => {
      const num = Number(val);
      if (isNaN(num)) return '0.00';
      return Math.abs(num) < 1 && Math.abs(num) > 0 ? num.toFixed(4) : num.toFixed(2);
  };

  const HeaderCell = ({ label, field, stickyLeft = false }: { label: string, field: keyof StockData, stickyLeft?: boolean }) => (
    <th className={`px-4 py-3 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 relative bg-slate-50 sticky top-0 z-20 ${stickyLeft ? 'left-0 !z-40 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}`} style={{ width: colWidths[field], minWidth: colWidths[field] }}>
        <div className="flex items-center cursor-pointer hover:bg-slate-200/50 p-1 rounded" onClick={() => {
            const dir = sortConfig?.key === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
            setSortConfig({ key: field, direction: dir });
        }}>
          <span className="truncate">{label}</span>
          {sortConfig?.key === field && (sortConfig.direction === 'asc' ? <ArrowUp size={10} className="ml-1"/> : <ArrowDown size={10} className="ml-1"/>)}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-20" onMouseDown={(e) => handleResizeStart(e, field as string)} />
    </th>
  );

  const handleAddNew = () => {
      setEditingStock({
          ticker: '', companyName: '', isChinese: 'N', tradingCode: '', closePrice: 0, marketCap: 0, 
          peTTM: 0, pb: 0, dividendYield: 0, roeTTM: 0, psQuantile: 0, type: 'Trading', category: 'Growth', class: 'US Stock', market: 'US'
      });
      setEditingIndex(null);
      setIsEditModalOpen(true);
  };

  const handleEdit = (stock: StockData & { originalIndex: number }) => {
      setEditingStock(stock);
      setEditingIndex(stock.originalIndex);
      setIsEditModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingStock) return;
      
      if (editingIndex !== null) {
          onStockEdit(editingIndex, editingStock);
      } else {
          onStockAdd(editingStock);
      }
      setIsEditModalOpen(false);
      setEditingStock(null);
      setEditingIndex(null);
  };

  const handleDelete = () => {
      if (selectedIndices.size === 0) return;
      setConfirmState({
          message: `Delete ${selectedIndices.size} selected record${selectedIndices.size > 1 ? 's' : ''}?`,
          onConfirm: () => {
              onStockDelete(Array.from(selectedIndices));
              setSelectedIndices(new Set());
              setConfirmState(null);
          }
      });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden relative">
      <input type="file" ref={fileInputRef} onChange={(e) => { if(e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ''; }} accept=".xlsx, .xls" className="hidden" />
      
      {/* Control Section Fixed at Top */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                  <div><h2 className="text-lg font-bold text-slate-800">Lookup Data</h2><p className="text-xs text-slate-500">{processedStocks.length} records</p></div>
                  {selectedIndices.size > 0 && (
                      <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg">
                          <span className="text-xs font-bold text-slate-600">{selectedIndices.size} Selected</span>
                          <button onClick={handleDelete} className="p-1.5 bg-white text-red-600 rounded-md shadow-sm border border-slate-200 hover:bg-red-50 transition-colors"><Trash2 size={14}/></button>
                      </div>
                  )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-blue-700 transition-colors"><Plus size={14}/><span>Add New</span></button>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 hover:bg-slate-200 transition-colors"><Upload size={14}/><span>Upload</span></button>
                <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium shadow-sm hover:bg-emerald-700 transition-colors"><Download size={14}/><span>Export</span></button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search..." className="pl-9 pr-4 py-1.5 border border-slate-300 rounded-md text-xs w-full outline-none focus:ring-1 focus:ring-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
      </div>

      <div className="overflow-auto custom-scrollbar flex-1 bg-white">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="sticky top-0 z-30 bg-slate-50 shadow-sm">
            <tr>
                <th className="px-3 py-3 border-b border-slate-200 w-10 sticky left-0 top-0 bg-slate-50 z-40 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"><input type="checkbox" checked={selectedIndices.size === processedStocks.length && processedStocks.length > 0} onChange={(e) => setSelectedIndices(e.target.checked ? new Set(processedStocks.map(s => s.originalIndex)) : new Set())}/></th>
                <HeaderCell label="Ticker" field="ticker" stickyLeft />
                <HeaderCell label="Name" field="companyName" />
                <HeaderCell label="CCS" field="isChinese" />
                <HeaderCell label="Code" field="tradingCode" />
                <HeaderCell label="Price" field="closePrice" />
                <HeaderCell label="Mkt Cap" field="marketCap" />
                <HeaderCell label="PE" field="peTTM" />
                <HeaderCell label="PB" field="pb" />
                <HeaderCell label="Div" field="dividendYield" />
                <HeaderCell label="ROE TTM" field="roeTTM" />
                <HeaderCell label="PS PCTL" field="psQuantile" />
                <HeaderCell label="Type" field="type" />
                <HeaderCell label="Cat" field="category" />
                <HeaderCell label="Class" field="class" />
                <HeaderCell label="Market" field="market" />
                <th className="px-4 py-3 border-b border-slate-200 w-16 sticky right-0 top-0 bg-slate-50 z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {processedStocks.map((stock) => (
                <tr key={`${stock.ticker}-${stock.originalIndex}`} className={`hover:bg-blue-50/30 group transition-colors ${selectedIndices.has(stock.originalIndex) ? 'bg-blue-50/20' : ''}`}>
                  <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r border-slate-100 group-hover:bg-blue-50/50"><input type="checkbox" checked={selectedIndices.has(stock.originalIndex)} onChange={() => { const n = new Set(selectedIndices); if(n.has(stock.originalIndex)) n.delete(stock.originalIndex); else n.add(stock.originalIndex); setSelectedIndices(n); }}/></td>
                  <td className="px-4 py-2 font-bold text-blue-600 text-xs">{stock.ticker}</td>
                  <td className="px-4 py-2 truncate text-slate-600 text-xs">{stock.companyName}</td>
                  <td className="px-4 py-2 text-center text-xs">{stock.isChinese}</td>
                  <td className="px-4 py-2 text-xs">{stock.tradingCode}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{formatPrice(stock.closePrice)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(stock.marketCap / 100000000)}Yi</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(stock.peTTM)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(stock.pb)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(stock.dividendYield)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(stock.roeTTM)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{safeFixed(stock.psQuantile)}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.type}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.category}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.class}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.market}</td>
                  <td className="px-2 py-2 sticky right-0 bg-white z-10 border-l border-slate-100 group-hover:bg-blue-50/50 text-center">
                      <button onClick={() => handleEdit(stock)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil size={14}/></button>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingStock && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <h3 className="font-extrabold text-slate-800 uppercase tracking-tight">{editingIndex !== null ? 'Edit Stock' : 'Add New Stock'}</h3>
                <button onClick={() => setIsEditModalOpen(false)} className="hover:bg-slate-200 p-1.5 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1"><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Ticker</label><input required className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold uppercase" value={editingStock.ticker} onChange={e => setEditingStock({...editingStock, ticker: e.target.value.toUpperCase()})}/></div>
                    <div className="col-span-2"><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Company Name</label><input required className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingStock.companyName} onChange={e => setEditingStock({...editingStock, companyName: e.target.value})}/></div>
                    
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Market</label>
                        <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingStock.market} onChange={e => setEditingStock({...editingStock, market: e.target.value})}>
                            {MARKET_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Type</label>
                        <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingStock.type} onChange={e => setEditingStock({...editingStock, type: e.target.value})}>
                            {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Category</label>
                        <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingStock.category} onChange={e => setEditingStock({...editingStock, category: e.target.value})}>
                            {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Class</label>
                        <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingStock.class} onChange={e => setEditingStock({...editingStock, class: e.target.value})}>
                            {CLASS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Is CCS</label>
                        <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingStock.isChinese} onChange={e => setEditingStock({...editingStock, isChinese: e.target.value})}>
                            <option value="Y">Y</option><option value="N">N</option>
                        </select>
                    </div>
                    <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Trading Code</label><input className="w-full border border-slate-200 rounded-lg p-2.5 text-sm" value={editingStock.tradingCode} onChange={e => setEditingStock({...editingStock, tradingCode: e.target.value})}/></div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                    <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Financial Metrics</h4>
                    <div className="grid grid-cols-4 gap-4">
                        <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Close Price</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono" value={editingStock.closePrice} onChange={e => setEditingStock({...editingStock, closePrice: parseFloat(e.target.value) || 0})}/></div>
                        <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Market Cap</label><input type="number" step="1" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono" value={editingStock.marketCap} onChange={e => setEditingStock({...editingStock, marketCap: parseFloat(e.target.value) || 0})}/></div>
                        <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">PE (TTM)</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono" value={editingStock.peTTM} onChange={e => setEditingStock({...editingStock, peTTM: parseFloat(e.target.value) || 0})}/></div>
                        <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">PB</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono" value={editingStock.pb} onChange={e => setEditingStock({...editingStock, pb: parseFloat(e.target.value) || 0})}/></div>
                        <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">Div Yield</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono" value={editingStock.dividendYield} onChange={e => setEditingStock({...editingStock, dividendYield: parseFloat(e.target.value) || 0})}/></div>
                        <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">ROE (TTM)</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono" value={editingStock.roeTTM} onChange={e => setEditingStock({...editingStock, roeTTM: parseFloat(e.target.value) || 0})}/></div>
                        <div><label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1 block">PS Quantile</label><input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono" value={editingStock.psQuantile} onChange={e => setEditingStock({...editingStock, psQuantile: parseFloat(e.target.value) || 0})}/></div>
                    </div>
                </div>

                <div className="pt-6 border-t flex justify-end gap-3 mt-6">
                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-6 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors font-bold text-sm">Cancel</button>
                    <button type="submit" className="px-10 py-2.5 bg-blue-600 text-white rounded-xl font-extrabold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all hover:-translate-y-0.5 flex items-center gap-2"><Save size={16}/> SAVE CHANGES</button>
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

export default StockTable;
