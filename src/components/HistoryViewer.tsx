import { useState, useEffect } from 'react';
import { X, Download, Upload, Trash2, Edit, Clock, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SkeletonList } from './SkeletonLoader';
import { EmptyHistory } from './EmptyState';
import { Tooltip } from './Tooltip';

interface HistoryViewerProps {
  onClose: () => void;
}

interface OperationHistory {
  id: string;
  operation_type: string;
  block_ids: any;
  details: any;
  created_at: string;
  file_name?: string;
  file_size?: number;
  status: string;
}

export function HistoryViewer({ onClose }: HistoryViewerProps) {
  const [history, setHistory] = useState<OperationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'import' | 'export'>('all');

  useEffect(() => {
    loadHistory();
  }, [filter]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('operation_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter !== 'all') {
        query = query.eq('operation_type', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'import':
        return <Upload className="w-5 h-5" />;
      case 'export':
        return <Download className="w-5 h-5" />;
      case 'delete':
        return <Trash2 className="w-5 h-5" />;
      case 'update':
      case 'bulk_update':
        return <Edit className="w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-blue-500/30 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="bg-slate-100 dark:bg-slate-800/50 border-b border-slate-300 dark:border-blue-500/30 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-blue-50">Operation History</h2>
          </div>
          <Tooltip content="Close history">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-blue-500/40 flex items-center justify-center text-slate-700 dark:text-blue-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        <div className="p-6">
          <div className="flex gap-2 mb-6">
            {(['all', 'import', 'export'] as const).map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`px-4 py-2 rounded-xl font-medium transition-colors capitalize ${
                  filter === filterType
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {filterType}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto max-h-[calc(90vh-200px)]">
            {loading ? (
              <SkeletonList count={5} />
            ) : history.length === 0 ? (
              <EmptyHistory />
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-50 dark:bg-slate-800/40 border border-slate-300 dark:border-blue-500/30 rounded-xl p-4 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-500/40 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                        {getOperationIcon(item.operation_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-800 dark:text-blue-50 capitalize">
                            {item.operation_type}
                          </h3>
                          {getStatusIcon(item.status)}
                        </div>
                        {item.file_name && (
                          <p className="text-sm text-slate-600 dark:text-blue-200/80 truncate mb-1">
                            {item.file_name}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-blue-200/60">
                          <span>{formatTimeAgo(item.created_at)}</span>
                          {item.file_size && <span>{formatFileSize(item.file_size)}</span>}
                          {Array.isArray(item.block_ids) && item.block_ids.length > 0 && (
                            <span>{item.block_ids.length} blocks</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
