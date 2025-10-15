import { useState, useEffect, useRef } from 'react';
import { Search, X, Filter, Clock } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface SearchFilter {
  category?: string;
  dateRange?: 'today' | 'week' | 'month' | 'all';
  pathSet?: boolean;
}

interface EnhancedSearchProps {
  value: string;
  onChange: (value: string) => void;
  onFilterChange?: (filters: SearchFilter) => void;
  suggestions?: string[];
  categories?: string[];
}

export function EnhancedSearch({
  value,
  onChange,
  onFilterChange,
  suggestions = [],
  categories = [],
}: EnhancedSearchProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilter>({});
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (query: string) => {
    onChange(query);
    if (query.trim()) {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
    }
  };

  const handleFilterChange = (key: keyof SearchFilter, value: any) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    onFilterChange?.(updated);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange?.({});
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined).length;

  const filteredSuggestions = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div ref={searchRef} className="relative">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-blue-400 pointer-events-none" />
          <input
            type="text"
            value={value}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search blocks by name, category..."
            className="w-full bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-blue-500/40 rounded-2xl pl-12 pr-12 py-3 text-slate-700 dark:text-blue-50 placeholder-slate-400 dark:placeholder-blue-200/60 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
          {value && (
            <button
              onClick={() => {
                onChange('');
                setShowSuggestions(false);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center text-slate-600 dark:text-blue-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <Tooltip content={showFilters ? 'Hide filters' : 'Show filters'}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-3 rounded-2xl border font-medium transition-all flex items-center gap-2 ${
              showFilters || activeFilterCount > 0
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-slate-900/50 border-slate-300 dark:border-blue-500/40 text-slate-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Filter className="w-5 h-5" />
            {activeFilterCount > 0 && (
              <span className="bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </Tooltip>
      </div>

      {showSuggestions && (value || recentSearches.length > 0) && (
        <div className="absolute top-full left-0 right-12 mt-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-blue-500/30 rounded-2xl shadow-xl z-50 overflow-hidden">
          {value && filteredSuggestions.length > 0 && (
            <div className="p-2">
              <p className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-blue-300 uppercase">Suggestions</p>
              {filteredSuggestions.slice(0, 5).map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => {
                    handleSearch(suggestion);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-blue-100 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {!value && recentSearches.length > 0 && (
            <div className="p-2">
              <p className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-blue-300 uppercase flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Recent Searches
              </p>
              {recentSearches.map((search, i) => (
                <button
                  key={i}
                  onClick={() => {
                    handleSearch(search);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-blue-100 transition-colors"
                >
                  {search}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showFilters && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-300 dark:border-blue-500/30 rounded-2xl shadow-xl z-50 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 dark:text-blue-50">Filters</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-blue-200 mb-2">
                Category
              </label>
              <select
                value={filters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value || undefined)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-blue-500/40 rounded-xl px-3 py-2 text-slate-700 dark:text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-blue-200 mb-2">
                Date Range
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['today', 'week', 'month', 'all'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => handleFilterChange('dateRange', range)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                      filters.dateRange === range
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.pathSet || false}
                  onChange={(e) => handleFilterChange('pathSet', e.target.checked || undefined)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-blue-500/40 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-blue-200">
                  Only blocks with path set
                </span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
