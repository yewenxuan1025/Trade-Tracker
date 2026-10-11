import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImageUp, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { LookupSheetData, TransactionData } from '../types';
import { useToast } from './Toast';
import {
  IbScreenshotTradeCandidate,
  buildIbTradeFingerprint,
  markIbScreenshotDuplicates,
} from '../services/ibScreenshotParser';
import { IbOcrFileReport, IbOcrProgress, recognizeIbScreenshots } from '../services/ibScreenshotOcr';

interface IbScreenshotImportModalProps {
  files: File[];
  lookupData: LookupSheetData | null;
  existingTransactions: TransactionData[];
  onAddStock: (transaction: Partial<TransactionData>) => void;
  onAddOption: (transaction: Partial<TransactionData>) => void;
  onClose: () => void;
}

interface EditableNumberProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

const EditableNumber: React.FC<EditableNumberProps> = ({ value, onChange, className = '' }) => {
  const [raw, setRaw] = useState(String(value ?? 0));
  useEffect(() => setRaw(String(value ?? 0)), [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={event => {
        const next = event.target.value;
        setRaw(next);
        const parsed = Number(next);
        if (next.trim() !== '' && Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || raw.trim() === '') setRaw(String(value ?? 0));
      }}
      className={`rounded border border-slate-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 ${className}`}
    />
  );
};

const cleanDuplicateWarnings = (candidate: IbScreenshotTradeCandidate): IbScreenshotTradeCandidate => ({
  ...candidate,
  duplicate: false,
  warnings: candidate.warnings.filter(warning => !warning.startsWith('Duplicate of')),
});

const IbScreenshotImportModal: React.FC<IbScreenshotImportModalProps> = ({
  files,
  lookupData,
  existingTransactions,
  onAddStock,
  onAddOption,
  onClose,
}) => {
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(true);
  const [progress, setProgress] = useState<IbOcrProgress | null>(null);
  const [candidates, setCandidates] = useState<IbScreenshotTradeCandidate[]>([]);
  const [fileReports, setFileReports] = useState<IbOcrFileReport[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsProcessing(true);
    setError('');
    recognizeIbScreenshots(
      files,
      lookupData,
      existingTransactions,
      nextProgress => { if (!cancelled) setProgress(nextProgress); },
    )
      .then(result => {
        if (cancelled) return;
        setCandidates(result.candidates);
        setFileReports(result.fileReports);
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to run OCR');
      })
      .finally(() => { if (!cancelled) setIsProcessing(false); });
    return () => { cancelled = true; };
  }, [existingTransactions, files, lookupData]);

  const selectedCount = candidates.filter(candidate => candidate.selected && !candidate.duplicate).length;
  const duplicateCount = candidates.filter(candidate => candidate.duplicate).length;
  const stockCount = candidates.filter(candidate => candidate.assetType === 'Stock').length;
  const optionCount = candidates.filter(candidate => candidate.assetType === 'Option').length;

  const progressPercent = useMemo(() => {
    if (!progress || files.length === 0) return 0;
    return Math.min(100, Math.round(((progress.fileIndex + progress.progress) / files.length) * 100));
  }, [files.length, progress]);

  const updateCandidate = (
    id: string,
    patch: Partial<TransactionData>,
    recalculateCashFlow = false,
  ) => {
    setCandidates(current => {
      const edited = current.map(candidate => {
        if (candidate.id !== id) return cleanDuplicateWarnings(candidate);
        const transaction = { ...candidate.transaction, ...patch };
        let grossAmount = candidate.grossAmount;
        if (recalculateCashFlow && (patch.price !== undefined || patch.shares !== undefined)) {
          grossAmount = Math.abs(Number(transaction.price) || 0)
            * Math.abs(Number(transaction.shares) || 0)
            * (candidate.assetType === 'Option' ? 100 : 1);
        }
        if (recalculateCashFlow) {
          transaction.total = transaction.action.toLowerCase().includes('buy')
            ? -grossAmount - (Number(transaction.commission) || 0)
            : grossAmount - (Number(transaction.commission) || 0);
        }
        transaction.importFingerprint = buildIbTradeFingerprint(transaction);
        return cleanDuplicateWarnings({ ...candidate, transaction, grossAmount, selected: true });
      });
      return markIbScreenshotDuplicates(edited, existingTransactions);
    });
  };

  const toggleAll = (selected: boolean) => {
    setCandidates(current => current.map(candidate => ({
      ...candidate,
      selected: candidate.duplicate ? false : selected,
    })));
  };

  const handleImport = () => {
    const finalCandidates = markIbScreenshotDuplicates(
      candidates.map(cleanDuplicateWarnings),
      existingTransactions,
    ).filter(candidate => candidate.selected && !candidate.duplicate);
    if (finalCandidates.length === 0) {
      showToast('No new screenshot transactions are selected', 'info');
      return;
    }
    finalCandidates.forEach(candidate => {
      const transaction = {
        ...candidate.transaction,
        importFingerprint: buildIbTradeFingerprint(candidate.transaction),
      };
      if (candidate.assetType === 'Option') onAddOption(transaction);
      else onAddStock(transaction);
    });
    showToast(
      `Imported ${finalCandidates.length} IB screenshot transaction${finalCandidates.length > 1 ? 's' : ''}`,
      'success',
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-800">
              <ImageUp size={20} className="text-blue-600" /> Import IB Screenshots
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck size={13} className="text-emerald-600" /> OCR runs locally in this browser. Images are not uploaded to an external service.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-200" aria-label="Close screenshot importer"><X size={20} /></button>
        </div>

        {isProcessing ? (
          <div className="flex min-h-[520px] flex-col items-center justify-center px-8 text-center">
            <LoaderCircle size={42} className="animate-spin text-blue-600" />
            <h3 className="mt-5 text-lg font-black text-slate-800">Reading {files.length} screenshot{files.length > 1 ? 's' : ''}</h3>
            <p className="mt-2 text-sm text-slate-500">{progress?.fileName || 'Loading local OCR model'}</p>
            <p className="mt-1 text-xs capitalize text-slate-400">{progress?.status || 'initializing'}</p>
            <div className="mt-5 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="mt-2 font-mono text-xs text-slate-400">{progressPercent}%</span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3 text-xs">
              <span className="rounded-full bg-blue-50 px-3 py-1.5 font-bold text-blue-700">{candidates.length} detected</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-600">{stockCount} stocks</span>
              <span className="rounded-full bg-purple-50 px-3 py-1.5 font-bold text-purple-700">{optionCount} options</span>
              {duplicateCount > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 font-bold text-amber-700">{duplicateCount} duplicates skipped</span>}
              <span className="ml-auto font-semibold text-slate-400">Review all fields before importing</span>
            </div>

            {(error || fileReports.some(report => report.message)) && (
              <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    {error && <p>{error}</p>}
                    {fileReports.filter(report => report.message).map(report => <p key={report.fileName}><strong>{report.fileName}:</strong> {report.message}</p>)}
                  </div>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto p-6">
              <table className="min-w-[1320px] w-full border-separate border-spacing-0 text-left">
                <thead className="sticky top-0 z-20 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="border-b p-2"><input type="checkbox" checked={selectedCount > 0 && selectedCount === candidates.filter(candidate => !candidate.duplicate).length} onChange={event => toggleAll(event.target.checked)} /></th>
                    {['Status', 'Date / Time', 'Asset / Ticker / Company', 'Action', 'Quantity', 'Price', 'Commission', 'Total', 'Option Details', 'Market', 'Source File'].map(label => <th key={label} className="whitespace-nowrap border-b p-2 font-bold">{label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map(candidate => {
                    const transaction = candidate.transaction;
                    return (
                      <tr key={candidate.id} className={candidate.duplicate ? 'bg-amber-50/50' : candidate.selected ? 'bg-blue-50/30' : ''}>
                        <td className="p-2 align-top"><input type="checkbox" disabled={candidate.duplicate} checked={candidate.selected && !candidate.duplicate} onChange={event => setCandidates(current => current.map(item => item.id === candidate.id ? { ...item, selected: event.target.checked } : item))} /></td>
                        <td className="p-2 align-top">
                          <div className="flex items-center gap-1.5">
                            {candidate.duplicate ? <AlertTriangle size={14} className="text-amber-500" /> : <CheckCircle2 size={14} className="text-emerald-500" />}
                            <span className={`text-xs font-black ${candidate.confidence >= 80 ? 'text-emerald-700' : candidate.confidence >= 60 ? 'text-amber-700' : 'text-red-600'}`}>{candidate.confidence}%</span>
                          </div>
                          {candidate.warnings.length > 0 && <div className="mt-1 max-w-[180px] text-[10px] leading-4 text-amber-700" title={candidate.rawText}>{candidate.warnings.join(' · ')}</div>}
                        </td>
                        <td className="p-2 align-top">
                          <input type="date" value={transaction.date} onChange={event => updateCandidate(candidate.id, { date: event.target.value })} className="w-[132px] rounded border border-slate-200 px-2 py-1.5 text-xs" />
                          <div className="mt-1 font-mono text-[10px] text-slate-400">{transaction.executionTime || 'time unavailable'}</div>
                        </td>
                        <td className="min-w-[270px] p-2 align-top">
                          <div className="flex items-center gap-2">
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black ${candidate.assetType === 'Option' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{candidate.assetType}</span>
                            <input value={transaction.stock} onChange={event => updateCandidate(candidate.id, { stock: event.target.value.toUpperCase() })} className="w-[92px] shrink-0 rounded border border-slate-200 px-2 py-1.5 text-xs font-black uppercase" />
                            <span className="min-w-0 max-w-[150px] truncate text-[11px] font-medium text-slate-500" title={transaction.name}>{transaction.name}</span>
                          </div>
                        </td>
                        <td className="p-2 align-top"><select value={transaction.action} onChange={event => updateCandidate(candidate.id, { action: event.target.value }, true)} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="Buy">Buy</option><option value="Sell">Sell</option></select></td>
                        <td className="p-2 align-top"><EditableNumber value={transaction.shares} onChange={value => updateCandidate(candidate.id, { shares: value }, true)} className="w-[80px]" /></td>
                        <td className="p-2 align-top"><EditableNumber value={transaction.price} onChange={value => updateCandidate(candidate.id, { price: value }, true)} className="w-[90px]" /></td>
                        <td className="p-2 align-top"><EditableNumber value={transaction.commission} onChange={value => updateCandidate(candidate.id, { commission: value }, true)} className="w-[90px]" /></td>
                        <td className="p-2 align-top"><EditableNumber value={transaction.total} onChange={value => updateCandidate(candidate.id, { total: value })} className="w-[105px] font-bold" /></td>
                        <td className="p-2 align-top">
                          {candidate.assetType === 'Option' ? (
                            <div className="flex items-center gap-1">
                              <select value={transaction.option} onChange={event => updateCandidate(candidate.id, { option: event.target.value })} className="rounded border border-slate-200 bg-white px-1.5 py-1.5 text-xs"><option value="Call">Call</option><option value="Put">Put</option></select>
                              <input type="date" value={transaction.expiration} onChange={event => updateCandidate(candidate.id, { expiration: event.target.value })} className="w-[128px] rounded border border-slate-200 px-1.5 py-1.5 text-xs" />
                              <EditableNumber value={transaction.strike} onChange={value => updateCandidate(candidate.id, { strike: value })} className="w-[70px]" />
                            </div>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="p-2 align-top"><input value={transaction.market} onChange={event => updateCandidate(candidate.id, { market: event.target.value.toUpperCase() })} className="w-[65px] rounded border border-slate-200 px-2 py-1.5 text-xs uppercase" /><div className="mt-1 text-[10px] text-slate-400">{candidate.currency} · {candidate.venue || 'venue n/a'}</div></td>
                        <td className="max-w-[170px] p-2 align-top text-[10px] text-slate-500"><span className="line-clamp-2" title={candidate.sourceFile}>{candidate.sourceFile}</span></td>
                      </tr>
                    );
                  })}
                  {candidates.length === 0 && (
                    <tr><td colSpan={12} className="p-16 text-center text-sm text-slate-400">No complete transaction rows were recognized. Try an uncropped IB Filled Orders screenshot.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-6 py-4">
              <p className="text-xs text-slate-500">{selectedCount} new transaction{selectedCount === 1 ? '' : 's'} selected</p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200">Cancel</button>
                <button type="button" disabled={selectedCount === 0} onClick={handleImport} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">Import {selectedCount} Transactions</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default IbScreenshotImportModal;
