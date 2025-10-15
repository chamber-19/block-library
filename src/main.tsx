// FILE: src/main.tsx
import "./dev/consoleCapture";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { UndoRedoProvider } from './contexts/UndoRedoContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <UndoRedoProvider>
        <App />
      </UndoRedoProvider>
    </ThemeProvider>
  </StrictMode>
);
