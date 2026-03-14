import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Save, X, Trash2, TrendingUp, DollarSign, Percent, Upload, Calendar } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { NavData } from '../types';
import { generateId } from '../services/excelService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area } from 'recharts';

interface NavDashboardProps {
  data: NavData[];
  onUpdate: (data: NavData[]) => void;
  onUpload: (file: File) => void;
}

const NavDashboard: React.FC<NavDashboardProps> = ({ data, onUpdate, onUpload }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRecord, setNewRecord] = useState<Partial<NavData>>({ date: new Date().toISOString().split('T')[0], aum: 0 });
  const [editRecord, setEditRecord] = useState<Partial<NavData>>({});
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  // Set periodStart to earliest date when data loads
  useMemo(() => {
    if (sortedData.length > 0 && !periodStart) {
      setPeriodStart(sortedData[0].date);
    }
  }, [sortedData]);

  const periodReturn = useMemo(() => {
    if (!periodStart || sortedData.length === 0) return null;
    const startRecord = sortedData.find(d => d.date >= periodStart);
    const endRecord = [...sortedData].reverse().find(d => d.date <= periodEnd);
    if (!startRecord || !endRecord || startRecord.nav2 === 0) return null;
    return (endRecord.nav2 - startRecord.nav2) / startRecord.nav2;
  }, [sortedData, periodStart, periodEnd]);

  const handleAdd = () => {
    if (!newRecord.date || newRecord.aum === undefined) return;

    // Find the record immediately before the new date
    const newDate = new Date(newRecord.date).getTime();
    const prevRecord = sortedData.filter(d => new Date(d.date).getTime() < newDate).pop();

    const shares = prevRecord ? prevRecord.shares : (newRecord.aum || 0); // Default to AUM if first record (NAV=1)
    const nav2 = shares > 0 ? (newRecord.aum || 0) / shares : 1;
    const nav1 = nav2;
    const cumulativeReturn = nav2 - 1;

    const newItem: NavData = {
      id: generateId(),
      date: newRecord.date,
      aum: newRecord.aum,
      shares,
      nav1,
      nav2,
      cumulativeReturn
    };

    onUpdate([...data, newItem]);
    setIsAdding(false);
    setNewRecord({ date: new Date().toISOString().split('T')[0], aum: 0 });
  };

  const handleSaveEdit = () => {
    if (!editingId || !editRecord.date || editRecord.aum === undefined) return;

    const updatedData = data.map(item => {
        if (item.id === editingId) {
            const shares = editRecord.shares !== undefined ? editRecord.shares : item.shares;
            const nav2 = shares > 0 ? (editRecord.aum || 0) / shares : 0;
            return {
                ...item,
                date: editRecord.date || item.date,
                aum: editRecord.aum || 0,
                shares: shares,
                nav1: nav2,
                nav2: nav2,
                cumulativeReturn: nav2 - 1
            };
        }
        return item;
    });

    onUpdate(updatedData);
    setEditingId(null);
    setEditRecord({});
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      message: 'Delete this NAV record?',
      onConfirm: () => {
        onUpdate(data.filter(item => item.id !== id));
        setConfirmState(null);
      }
    });
  };

  const startEdit = (item: NavData) => {
    setEditingId(item.id);
    setEditRecord({ ...item });
  };

  // Chart Data
  const chartData = sortedData.map(item => ({
    date: item.date,
    aum: item.aum,
    cumulativeReturn: item.cumulativeReturn * 100 // Convert to %
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><TrendingUp className="w-5 h-5 mr-2 text-blue-600" /> AUM & Cumulative Return</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorAum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{fontSize: 12}} tickLine={false} axisLine={false} tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12}} tickLine={false} axisLine={false} tickFormatter={(val) => `${val.toFixed(0)}%`} />
                <Tooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: number, name: string) => [
                        name === 'cumulativeReturn' ? `${value.toFixed(2)}%` : `$${value.toLocaleString()}`,
                        name === 'cumulativeReturn' ? 'Cumulative Return' : 'AUM'
                    ]}
                />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="aum" name="AUM" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAum)" />
                <Line yAxisId="right" type="monotone" dataKey="cumulativeReturn" name="Cumulative Return" stroke="#ef4444" strokeWidth={3} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Latest Stats</h3>
                <div className="space-y-4">
                    <div>
                        <p className="text-sm text-slate-400">Current AUM</p>
                        <p className="text-2xl font-bold text-slate-800">${(sortedData[sortedData.length - 1]?.aum || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Cumulative Return</p>
                        <p className={`text-2xl font-bold ${(sortedData[sortedData.length - 1]?.cumulativeReturn || 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {((sortedData[sortedData.length - 1]?.cumulativeReturn || 0) * 100).toFixed(2)}%
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Latest NAV</p>
                        <p className="text-2xl font-bold text-slate-800">{(sortedData[sortedData.length - 1]?.nav2 || 0).toFixed(4)}</p>
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Calendar size={14} />Period Return</h3>
                <div className="space-y-2 mb-3">
                    <div>
                        <p className="text-xs text-slate-400 mb-1">From</p>
                        <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 mb-1">To</p>
                        <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                </div>
                {periodReturn !== null ? (
                    <p className={`text-2xl font-bold ${periodReturn >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {(periodReturn * 100).toFixed(2)}%
                    </p>
                ) : (
                    <p className="text-slate-400 text-sm">No data for selected period</p>
                )}
            </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">Daily NAV Records</h3>
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">
              <Upload size={16} /><span>Upload</span>
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => { if(e.target.files?.[0]) onUpload(e.target.files[0]); }} />
            </label>
            <button onClick={() => setIsAdding(true)} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={16} /><span>Add Record</span>
            </button>
          </div>
        </div>
        
        {isAdding && (
            <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center space-x-4 animate-in slide-in-from-top-2">
                <input 
                    type="date" 
                    value={newRecord.date} 
                    onChange={e => setNewRecord({...newRecord, date: e.target.value})}
                    className="px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                    <input 
                        type="number" 
                        placeholder="AUM"
                        value={newRecord.aum || ''} 
                        onChange={e => setNewRecord({...newRecord, aum: parseFloat(e.target.value)})}
                        className="pl-8 px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                    />
                </div>
                <button onClick={handleAdd} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Save size={18} /></button>
                <button onClick={() => setIsAdding(false)} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg"><X size={18} /></button>
            </div>
        )}

        <div className="overflow-x-scroll">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">AUM</th>
                <th className="px-6 py-4">NAV</th>
                <th className="px-6 py-4">Cumulative Return</th>
                <th className="px-6 py-4">Shares</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedData.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No NAV records found. Upload a file or add a record.</td></tr>
              ) : (
                [...sortedData].reverse().map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-900">
                        {editingId === item.id ? (
                            <input 
                                type="date" 
                                value={editRecord.date} 
                                onChange={e => setEditRecord({...editRecord, date: e.target.value})}
                                className="px-2 py-1 rounded border border-slate-300"
                            />
                        ) : item.date}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600">
                        {editingId === item.id ? (
                            <input 
                                type="number" 
                                value={editRecord.aum} 
                                onChange={e => setEditRecord({...editRecord, aum: parseFloat(e.target.value)})}
                                className="px-2 py-1 rounded border border-slate-300 w-32"
                            />
                        ) : `$${item.aum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600">{(item.nav2 || 0).toFixed(4)}</td>
                    <td className={`px-6 py-4 font-mono font-medium ${(item.cumulativeReturn || 0) >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {((item.cumulativeReturn || 0) * 100).toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                        {editingId === item.id ? (
                            <input 
                                type="number" 
                                value={editRecord.shares} 
                                onChange={e => setEditRecord({...editRecord, shares: parseFloat(e.target.value)})}
                                className="px-2 py-1 rounded border border-slate-300 w-32"
                            />
                        ) : item.shares.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                        {editingId === item.id ? (
                            <div className="flex justify-end space-x-2">
                                <button onClick={handleSaveEdit} className="text-emerald-600 hover:bg-emerald-50 p-1 rounded"><Save size={16} /></button>
                                <button onClick={() => setEditingId(null)} className="text-slate-500 hover:bg-slate-100 p-1 rounded"><X size={16} /></button>
                            </div>
                        ) : (
                            <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEdit(item)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                            </div>
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {confirmState && <ConfirmDialog message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />}
    </div>
  );
};

export default NavDashboard;
