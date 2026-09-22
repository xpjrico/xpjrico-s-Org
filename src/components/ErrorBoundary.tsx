import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Studia App Error]', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    try {
      window.location.reload();
    } catch {}
  };

  private handleGoHome = () => {
    try {
      // Clear potentially corrupt transient state
      this.setState({ hasError: false, error: null });
      window.location.href = '/';
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#07090e] text-white flex flex-col items-center justify-center p-4 selection:bg-purple-500">
          <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-zinc-900/90 border border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.15)] text-center space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black tracking-tight text-white">
                Something went wrong
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                An unexpected interface issue occurred. Your study notes and data remain safely stored.
              </p>
              {this.state.error && (
                <div className="p-3 rounded-xl bg-zinc-950/80 border border-white/5 text-[11px] font-mono text-zinc-400 text-left overflow-x-auto max-h-24">
                  {this.state.error.message || 'Unknown error'}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer border border-white/10"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
