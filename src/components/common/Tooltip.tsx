import { ReactNode, useState } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ content, children, position = 'top', delay = 300 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div className={`absolute ${positionClasses[position]} z-50 pointer-events-none`}>
          <div className="bg-slate-900 dark:bg-slate-800 text-slate-50 text-xs px-3 py-1.5 rounded-lg shadow-lg border border-slate-700 dark:border-slate-600 whitespace-nowrap">
            {content}
            <div className={`absolute ${
              position === 'top' ? 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 dark:border-t-slate-800' :
              position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 dark:border-b-slate-800' :
              position === 'left' ? 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 dark:border-l-slate-800' :
              'right-full top-1/2 -translate-y-1/2 border-r-slate-900 dark:border-r-slate-800'
            } w-0 h-0 border-4 border-transparent`}></div>
          </div>
        </div>
      )}
    </div>
  );
}
