import { useState, useEffect } from 'react';
import { Home, Search, ChevronLeft, ChevronRight, Package, Folder, RefreshCw } from 'lucide-react';
import { BlockService } from '../lib/blockService';
import { ThumbnailService } from '../lib/thumbnailService';
import type { BlockCategory, Block } from '../lib/supabase';

interface BlockLibraryProps {
  onBack: () => void;
  onOpenViewer: (block: any) => void;
  onOpenBulkOps?: () => void;
}

export function BlockLibrary({ onBack, onOpenViewer, onOpenBulkOps }: BlockLibraryProps) {
  const [categories, setCategories] = useState<BlockCategory[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [filteredBlocks, setFilteredBlocks] = useState<Block[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage] = useState(12);
  const [viewMode, setViewMode] = useState<'all' | 'recent' | 'categories'>('all');
  const [cardSize, setCardSize] = useState<'compact' | 'medium' | 'large'>('medium');
  const [hoveredBlock, setHoveredBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, selectedCategory, viewMode, blocks]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesData, blocksData] = await Promise.all([
        BlockService.getCategories(),
        BlockService.getBlocks()
      ]);

      setCategories(categoriesData);
      setBlocks(blocksData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = async (categoryName: string, categoryId?: string) => {
    setSelectedCategory(categoryName);
    setSelectedCategoryId(categoryId || '');

    if (categoryName !== 'All Categories' && categoryId) {
      try {
        const categoryBlocks = await BlockService.getBlocks(categoryId);
        setBlocks(categoryBlocks);
      } catch (error) {
        console.error('Failed to load category blocks:', error);
      }
    } else {
      // Load all blocks
      try {
        const allBlocks = await BlockService.getBlocks();
        setBlocks(allBlocks);
      } catch (error) {
        console.error('Failed to load all blocks:', error);
      }
    }
  };

  const handleSyncCategory = async (categoryId: string) => {
    try {
      setSyncing(categoryId);
      const result = await BlockService.syncCategoryBlocks(categoryId);
      console.log(`Synced ${result.synced} of ${result.total} blocks`);

      // Reload blocks for this category
      if (selectedCategoryId === categoryId) {
        const categoryBlocks = await BlockService.getBlocks(categoryId);
        setBlocks(categoryBlocks);
      }
    } catch (error) {
      console.error('Failed to sync category:', error);
    } finally {
      setSyncing('');
    }
  };

  const applyFilters = () => {
    let filtered = [...blocks];

    if (viewMode === 'recent') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(b => {
        if (!b.last_modified) return false;
        const lastModified = new Date(b.last_modified);
        return lastModified >= thirtyDaysAgo;
      });
    }

    // Category filtering is now handled by handleCategorySelect
    // since we load blocks by category from the database

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(b =>
        b.name.toLowerCase().includes(query)
      );
    }

    setFilteredBlocks(filtered);
    setCurrentPage(0);
  };

  const totalPages = Math.ceil(filteredBlocks.length / itemsPerPage);
  const paginatedBlocks = filteredBlocks.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );



  if (loading) {
    return (
      <div className="min-h-screen p-6 md:p-10 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-blue-200">Loading categories and blocks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex gap-6">
          <div className="flex-1 space-y-8">
            <header className="glass-effect rounded-3xl p-6 smooth-shadow">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-blue-50 flex items-center gap-3">
                  🎯 Block Library
                </h1>
                {onOpenBulkOps && (
                  <button
                    onClick={onOpenBulkOps}
                    className="px-4 py-2 bg-blue-100 dark:bg-blue-500/20 hover:bg-blue-200 dark:hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-300 dark:border-blue-500/30 transition-all smooth-shadow flex items-center gap-2 hover:scale-105"
                  >
                    <Package className="w-4 h-4" />
                    Bulk Operations
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-blue-200/80">
                <button onClick={onBack} className="hover:text-blue-600 dark:hover:text-blue-400 transition-all hover:scale-105 flex items-center gap-1">
                  <Home className="w-4 h-4" />
                  Dashboard
                </button>
                <span>›</span>
                <span className="font-bold">Block Library</span>
              </div>
            </header>

            <div className="glass-effect rounded-2xl p-6 smooth-shadow space-y-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode('all')}
                    className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                      viewMode === 'all'
                        ? 'bg-blue-600 dark:bg-blue-500/20 border-2 border-blue-600 dark:border-blue-500 text-white dark:text-blue-50 scale-105'
                        : 'bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-blue-500/30 text-slate-700 dark:text-blue-200 hover:bg-slate-200 dark:hover:bg-slate-900/50 hover:scale-105'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setViewMode('recent')}
                    className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                      viewMode === 'recent'
                        ? 'bg-blue-600 dark:bg-blue-500/20 border-2 border-blue-600 dark:border-blue-500 text-white dark:text-blue-50 scale-105'
                        : 'bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-blue-500/30 text-slate-700 dark:text-blue-200 hover:bg-slate-200 dark:hover:bg-slate-900/50 hover:scale-105'
                    }`}
                  >
                    Recent
                  </button>
                  <button
                    onClick={() => setViewMode('categories')}
                    className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                      viewMode === 'categories'
                        ? 'bg-blue-600 dark:bg-blue-500/20 border-2 border-blue-600 dark:border-blue-500 text-white dark:text-blue-50 scale-105'
                        : 'bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-blue-500/30 text-slate-700 dark:text-blue-200 hover:bg-slate-200 dark:hover:bg-slate-900/50 hover:scale-105'
                    }`}
                  >
                    Categories
                  </button>
                </div>

                <div className="flex-1 min-w-[200px] bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-blue-500/30 rounded-xl px-4 py-2 flex items-center gap-2 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                  <Search className="w-4 h-4 text-slate-500 dark:text-blue-400" />
                  <input
                    type="text"
                    placeholder="Search blocks…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-slate-800 dark:text-blue-50 placeholder-slate-500 dark:placeholder-blue-200/60"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    className="w-9 h-9 rounded-lg bg-slate-900/30 border border-blue-500/30 flex items-center justify-center text-blue-200 hover:bg-slate-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-blue-200 px-2">
                    {currentPage + 1} / {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="w-9 h-9 rounded-lg bg-slate-900/30 border border-blue-500/30 flex items-center justify-center text-blue-200 hover:bg-slate-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 items-center">
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    const categoryName = e.target.value;
                    const category = categories.find(c => c.name === categoryName);
                    handleCategorySelect(categoryName, category?.id);
                  }}
                  className="bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-blue-500/30 rounded-xl px-4 py-2 text-slate-800 dark:text-blue-50 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option>All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name} {cat.path ? `(${cat.path})` : '(No path set)'}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All Categories');
                    setViewMode('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-blue-500/30 text-slate-700 dark:text-blue-200 hover:bg-slate-200 dark:hover:bg-slate-900/50 transition-all hover:scale-105"
                >
                  Clear filters
                </button>

                <div className="flex-1" />

                <select
                  value={cardSize}
                  onChange={(e) => setCardSize(e.target.value as any)}
                  className="bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-blue-500/30 rounded-xl px-4 py-2 text-slate-800 dark:text-blue-50 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="compact">Compact</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>

            <div className="glass-effect rounded-2xl p-6 min-h-[600px]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {paginatedBlocks.map((block) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    size={cardSize}
                    onHover={setHoveredBlock}
                    onClick={() => onOpenViewer(block)}
                    formatTimeAgo={(date) => {
                      const timestamp = typeof date === 'string' ? new Date(date) : date;
                      const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
                      if (seconds < 60) return `${seconds}s`;
                      const minutes = Math.floor(seconds / 60);
                      if (minutes < 60) return `${minutes}m`;
                      const hours = Math.floor(minutes / 60);
                      if (hours < 24) return `${hours}h`;
                      const days = Math.floor(hours / 24);
                      if (days < 30) return `${days}d`;
                      const months = Math.floor(days / 30);
                      if (months < 12) return `${months}mo`;
                      const years = Math.floor(months / 12);
                      return `${years}y`;
                    }}
                    categories={categories}
                  />
                ))}
              </div>
              {paginatedBlocks.length === 0 && (
                <div className="text-center py-20 text-slate-500 dark:text-blue-200/60">
                  No blocks found matching your filters
                </div>
              )}
            </div>
          </div>

          <aside className="w-96 space-y-6">
            <PreviewPanel
              block={hoveredBlock || paginatedBlocks[0]}
              onOpenViewer={onOpenViewer}
              categories={categories}
              onSyncCategory={handleSyncCategory}
              syncing={syncing}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

