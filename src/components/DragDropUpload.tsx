import { useState, useRef, DragEvent } from 'react';
import { Upload, File, X, CheckCircle } from 'lucide-react';

interface DragDropUploadProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxFiles?: number;
  maxSize?: number;
}

export function DragDropUpload({
  onFilesSelected,
  accept = '.dwg,.dxf',
  maxFiles = 10,
  maxSize = 50 * 1024 * 1024,
}: DragDropUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (files: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    files.forEach((file) => {
      if (file.size > maxSize) {
        errors.push(`${file.name} exceeds maximum size of ${maxSize / 1024 / 1024}MB`);
      } else if (accept && !accept.split(',').some(ext => file.name.toLowerCase().endsWith(ext.trim()))) {
        errors.push(`${file.name} has unsupported file type`);
      } else {
        valid.push(file);
      }
    });

    if (valid.length + selectedFiles.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} files allowed`);
      return { valid: valid.slice(0, maxFiles - selectedFiles.length), errors };
    }

    return { valid, errors };
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOut = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const { valid, errors } = validateFiles(files);

    setErrors(errors);
    if (valid.length > 0) {
      const newFiles = [...selectedFiles, ...valid];
      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const files = Array.from(e.target.files);
    const { valid, errors } = validateFiles(files);

    setErrors(errors);
    if (valid.length > 0) {
      const newFiles = [...selectedFiles, ...valid];
      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer
          ${isDragging
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
            : 'border-slate-300 dark:border-blue-500/30 bg-slate-50 dark:bg-slate-800/40 hover:border-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }
        `}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-500' : 'text-slate-400 dark:text-blue-400'}`} />
        <h3 className="text-lg font-bold text-slate-700 dark:text-blue-50 mb-2">
          {isDragging ? 'Drop files here' : 'Drag & drop files here'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-blue-200/60 mb-2">
          or click to browse
        </p>
        <p className="text-xs text-slate-400 dark:text-blue-200/50">
          Supported formats: {accept} • Max {maxFiles} files • Max {maxSize / 1024 / 1024}MB per file
        </p>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
          <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
            {errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold text-slate-700 dark:text-blue-50">Selected Files ({selectedFiles.length})</h4>
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-3 bg-white dark:bg-slate-800/60 border border-slate-300 dark:border-blue-500/30 rounded-xl p-3"
            >
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <File className="w-5 h-5 text-slate-500 dark:text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-blue-50 truncate">{file.name}</p>
                <p className="text-xs text-slate-500 dark:text-blue-200/60">{formatFileSize(file.size)}</p>
              </div>
              <button
                onClick={() => removeFile(index)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-600 dark:text-blue-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
