
import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
    <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 bg-red-50 rounded-lg flex-shrink-0">
          <AlertTriangle size={18} className="text-red-600" />
        </div>
        <p className="text-slate-700 text-sm font-medium pt-1">{message}</p>
      </div>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
);

export default ConfirmDialog;