interface BlockCardProps {
  block: Block;
  size: 'compact' | 'medium' | 'large';
  onHover: (block: Block) => void;
  onClick: () => void;
  formatTimeAgo: (date: string | Date) => string;
  categories: BlockCategory[];
}

function BlockCard({ block, size, onHover, onClick, formatTimeAgo, categories }: BlockCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(false);

  const sizeClasses: Record<string, string> = {
    compact: 'w-full h-56',
    medium: 'w-full h-72',
    large: 'w-full h-80',
  };

  // Find the category for this block
  const category = categories.find(c => c.id === block.category_id);
  const categoryColor = category?.color || '#4a9eff';
  const categoryIcon = category?.icon || '📦';

  // Try to load thumbnail when component mounts or block changes
  useEffect(() => {
    if (block.thumbnail_url) {
      setThumbnailUrl(block.thumbnail_url);
    } else if (block.dwg_path && !thumbnailError && !isLoadingThumbnail) {
      // Try to generate/fetch thumbnail
      generateThumbnail();
    }
  }, [block.id, block.thumbnail_url, block.dwg_path]);

  const generateThumbnail = async () => {
    if (!block.dwg_path) return;

    // Check cache first
    const cachedUrl = ThumbnailService.getCachedThumbnailUrl(block.id);
    if (cachedUrl) {
      setThumbnailUrl(cachedUrl);
      return;
    }

    setIsLoadingThumbnail(true);
    try {
      console.log(`🖼️ Generating thumbnail for ${block.name} at ${block.dwg_path}`);

      // Use the thumbnail service to generate a placeholder
      const thumbnailUrl = await ThumbnailService.generateThumbnailFromPath(
        block.dwg_path,
        block.name,
        256
      );

      setThumbnailUrl(thumbnailUrl);

      // Cache the generated thumbnail
      ThumbnailService.cacheThumbnailUrl(block.id, thumbnailUrl);

    } catch (error) {
      console.error(`❌ Failed to generate thumbnail for ${block.name}:`, error);
      setThumbnailError(true);
    } finally {
      setIsLoadingThumbnail(false);
    }
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-2 group overflow-hidden smooth-shadow hover:shadow-2xl`}
      style={{
        backgroundColor: categoryColor,
      }}
      onMouseEnter={() => onHover(block)}
      onClick={onClick}
    >
      <div className="h-full p-5 flex flex-col relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3 py-2 mb-3 inline-block self-start relative z-10 transition-all group-hover:bg-white/20">
          <span className="text-white font-bold text-sm">{block.name}</span>
        </div>

        <div className="flex-1 bg-gradient-to-br from-white/5 to-transparent rounded-xl flex items-center justify-center mb-3 relative z-10 overflow-hidden">
          {thumbnailUrl && !thumbnailError ? (
            <img
              src={thumbnailUrl}
              alt={`${block.name} thumbnail`}
              className="w-full h-full object-cover rounded-lg transition-transform duration-300 group-hover:scale-110"
              onError={() => setThumbnailError(true)}
            />
          ) : isLoadingThumbnail ? (
            <div className="flex flex-col items-center justify-center text-white/60">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/60 mb-2"></div>
              <span className="text-xs">Generating...</span>
            </div>
          ) : (
            <span className="text-7xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">{categoryIcon}</span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs relative z-10">
          <span className="text-white/90 font-medium">
            {block.dwg_path ?
              (block.last_modified ? `updated ${formatTimeAgo(block.last_modified)} ago` : 'No date')
              : '⚠️ Not Synced'
            }
          </span>
        </div>
      </div>
    </div>
  );
}

interface PreviewPanelProps {
  block: Block | null;
  onOpenViewer: (block: Block) => void;
  categories: BlockCategory[];
  onSyncCategory: (categoryId: string) => void;
  syncing: string;
}

function PreviewPanel({ block, onOpenViewer, categories, onSyncCategory, syncing }: PreviewPanelProps) {
  if (!block) return null;

  const category = categories.find(c => c.id === block.category_id);
  const categoryColor = category?.color || '#4a9eff';
  const categoryIcon = category?.icon || '📦';

  const formatTimeAgo = (date: string | Date) => {
    const timestamp = typeof date === 'string' ? new Date(date) : date;
    const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    return `${years}y`;
  };

  return (
    <div className="bg-slate-800/40 backdrop-blur-sm border border-blue-500/30 rounded-2xl p-6 shadow-lg sticky top-6">
      <h3 className="text-lg font-bold text-blue-50 mb-4">Preview • {block.name}</h3>

      <div
        className="h-64 rounded-xl mb-4 flex items-center justify-center"
        style={{ backgroundColor: categoryColor + '20' }}
      >
        <span className="text-8xl">{categoryIcon}</span>
      </div>

      <div className="text-sm text-blue-200/80 mb-4 space-y-2">
        <div>
          <strong>Category:</strong> {category?.name || 'Unknown'}
        </div>
        <div>
          <strong>Path:</strong> {category?.path || 'No path set'}
        </div>
        <div>
          <strong>Status:</strong> {block.dwg_path ?
            (block.last_modified ? `Updated ${formatTimeAgo(block.last_modified)} ago` : 'No date')
            : 'Not Synced ⚠️'
          }
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onOpenViewer(block)}
          className="w-full bg-blue-500/20 border border-blue-500 rounded-xl py-3 text-blue-50 font-bold hover:bg-blue-500/30 transition-colors"
        >
          Open in 3D Viewer
        </button>

        {category && (
          <button
            onClick={() => onSyncCategory(category.id)}
            disabled={syncing === category.id}
            className="w-full bg-green-500/20 border border-green-500 rounded-xl py-2 text-green-50 font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {syncing === category.id ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Folder className="w-4 h-4" />
                Sync Category
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
