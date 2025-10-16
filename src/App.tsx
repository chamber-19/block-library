// FILE: Projects/Hyphae-Block-Library/src/App.tsx
import { useState, useCallback } from 'react';
import { Dashboard } from './components/dashboard/Dashboard';
import { BlockLibrary } from './components/library/BlockLibrary';
import { GridViewer } from './components/viewers/GridViewer';
import AdvancedViewer from './components/viewers/AdvancedViewer';
import BulkOperations from './components/operations/BulkOperations';
import { SplashScreen } from './components/common/SplashScreen';
import { useTheme } from './contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import { Tooltip } from './components/common/Tooltip';

type View = 'dashboard' | 'library' | 'viewer' | 'advanced-viewer';

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [showBulkOps, setShowBulkOps] = useState(false);
  const { theme, toggleTheme } = useTheme();

  console.log('App rendered - isLoaded:', isLoaded, 'showSplash:', showSplash);

  const handleOpenLibrary = () => setCurrentView('library');
  const handleOpenViewer = (block?: any) => {
    if (block) setSelectedBlock(block);
    setCurrentView('viewer');
  };
  const handleOpenAdvancedViewer = (block?: any) => {
    if (block) setSelectedBlock(block);
    setCurrentView('advanced-viewer');
  };
  const handleBackToDashboard = () => setCurrentView('dashboard');
  const handleOpenBulkOps = () => setShowBulkOps(true);
  const handleCloseBulkOps = () => setShowBulkOps(false);

  const handleSplashComplete = useCallback(() => {
    setIsLoaded(true);
    setTimeout(() => setShowSplash(false), 100);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200 dark:from-black dark:via-gray-950 dark:to-zinc-950 transition-colors duration-300 relative">
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}

      <div className={`transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
        <Tooltip content={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          <button
            onClick={toggleTheme}
            className="fixed top-6 right-6 z-50 w-12 h-12 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-blue-500/40 flex items-center justify-center text-slate-700 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-lg hover:shadow-xl hover:scale-110"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
        </Tooltip>

        {currentView === 'dashboard' && (
          <Dashboard
            onOpenLibrary={handleOpenLibrary}
            onOpenViewer={handleOpenViewer}
            onOpenBulkOps={handleOpenBulkOps}
          />
        )}

        {currentView === 'library' && (
          <BlockLibrary
            onBack={handleBackToDashboard}
            onOpenViewer={handleOpenAdvancedViewer}
            onOpenBulkOps={handleOpenBulkOps}
          />
        )}

        {currentView === 'viewer' && (
          <GridViewer
            onBack={handleBackToDashboard}
            selectedBlock={selectedBlock}
          />
        )}

        {currentView === 'advanced-viewer' && (
          <AdvancedViewer
            blockName={selectedBlock?.name || 'Block'}
            blockData={selectedBlock}
            onClose={handleBackToDashboard}
          />
        )}

        {showBulkOps && <BulkOperations onClose={handleCloseBulkOps} />}
      </div>
    </div>
  );
}

export default App;
