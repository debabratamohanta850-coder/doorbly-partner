import React from 'react';
import { DoorblyLogoIcon } from '../../constants/branding';
import { Database } from 'lucide-react';

interface ProcessingLoaderProps {
  variant?: 'fullscreen' | 'panel' | 'bar';
  label?: string;
  subLabel?: string;
  theme?: 'light' | 'dark';
  className?: string;
}

export const ProcessingLoader: React.FC<ProcessingLoaderProps> = ({
  variant = 'panel',
  label = 'Processing data from Supabase...',
  subLabel,
  theme = 'light',
  className = ''
}) => {
  if (variant === 'bar') {
    return (
      <div
        role="progressbar"
        aria-label={label}
        aria-busy="true"
        className={`w-full h-1 overflow-hidden ${
          theme === 'dark' ? 'bg-slate-800/80' : 'bg-teal-950/20'
        } ${className}`}
      >
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-teal-400 via-emerald-300 to-teal-500 animate-progress-sweep" />
      </div>
    );
  }

  if (variant === 'fullscreen') {
    return (
      <div
        role="status"
        aria-busy="true"
        className={`min-h-[100dvh] bg-gradient-to-br from-slate-950 via-[#072b28] to-slate-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden ${className}`}
      >
        {/* Subtle atmospheric radial glow */}
        <div className="pointer-events-none absolute w-72 h-72 rounded-full bg-[#0F766E]/25 blur-3xl animate-pulse" />

        {/* Dual counter-rotating orbital processing emblem */}
        <div className="relative w-28 h-28 flex items-center justify-center mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-teal-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-teal-400 border-r-emerald-300 animate-orbit-spin" />
          <div className="absolute inset-2.5 rounded-full border-2 border-transparent border-b-amber-300/90 border-l-teal-300 animate-orbit-reverse" />
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center p-1.5 border border-white/80 shadow-xl relative z-10">
            <DoorblyLogoIcon className="w-full h-full rounded-xl" />
          </div>
        </div>

        <h1 className="text-xl tracking-tight text-white">DOORBLY PARTNER</h1>
        <p className="text-xs text-teal-200 mt-1.5 text-center max-w-xs">{label}</p>
        {subLabel && (
          <p className="text-[11px] text-slate-400 mt-1 text-center max-w-xs">{subLabel}</p>
        )}

        {/* Indeterminate progress sweep track */}
        <div className="w-56 max-w-full mt-5 space-y-2.5">
          <div className="h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden border border-slate-700/60">
            <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-teal-400 via-emerald-300 to-teal-400 animate-progress-sweep" />
          </div>

          <div className="flex items-center justify-center gap-1.5 pt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  // Panel / inline data loading state
  const isDark = theme === 'dark';

  return (
    <div
      role="status"
      aria-busy="true"
      className={`rounded-2xl p-6 border space-y-5 ${
        isDark
          ? 'bg-slate-900/70 border-slate-800 text-slate-200'
          : 'bg-white border-slate-200 text-slate-700 shadow-xs'
      } ${className}`}
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative w-14 h-14 flex items-center justify-center mb-3">
          <div
            className={`absolute inset-0 rounded-full border-2 ${
              isDark ? 'border-slate-700' : 'border-slate-200'
            }`}
          />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#0F766E] border-r-emerald-400 animate-orbit-spin" />
          <div className="absolute inset-1.5 rounded-full border-2 border-transparent border-b-teal-400/80 animate-orbit-reverse" />
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isDark ? 'bg-slate-800 text-teal-400' : 'bg-teal-50 text-[#0F766E]'
            }`}
          >
            <Database className="w-4 h-4" />
          </div>
        </div>

        <p className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{label}</p>
        {subLabel && (
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {subLabel}
          </p>
        )}

        <div
          className={`w-44 h-1 rounded-full overflow-hidden mt-3 ${
            isDark ? 'bg-slate-800' : 'bg-slate-100'
          }`}
        >
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-[#0F766E] via-emerald-400 to-teal-500 animate-progress-sweep" />
        </div>
      </div>

      {/* Shimmer placeholder rows */}
      <div className="space-y-2.5 pt-1">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className={`h-11 rounded-xl ${
              isDark ? 'animate-processing-shimmer-dark' : 'animate-processing-shimmer'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
