// FILE: src/dev/ErrorBoundary.tsx
import React from "react";

type State = { hasError: boolean; error?: any };
export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, info: any) { console.error("ErrorBoundary", error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
        <h1 style={{ marginBottom: 8 }}>💥 Something exploded</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error)}</pre>
        <p>Open DevTools → Console for stack trace.</p>
      </div>
    );
  }
}
