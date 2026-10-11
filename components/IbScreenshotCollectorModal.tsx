import React, { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, ImagePlus, Images, ScanSearch, Trash2, UploadCloud, X } from 'lucide-react';

interface IbScreenshotCollectorModalProps {
  onRecognize: (files: File[]) => void;
  onClose: () => void;
}

interface QueuedScreenshot {
  id: string;
  file: File;
  previewUrl: string;
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const imageExtensionForMimeType = (mimeType: string): string => {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
};

const clipboardImageFiles = (clipboardData: DataTransfer): File[] => {
  const itemFiles = Array.from(clipboardData.items)
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null);
  const sourceFiles = itemFiles.length > 0
    ? itemFiles
    : Array.from(clipboardData.files).filter(file => file.type.startsWith('image/'));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return sourceFiles.map((file, index) => new File(
    [file],
    `clipboard-ib-${timestamp}-${index + 1}.${imageExtensionForMimeType(file.type)}`,
    { type: file.type || 'image/png', lastModified: Date.now() },
  ));
};

const fileSizeLabel = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const IbScreenshotCollectorModal: React.FC<IbScreenshotCollectorModalProps> = ({ onRecognize, onClose }) => {
  const [screenshots, setScreenshots] = useState<QueuedScreenshot[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pasteBoxRef = useRef<HTMLDivElement>(null);
  const screenshotsRef = useRef<QueuedScreenshot[]>([]);

  useEffect(() => {
    pasteBoxRef.current?.focus();
  }, []);

  useEffect(() => {
    screenshotsRef.current = screenshots;
  }, [screenshots]);

  useEffect(() => () => {
    screenshotsRef.current.forEach(screenshot => URL.revokeObjectURL(screenshot.previewUrl));
  }, []);

  const addFiles = (incomingFiles: File[]) => {
    const supported = incomingFiles.filter(file => SUPPORTED_IMAGE_TYPES.has(file.type));
    if (supported.length === 0) {
      setMessage('Please add PNG, JPG, or WebP screenshots.');
      return;
    }
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const queued = supported.map((file, index) => ({
      id: `${batchId}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setScreenshots(current => [...current, ...queued]);
    setMessage(`${supported.length} screenshot${supported.length === 1 ? '' : 's'} added. You can add more before recognition.`);
    requestAnimationFrame(() => pasteBoxRef.current?.focus());
  };

  const removeScreenshot = (id: string) => {
    setScreenshots(current => {
      const target = current.find(screenshot => screenshot.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter(screenshot => screenshot.id !== id);
    });
  };

  const clearAll = () => {
    screenshots.forEach(screenshot => URL.revokeObjectURL(screenshot.previewUrl));
    setScreenshots([]);
    setMessage('All screenshots removed.');
    requestAnimationFrame(() => pasteBoxRef.current?.focus());
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = clipboardImageFiles(event.clipboardData);
    if (files.length === 0) {
      setMessage('The clipboard does not contain an image.');
      return;
    }
    event.preventDefault();
    addFiles(files);
  };

  const totalBytes = screenshots.reduce((sum, screenshot) => sum + screenshot.file.size, 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-slate-50 px-6 py-5">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-slate-800"><Images size={22} className="text-blue-600" /> Add This Week&apos;s IB Screenshots</h2>
            <p className="mt-1 text-sm text-slate-500">Collect all screenshots first, then run local OCR once for the complete batch.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Close screenshot collector"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={event => {
              addFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />

          <div
            ref={pasteBoxRef}
            role="button"
            tabIndex={0}
            aria-label="Choose, drop, or paste IB screenshots"
            onClick={() => inputRef.current?.click()}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
            }}
            onPaste={handlePaste}
            onDragOver={event => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={event => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(Array.from(event.dataTransfer.files));
            }}
            className={`group flex min-h-[250px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-10 text-center outline-none transition-all ${isDragging ? 'scale-[1.01] border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/40 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'}`}
          >
            <div className={`rounded-full p-5 transition-colors ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-white text-slate-500 shadow-sm group-hover:text-blue-600'}`}><UploadCloud size={42} /></div>
            <h3 className="mt-5 text-xl font-black text-slate-800">Choose, Drop, or Paste Screenshots</h3>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">Click this box to select multiple files, drag images here, or copy a screenshot and press <strong className="text-slate-700">Cmd+V / Ctrl+V</strong>.</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">You can paste repeatedly; new screenshots are added to the current batch.</p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200"><ImagePlus size={17} /> Browse Screenshots</span>
            <span className="mt-3 text-[11px] font-medium text-slate-400">PNG, JPG, or WebP</span>
          </div>

          {message && <p className="mt-3 text-center text-xs font-semibold text-slate-500" aria-live="polite">{message}</p>}

          {screenshots.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-800">Batch ready for recognition</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{screenshots.length} screenshot{screenshots.length === 1 ? '' : 's'} · {fileSizeLabel(totalBytes)}</p>
                </div>
                <button type="button" onClick={clearAll} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50"><Trash2 size={14} /> Remove All</button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {screenshots.map((screenshot, index) => (
                  <div key={screenshot.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <img src={screenshot.previewUrl} alt={`IB screenshot ${index + 1}`} className="h-32 w-full bg-slate-100 object-contain" />
                    <div className="border-t px-3 py-2">
                      <p className="truncate text-[11px] font-bold text-slate-700" title={screenshot.file.name}>{index + 1}. {screenshot.file.name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{fileSizeLabel(screenshot.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={event => { event.stopPropagation(); removeScreenshot(screenshot.id); }}
                      className="absolute right-2 top-2 rounded-full bg-slate-950/70 p-1.5 text-white opacity-80 shadow hover:bg-red-600 hover:opacity-100"
                      aria-label={`Remove screenshot ${index + 1}`}
                    ><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-6 py-4">
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><ClipboardPaste size={14} className="text-blue-600" /> Paste additional screenshots into the box before continuing.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200">Cancel</button>
            <button
              type="button"
              disabled={screenshots.length === 0}
              onClick={() => onRecognize(screenshots.map(screenshot => screenshot.file))}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            ><ScanSearch size={17} /> Recognize {screenshots.length} Screenshot{screenshots.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IbScreenshotCollectorModal;
