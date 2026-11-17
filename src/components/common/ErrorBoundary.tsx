import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected application error occurred.'
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Doorbly Partner ErrorBoundary caught:', error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleClearCacheAndReload = (): void => {
    try {
      const keysToClear = [
        'doorbly_partner_local_store_v1',
        'doorbly_offer_of_the_day_v1',
        'doorbly_sub_plans_cache_v1',
        'doorbly_sub_tax_cache_v1'
      ];
      keysToClear.forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore storage errors
    }
    window.location.reload();
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[100dvh] bg-slate-100 flex items-center justify-center p-4 text-slate-900">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-5 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-lg font-extrabold text-slate-900">
              Doorbly Partner Recovery
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              Something unexpected interrupted this view. Reloading will restore your live session safely.
            </p>
            {this.state.errorMessage && (
              <p className="text-[11px] font-mono text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 py-3 px-4 rounded-2xl bg-[#0F766E] hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload App</span>
            </button>
            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Cache &amp; Reload</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
