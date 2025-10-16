import { ReactNode } from 'react';
import { FileQuestion, Search, FolderOpen, Package, Database } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'search' | 'folder' | 'data' | 'general';
}

export function EmptyState({ icon, title, description, action, variant = 'general' }: EmptyStateProps) {
  const variantIcons = {
    search: <Search className="w-16 h-16" />,
    folder: <FolderOpen className="w-16 h-16" />,
    data: <Database className="w-16 h-16" />,
    general: <FileQuestion className="w-16 h-16" />,
  };

  const displayIcon = icon || variantIcons[variant];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-slate-400 dark:text-blue-300/40 mb-4">
        {displayIcon}
      </div>
      <h3 className="text-xl font-bold text-slate-700 dark:text-blue-50 mb-2">
        {title}
      </h3>
      <p className="text-slate-500 dark:text-blue-200/60 max-w-md mb-6">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg hover:shadow-xl"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function EmptyBlocks({ onImport }: { onImport?: () => void }) {
  return (
    <EmptyState
      icon={<Package className="w-16 h-16" />}
      title="No Blocks Yet"
      description="Import your first block to get started with your library. You can import DWG files or create blocks manually."
      action={onImport ? { label: 'Import Blocks', onClick: onImport } : undefined}
      variant="data"
    />
  );
}

export function EmptySearch({ query }: { query: string }) {
  return (
    <EmptyState
      title="No Results Found"
      description={`No blocks match "${query}". Try different keywords or filters.`}
      variant="search"
    />
  );
}

export function EmptyHistory() {
  return (
    <EmptyState
      title="No History Yet"
      description="Your import and export operations will appear here once you start using the library."
      variant="data"
    />
  );
}
