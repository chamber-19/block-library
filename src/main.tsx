// FILE: src/main.tsx  (wrap with ErrorBoundary)
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UndoRedoProvider } from "./contexts/UndoRedoContext";
import { ErrorBoundary } from "./dev/ErrorBoundary";
import "./dev/consoleCapture";

// Log that the app is starting
console.log("🚀 App starting - main.tsx loaded");

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
