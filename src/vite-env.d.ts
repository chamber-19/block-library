/// <reference types="vite/client" />

declare global {
  interface Window {
    __logs: Array<{
      ts: string;
      level: "log" | "info" | "warn" | "error" | "debug" | "onerror" | "unhandledrejection";
      args?: unknown[];
      message?: string;
      stack?: string;
    }>;
    __downloadLogs: () => void;
  }
}
