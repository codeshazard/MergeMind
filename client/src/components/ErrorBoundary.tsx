import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, History, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
          <div className="p-6 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertOctagon className="w-5 h-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">
              {this.props.fallbackTitle || 'Inspection View Encountered an Error'}
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
              This analysis record may be malformed or contain incompatible data structures.
            </p>
            {this.state.error?.message && (
              <pre className="p-3 rounded bg-zinc-950/80 border border-zinc-800 text-left font-mono text-xs text-rose-300 overflow-x-auto max-h-36">
                {this.state.error.message}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors focus-ring"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Try Again</span>
            </button>
            <Link
              to="/history"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold transition-colors focus-ring"
            >
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back to History</span>
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
