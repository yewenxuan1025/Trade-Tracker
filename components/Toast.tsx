import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />,
    error: <XCircle size={16} className="text-red-600 flex-shrink-0" />,
    info: <Info size={16} className="text-blue-600 flex-shrink-0" />,
  };

  const borders: Record<ToastType, string> = {
    success: 'border-emerald-200',
    error: 'border-red-200',
    info: 'border-blue-200',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 bg-white border ${borders[t.type]} rounded-xl shadow-lg px-4 py-3 pointer-events-auto animate-in slide-in-from-right-4`}
          >
            {icons[t.type]}
            <p className="text-slate-700 text-sm flex-1 leading-snug">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600 flex-shrink-0 -mr-1 -mt-0.5">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
