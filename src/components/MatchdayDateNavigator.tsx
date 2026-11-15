import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Sparkles, RefreshCw, Zap } from 'lucide-react';
import { AutomatedMatchdayState } from '../services/matchdayService';

interface MatchdayDateNavigatorProps {
  matchdayState: AutomatedMatchdayState;
  onChangeDate: (newDateStr: string) => void;
  onSimulateMidnightRollover: () => void;
  isLoading?: boolean;
}

export const MatchdayDateNavigator: React.FC<MatchdayDateNavigatorProps> = ({
  matchdayState,
  onChangeDate,
  onSimulateMidnightRollover,
  isLoading = false,
}) => {
  const {
    activeDateStr,
    activeDateLabel,
    isToday,
    countdownToMidnight,
    todayFixturesCount,
    upcomingCount,
    liveCount,
    settledCount,
    timezone,
  } = matchdayState;

  const handlePrevDay = () => {
    const [y, m, d] = activeDateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
    onChangeDate(date.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const [y, m, d] = activeDateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
    onChangeDate(date.toISOString().slice(0, 10));
  };

  const handleGoToday = () => {
    const now = new Date();
    // Default en-CA format gives YYYY-MM-DD
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    onChangeDate(today);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 border border-slate-800 p-4 shadow-lg shadow-black/20 space-y-3">
      {/* Top Row: Date title, automated tag, and countdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {activeDateLabel}
              </h2>
              {isToday ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Playing Strictly Today
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-mono">
                  Custom Matchday Date
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Timezone: <strong className="text-slate-300 font-mono">{timezone}</strong></span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-medium">Automatic Midnight Rollover Enabled</span>
            </p>
          </div>
        </div>

        {/* Midnight Rollover Countdown Indicator */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2 font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Midnight in Kampala:</span>
            <span className="text-amber-300 font-bold">{countdownToMidnight}</span>
          </div>

          <button
            onClick={onSimulateMidnightRollover}
            title="Simulate midnight date change to test automatic rollover and prediction generation"
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Rollover</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Date Navigation & Strict Today Matches Counts */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Navigation Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrevDay}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium flex items-center gap-1 transition-colors"
            title="View previous day's fixtures"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous Day</span>
          </button>

          <button
            onClick={handleGoToday}
            disabled={isToday || isLoading}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isToday
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950 cursor-default'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800'
            }`}
            title="Strictly today's match slate in Kampala"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
            <span>Today (Strictly Today)</span>
          </button>

          <button
            onClick={handleNextDay}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium flex items-center gap-1 transition-colors"
            title="View next day's fixtures"
          >
            <span>Next Day</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {isLoading && (
            <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin ml-2" />
          )}
        </div>

        {/* Live Match Slate Tally */}
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Strictly Today: <strong className="text-white">{todayFixturesCount}</strong></span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Upcoming: <strong className="text-emerald-300">{upcomingCount}</strong></span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Live: <strong className="text-amber-300">{liveCount}</strong></span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span>Settled: <strong className="text-slate-300">{settledCount}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
