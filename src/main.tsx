// FILE: src/main.tsx  (wrap with ErrorBoundary)
// IMPORTANT: Import console capture FIRST before anything else
import "./dev/consoleCapture";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UndoRedoProvider } from "./contexts/UndoRedoContext";
import { ErrorBoundary } from "./dev/ErrorBoundary";

// Log that the app is starting
console.log("🚀 App starting - main.tsx loaded");
console.log("📋 Console capture active. Call window.__downloadLogs() to download logs.");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <UndoRedoProvider>
          <App />
        </UndoRedoProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
