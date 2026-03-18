import { Component, type ReactNode, type ErrorInfo } from "react";
import { log } from "../lib/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("React error boundary caught error", {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-gray-500 text-sm">
              The app encountered an unexpected error. This may be caused by
              browser privacy settings blocking required features.
            </p>
            {this.state.error && (
              <details className="text-left text-xs bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                <summary className="cursor-pointer font-medium">Error details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-red-600 dark:text-red-400">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Reload page
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
              >
                Go to home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
