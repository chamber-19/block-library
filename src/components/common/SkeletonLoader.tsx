export function SkeletonCard() {
  return (
    <div className="bg-slate-800/40 dark:bg-slate-800/40 border border-slate-700/50 dark:border-blue-500/30 rounded-2xl p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-slate-700/50 dark:bg-slate-700/50 rounded-xl"></div>
        <div className="flex-1">
          <div className="h-4 bg-slate-700/50 dark:bg-slate-700/50 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-slate-700/30 dark:bg-slate-700/30 rounded w-1/2"></div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-slate-700/30 dark:bg-slate-700/30 rounded"></div>
        <div className="h-3 bg-slate-700/30 dark:bg-slate-700/30 rounded w-5/6"></div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-slate-800/40 dark:bg-slate-900/30 border border-slate-700/50 dark:border-blue-500/20 rounded-xl p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700/50 dark:bg-slate-700/50 rounded-lg"></div>
            <div className="flex-1">
              <div className="h-3 bg-slate-700/50 dark:bg-slate-700/50 rounded w-3/4 mb-2"></div>
              <div className="h-2 bg-slate-700/30 dark:bg-slate-700/30 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="bg-slate-800/40 dark:bg-slate-800/40 border border-slate-700/50 dark:border-blue-500/30 rounded-2xl p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-slate-700/50 dark:bg-slate-700/50 rounded-2xl"></div>
        <div className="h-6 w-16 bg-slate-700/30 dark:bg-slate-700/30 rounded-xl"></div>
      </div>
      <div className="h-8 bg-slate-700/50 dark:bg-slate-700/50 rounded w-24 mb-2"></div>
      <div className="h-3 bg-slate-700/30 dark:bg-slate-700/30 rounded w-32"></div>
    </div>
  );
}
