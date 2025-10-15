interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="space-y-1 pt-1">
      <div className="flex justify-between text-[9px] sm:text-[10px] 3xl:text-[11px] font-medium text-slate-600 dark:text-blue-200/70">
        <span>Overall Progress</span>
        <span className="font-bold tabular-nums">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 sm:h-2 3xl:h-2.5 overflow-hidden shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 transition-all duration-300 ease-linear shadow-lg relative overflow-hidden"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
