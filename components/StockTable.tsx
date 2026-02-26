
import React, { useState, useMemo, useRef } from 'react';
import { StockData, TYPE_OPTIONS, CATEGORY_OPTIONS, CLASS_OPTIONS, MARKET_OPTIONS } from '../types';
import { Search, AlertCircle, Download, Upload, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface StockTableProps {
  stocks: StockData[];
  onStockUpdate: (index: number, field: keyof StockData, value: any) => void;
  onExport: () => void;
  onUpload: (file: File) => void;
}

const StockTable: React.FC<StockTableProps> = ({ stocks, onStockUpdate, onExport, onUpload }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof StockData; direction: 'asc' | 'desc' } | null>(null);
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden relative">
      <input type="file" ref={fileInputRef} onChange={(e) => { if(e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ''; }} accept=".xlsx, .xls" className="hidden" />
      
      {/* Control Section Fixed at Top */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div><h2 className="text-lg font-bold text-slate-800">Lookup Data</h2><p className="text-xs text-slate-500">{processedStocks.length} records</p></div>
              <div className="flex gap-2">
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
                <HeaderCell label="Ticker" field="ticker" stickyLeft />
                <HeaderCell label="Name" field="companyName" />
                <HeaderCell label="CCS" field="isChinese" />
                <HeaderCell label="Code" field="tradingCode" />
                <HeaderCell label="Price" field="closePrice" />
                <HeaderCell label="Mkt Cap" field="marketCap" />
                <HeaderCell label="PE" field="peTTM" />
                <HeaderCell label="PB" field="pb" />
                <HeaderCell label="Div" field="dividendYield" />
                <HeaderCell label="ROE" field="roeTTM" />
                <HeaderCell label="PS" field="psQuantile" />
                <HeaderCell label="Type" field="type" />
                <HeaderCell label="Cat" field="category" />
                <HeaderCell label="Class" field="class" />
                <HeaderCell label="Market" field="market" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {processedStocks.map((stock) => (
                <tr key={`${stock.ticker}-${stock.originalIndex}`} className="hover:bg-blue-50/30 group transition-colors">
                  <td className="px-4 py-2 sticky left-0 bg-white z-10 border-r border-slate-100 group-hover:bg-blue-50/50 font-bold text-blue-600 text-xs">{stock.ticker}</td>
                  <td className="px-4 py-2 truncate text-slate-600 text-xs">{stock.companyName}</td>
                  <td className="px-4 py-2 text-center text-xs">{stock.isChinese}</td>
                  <td className="px-4 py-2 text-xs">{stock.tradingCode}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{stock.closePrice.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{(stock.marketCap / 100000000).toFixed(2)}Yi</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{stock.peTTM.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{stock.pb.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{stock.dividendYield.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{stock.roeTTM.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{stock.psQuantile.toFixed(2)}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.type}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.category}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.class}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-500">{stock.market}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockTable;
