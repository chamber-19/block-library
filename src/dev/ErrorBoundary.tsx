// FILE: src/dev/ErrorBoundary.tsx
import React from "react";

interface ErrorBoundaryProps extends React.PropsWithChildren {
  name?: string;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

type State = { hasError: boolean; error?: Error | unknown; errorInfo?: React.ErrorInfo };

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error | unknown) {
    console.error("🔴 ErrorBoundary caught error:", error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("🔴 ErrorBoundary componentDidCatch:", error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const boundaryName = this.props.name ? ` [${this.props.name}]` : "";
    const error = this.state.error as Error | null;
    const errorMessage = error?.message || String(this.state.error);
    const errorStack = error?.stack || "";
    const componentStack = this.state.errorInfo?.componentStack || "";

    return (
      <div
        style={{
          padding: 20,
          fontFamily: "ui-sans-serif, system-ui",
          backgroundColor: "#fee2e2",
          border: "2px solid #dc2626",
          borderRadius: 8,
          margin: 16,
          color: "#7f1d1d",
        }}
      >
        <h1 style={{ marginBottom: 8, marginTop: 0 }}>💥 Error Boundary Caught Exception{boundaryName}</h1>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Error Message:</h3>
        <pre style={{ whiteSpace: "pre-wrap", backgroundColor: "#fecaca", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 200 }}>
          {errorMessage}
        </pre>
        {errorStack && (
          <>
            <h3 style={{ marginTop: 12, marginBottom: 4 }}>Stack Trace:</h3>
            <pre style={{ whiteSpace: "pre-wrap", backgroundColor: "#fecaca", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 200, fontSize: 12 }}>
              {errorStack}
            </pre>
          </>
        )}
        {componentStack && (
          <>
            <h3 style={{ marginTop: 12, marginBottom: 4 }}>Component Stack:</h3>
            <pre style={{ whiteSpace: "pre-wrap", backgroundColor: "#fecaca", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 200, fontSize: 12 }}>
              {componentStack}
            </pre>
          </>
        )}
        <p style={{ marginTop: 12, marginBottom: 0 }}>📋 Open DevTools → Console for more details.</p>
      </div>
    );
  }
}
