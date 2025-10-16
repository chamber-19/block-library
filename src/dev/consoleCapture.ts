// ==============================
// FILE: src/dev/consoleCapture.ts
// Why: capture Console + runtime errors and allow download as a file.
// ==============================
type LogLevel = "log" | "info" | "warn" | "error" | "debug";
type LogEntry = {
  ts: string;
  level: LogLevel | "onerror" | "unhandledrejection";
  args?: unknown[];
  message?: string;
  stack?: string;
};

declare global {
  interface Window {
    __logs: LogEntry[];
    __downloadLogs: () => void;
  }
}

(function setupConsoleCapture() {
  const logs: LogEntry[] = [];
  const orig: Record<LogLevel, (...args: unknown[]) => void> = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const stamp = () => new Date().toISOString();

  (["log", "info", "warn", "error", "debug"] as LogLevel[]).forEach((level) => {
    // Only wrap once.
    const consoleObj = console as unknown as Record<string, unknown>;
    if (consoleObj[`__wrapped_${level}`]) return;
    const base = orig[level];
    consoleObj[`__wrapped_${level}`] = true;

    (console[level] as (...args: unknown[]) => void) = (...args: unknown[]) => {
      try {
        logs.push({ ts: stamp(), level, args });
      } catch (e) {
        // Silently ignore errors during logging
        void e;
      }
      base(...args);
    };
  });

  window.addEventListener("error", (e) => {
    logs.push({
      ts: stamp(),
      level: "onerror",
      message: e.message,
      stack: e.error?.stack ?? String(e.error ?? ""),
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    logs.push({
      ts: stamp(),
      level: "unhandledrejection",
      message: typeof reason === "string" ? reason : reason?.message ?? String(reason),
      stack: reason?.stack ?? "",
    });
  });

  window.__logs = logs;
  window.__downloadLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `browser-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Optional: visual hint in dev
  console.info("[consoleCapture] installed. Call window.__downloadLogs() to save logs.");
})();

export {};
