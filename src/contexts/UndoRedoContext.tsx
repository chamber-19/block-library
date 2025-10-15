import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface Action {
  type: string;
  data: any;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

interface UndoRedoContextType {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  addAction: (action: Action) => void;
  clear: () => void;
}

const UndoRedoContext = createContext<UndoRedoContextType | undefined>(undefined);

export function UndoRedoProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<Action[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const canUndo = currentIndex >= 0;
  const canRedo = currentIndex < history.length - 1;

  const addAction = useCallback((action: Action) => {
    setHistory(prev => [...prev.slice(0, currentIndex + 1), action]);
    setCurrentIndex(prev => prev + 1);
  }, [currentIndex]);

  const undo = useCallback(async () => {
    if (!canUndo) return;
    const action = history[currentIndex];
    await action.undo();
    setCurrentIndex(prev => prev - 1);
  }, [canUndo, currentIndex, history]);

  const redo = useCallback(async () => {
    if (!canRedo) return;
    const action = history[currentIndex + 1];
    await action.redo();
    setCurrentIndex(prev => prev + 1);
  }, [canRedo, currentIndex, history]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return (
    <UndoRedoContext.Provider value={{ canUndo, canRedo, undo, redo, addAction, clear }}>
      {children}
    </UndoRedoContext.Provider>
  );
}

export function useUndoRedo() {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error('useUndoRedo must be used within UndoRedoProvider');
  }
  return context;
}
