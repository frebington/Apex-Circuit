import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let msg = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(msg) as { error?: string; operationType?: string };
      if (parsed && parsed.error) {
        msg = `Database ${parsed.operationType || 'request'} failed: ${parsed.error}`;
      }
    } catch {
      // Keep original message
    }
    return { hasError: true, message: msg };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Uncaught application error:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-6 text-center">
          <div className="max-w-md rounded-xl border border-white/15 bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-white">
              Something Went Wrong
            </h2>
            <p className="text-xs text-slate-300 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold px-4 py-2 text-sm"
            >
              Reload Game
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
