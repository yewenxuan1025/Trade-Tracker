
import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, Loader2, X } from 'lucide-react';

interface FileUploadProps {
  onFileProcess: (file: File) => Promise<void>;
  isLoading: boolean;
  onCancel?: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileProcess, isLoading, onCancel }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileProcess(e.target.files[0]);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="p-8">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Upload Data File</h2>
                    <p className="text-slate-500 mt-1">Select an Excel file containing your Lookup, Transaction, and P&L data.</p>
                </div>
                {onCancel && (
                    <button 
                        onClick={onCancel}
                        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        title="Cancel"
                    >
                        <X size={24} />
                    </button>
                )}
            </div>

            <div
                className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-300 ease-in-out flex flex-col items-center justify-center text-center cursor-pointer group
                ${isDragging 
                    ? 'border-blue-500 bg-blue-50 scale-[1.01]' 
                    : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
                }
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <input
                type="file"
                accept=".xlsx, .xls"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={handleInputChange}
                disabled={isLoading}
                />
                
                <div className="z-0 flex flex-col items-center space-y-4">
                <div className={`p-5 rounded-full transition-colors duration-300 ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                    {isLoading ? (
                    <Loader2 className="w-10 h-10 animate-spin" />
                    ) : (
                    <FileSpreadsheet className="w-10 h-10" />
                    )}
                </div>
                
                <div>
                    <h3 className="text-xl font-bold text-slate-800">
                    {isLoading ? 'Processing Excel...' : 'Click to Upload or Drag & Drop'}
                    </h3>
                    <p className="text-slate-500 mt-2 max-w-xs mx-auto">
                    Supports .xlsx and .xls files. 
                    Sheets should be named "Lookup", "Transaction", and "P&L".
                    </p>
                </div>
                
                <div className="pt-4">
                    <button className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold shadow-lg shadow-blue-200 group-hover:bg-blue-700 transition-colors">
                        Browse Files
                    </button>
                </div>
                </div>
            </div>

            {onCancel && (
                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center">
                    <button 
                        onClick={onCancel}
                        className="text-slate-500 font-medium hover:text-slate-800 transition-colors flex items-center gap-2"
                    >
                        Return to Dashboard
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
