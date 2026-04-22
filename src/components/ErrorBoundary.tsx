"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback UI — when provided, replaces the default error card. */
  fallback?: React.ReactNode;
  /** Identifier used in console logs to pinpoint which boundary caught the error. */
  name?: string;
  /** Optional scope label rendered inside the default fallback UI. */
  scope?: string;
  /** Optional callback fired when an error is caught — useful for analytics/logging. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const label = this.props.name || this.props.scope || "ErrorBoundary";
    // Until real logging (Sentry / LogRocket) is wired up, surface in console.
    // eslint-disable-next-line no-console
    console.error(`ErrorBoundary [${label}] caught:`, error, errorInfo);
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch {
        // swallow — never let the error hook break the boundary itself.
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      const scopeLabel = this.props.scope ? ` in ${this.props.scope}` : "";
      return (
        <div
          data-testid="error-boundary"
          data-error-boundary="true"
          className="flex items-center justify-center min-h-[400px] p-6"
        >
          <div className="max-w-md space-y-4 text-center">
            <div className="flex justify-center">
              <AlertTriangle
                className="w-10 h-10 text-amber-500"
                aria-hidden="true"
              />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              Something went wrong{scopeLabel}
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Try Again
              </button>
              <button
                onClick={() => (window.location.href = "/")}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
