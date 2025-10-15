import { CheckCircle } from 'lucide-react';
import { useEffect } from 'react';

interface LoadingCardProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  isComplete: boolean;
  index: number;
  blockCount?: number;
}

export function LoadingCard({ label, icon, isActive, isComplete, index, blockCount }: LoadingCardProps) {
  // Trigger subtle pulse animation on completion
  useEffect(() => {
    if (isComplete) {
      const card = document.getElementById(`loading-card-${index}`);
      if (card) {
        card.style.transform = 'scale(1.03)';
        setTimeout(() => {
          card.style.transform = 'scale(1)';
        }, 200);
      }
    }
  }, [isComplete, index]);

  return (
    <div
      id={`loading-card-${index}`}
      className={`flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 rounded-lg transition-all duration-700 ease-out backdrop-blur-md shadow-sm h-[34px] sm:h-[38px] 3xl:h-[42px] ${
        isActive
          ? 'bg-blue-100/90 dark:bg-blue-900/50 border-2 border-blue-500 shadow-xl shadow-blue-500/30'
          : isComplete
          ? 'bg-slate-100/90 dark:bg-slate-800/70 border-2 border-green-500 dark:border-green-600'
          : 'bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-blue-500/20 opacity-50'
      }`}
      style={{ transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      <div
        className={`w-5 h-5 sm:w-6 sm:h-6 3xl:w-7 3xl:h-7 rounded flex items-center justify-center transition-all duration-700 ease-out flex-shrink-0 shadow-sm ${
          isActive
            ? 'bg-blue-600 text-white animate-pulse'
            : isComplete
            ? 'bg-green-500 dark:bg-green-600 text-white'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
        }`}
      >
        {isComplete ? <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 3xl:w-4 3xl:h-4" /> : <div className="scale-75 sm:scale-90 3xl:scale-100">{icon}</div>}
      </div>
      <span
        className={`flex-1 font-semibold text-[10px] sm:text-[11px] 3xl:text-xs transition-all duration-700 ease-out ${
          isActive
            ? 'text-blue-900 dark:text-blue-100'
            : isComplete
            ? 'text-green-700 dark:text-green-400'
            : 'text-slate-500 dark:text-slate-600'
        }`}
      >
        {label}
      </span>
      {isActive && (
        <div className="flex items-center gap-2">
          {blockCount !== undefined && blockCount > 0 ? (
            <span className="text-[9px] sm:text-[10px] 3xl:text-[11px] font-bold text-blue-600 dark:text-blue-400 tabular-nums min-w-[30px] sm:min-w-[40px] text-right">
              {blockCount.toLocaleString()}
            </span>
          ) : (
            <div className="flex gap-0.5 sm:gap-1">
              <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 bg-blue-600 dark:bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
