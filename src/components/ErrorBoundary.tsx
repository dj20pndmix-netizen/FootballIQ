import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onResetHome?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('FootballIQ UI ErrorBoundary caught:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto my-12 p-6 sm:p-8 rounded-2xl bg-slate-900 border border-rose-800/60 text-center space-y-4">
          <div className="w-11 h-11 rounded-xl bg-rose-950 border border-rose-800 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">
              {this.props.fallbackTitle || 'Section temporarily unavailable'}
            </h2>
            <p className="text-xs text-slate-400 font-mono break-words">
              {this.state.errorMessage}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry View</span>
            </button>
            {this.props.onResetHome && (
              <button
                onClick={() => {
                  this.handleReset();
                  this.props.onResetHome?.();
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Predictions Home</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
