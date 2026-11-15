import React from 'react';
import { 
  Fixture, 
  HtFtOutcome 
} from '../types/football';
import { formatFixtureTime } from '../utils/timezone';
import { TeamBadge } from './TeamBadge';
import { 
  Activity, 
  ChevronRight, 
  Sparkles, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle,
  HelpCircle,
  Video,
  MessageSquare
} from 'lucide-react';

interface FixtureCardProps {
  fixture: Fixture;
  activeMarket: '1X2' | 'BTTS' | 'OVER_UNDER_25' | 'HT_FT' | 'DOUBLE_CHANCE' | '1X2_INTERVAL_10';
  selectedTimezone: string;
  oddsFormat: 'PROBABILITY' | 'DECIMAL';
  onSelectFixture: (f: Fixture) => void;
  onOpenScout: (f: Fixture) => void;
  onOpenVeo: (f: Fixture) => void;
  onOpenChat?: (f: Fixture) => void;
  onSelectMarket?: (m: '1X2' | 'BTTS' | 'OVER_UNDER_25' | 'HT_FT' | 'DOUBLE_CHANCE' | '1X2_INTERVAL_10') => void;
}

export const FixtureCard: React.FC<FixtureCardProps> = ({
  fixture,
  activeMarket,
  selectedTimezone,
  oddsFormat,
  onSelectFixture,
  onOpenScout,
  onOpenVeo,
  onOpenChat,
  onSelectMarket,
}) => {
  const { homeTeam, awayTeam, competition, status, scores, prediction } = fixture;

  // Active market settlement resolution strictly evaluated against the market being viewed
  const activeMarketSettlement = React.useMemo(() => {
    if (!prediction?.settlement) return null;
    const s = prediction.settlement;
    const sm = (s as any).settledMarkets || (s as any).markets || {};

    let status: 'WON' | 'LOST' | 'VOID' = 'LOST';
    let marketLabel = '1X2';
    let pickLabel = prediction.market1X2.predictedOutcome;

    switch (activeMarket) {
      case 'BTTS': {
        marketLabel = 'BTTS';
        pickLabel = prediction.marketBTTS.predictedOutcome;
        const actualBTTS = scores.currentHome > 0 && scores.currentAway > 0 ? 'YES' : 'NO';
        status = sm.marketBTTS || (pickLabel === actualBTTS ? 'WON' : 'LOST');
        break;
      }
      case 'OVER_UNDER_25': {
        marketLabel = 'O/U 2.5';
        pickLabel = prediction.marketOverUnder25.predictedOutcome;
        const actualOU = (scores.currentHome + scores.currentAway) >= 3 ? 'OVER' : 'UNDER';
        status = sm.marketOverUnder25 || (pickLabel === actualOU ? 'WON' : 'LOST');
        break;
      }
      case 'DOUBLE_CHANCE': {
        marketLabel = 'Double Chance';
        pickLabel = prediction.marketDoubleChance.predictedOutcome;
        const actual1X2 = scores.currentHome > scores.currentAway ? '1' : scores.currentHome === scores.currentAway ? 'X' : '2';
        const actualDC = actual1X2 === '1' ? ['1X', '12'] : actual1X2 === 'X' ? ['1X', 'X2'] : ['X2', '12'];
        status = sm.marketDoubleChance || (actualDC.includes(pickLabel) ? 'WON' : 'LOST');
        break;
      }
      case 'HT_FT': {
        marketLabel = 'HT/FT';
        pickLabel = prediction.marketHtFt.predictedOutcome;
        status = sm.marketHtFt || 'VOID';
        break;
      }
      case '1X2_INTERVAL_10': {
        marketLabel = '10m Interval';
        pickLabel = prediction.market1X2Interval10?.predictedOutcome || 'X';
        status = sm.market1X2Interval10 || (pickLabel === 'X' ? 'WON' : 'LOST');
        break;
      }
      case '1X2':
      default: {
        marketLabel = '1X2';
        pickLabel = prediction.market1X2.predictedOutcome;
        const actual1X2 = scores.currentHome > scores.currentAway ? '1' : scores.currentHome === scores.currentAway ? 'X' : '2';
        status = sm.market1X2 || (pickLabel === actual1X2 ? 'WON' : 'LOST');
        break;
      }
    }

    return { status, marketLabel, pickLabel };
  }, [prediction, activeMarket, scores]);

  const formatProb = (p: number) => {
    if (oddsFormat === 'DECIMAL') {
      if (p <= 0.01) return '99.0';
      return (1 / p).toFixed(2);
    }
    return `${Math.round(p * 100)}%`;
  };

  const getStatusText = () => {
    switch (status) {
      case 'LIVE':
        return (
          <span className="text-rose-400 font-bold font-mono tabular-nums flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE {scores.minute}'
          </span>
        );
      case 'HT':
        return <span className="text-amber-400 font-bold font-mono">HT</span>;
      case 'FT':
        return <span className="text-slate-300 font-semibold font-mono">FT</span>;
      case 'POSTP':
        return <span className="text-amber-400 font-bold font-mono">POSTPONED</span>;
      case 'CANC':
        return <span className="text-rose-400 font-bold font-mono">CANCELLED</span>;
      default:
        return (
          <span className="text-slate-300 font-mono tabular-nums">
            {formatFixtureTime(fixture.kickoffTimeUtc, selectedTimezone, true)}
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 hover:bg-slate-900/95 border border-slate-800 hover:border-emerald-600/50 rounded-2xl p-5 transition-colors duration-150 group flex flex-col justify-between">
      {/* Top Unboxed Metadata Line */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 min-w-0 truncate">
          <span className="font-semibold text-slate-200 truncate">{competition.name}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{competition.country}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[11px]">
          {getStatusText()}
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className={prediction?.dataQuality === 'VALID' ? 'text-emerald-400' : 'text-amber-400'}>
            {prediction?.dataQuality === 'VALID' ? 'Verified' : prediction?.dataQuality || 'Pending'}
          </span>
        </div>
      </div>

      {/* Teams and Score Section */}
      <div className="py-4 grid grid-cols-12 items-center gap-2">
        {/* Home Team */}
        <div className="col-span-5 flex items-center gap-3">
          <TeamBadge team={homeTeam} size="md" />
          <div className="min-w-0">
            <h4 className="font-bold text-slate-100 text-sm sm:text-base truncate group-hover:text-emerald-300 transition-colors">
              {homeTeam.name}
            </h4>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
              <span>Form:</span>
              <div className="flex gap-0.5">
                {homeTeam.formLast5.map((res, i) => (
                  <span
                    key={i}
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center font-bold text-[8px] ${
                      res === 'W' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      res === 'D' ? 'bg-slate-800 text-slate-300' :
                      'bg-rose-950 text-rose-400 border border-rose-900'
                    }`}
                  >
                    {res}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Score or VS */}
        <div className="col-span-2 text-center">
          {status === 'LIVE' || status === 'HT' || status === 'FT' ? (
            <div className="inline-block bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-xl">
              <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
                {scores.currentHome} - {scores.currentAway}
              </span>
            </div>
          ) : (
            <div className="text-xs font-mono font-bold text-slate-500 uppercase">
              VS
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="col-span-5 flex items-center justify-end gap-3 text-right">
          <div className="min-w-0">
            <h4 className="font-bold text-slate-100 text-sm sm:text-base truncate group-hover:text-emerald-300 transition-colors">
              {awayTeam.name}
            </h4>
            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 mt-0.5">
              <span>Form:</span>
              <div className="flex gap-0.5">
                {awayTeam.formLast5.map((res, i) => (
                  <span
                    key={i}
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center font-bold text-[8px] ${
                      res === 'W' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      res === 'D' ? 'bg-slate-800 text-slate-300' :
                      'bg-rose-950 text-rose-400 border border-rose-900'
                    }`}
                  >
                    {res}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <TeamBadge team={awayTeam} size="md" />
        </div>
      </div>

      {/* Prediction Market Probability Bars */}
      {prediction && !prediction.isAbstained ? (
        <div className="mt-2 pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Market:{' '}
              <span className={`font-semibold ${activeMarket === '1X2_INTERVAL_10' ? 'text-amber-400' : 'text-slate-200'}`}>
                {activeMarket === '1X2_INTERVAL_10' ? '1X2 - Interval 10 Min (00:01-09:59)' : activeMarket}
              </span>
            </span>

            {/* Quick in-card toggle to 10-Minute Interval */}
            {onSelectMarket && (
              <button
                onClick={() => onSelectMarket(activeMarket === '1X2_INTERVAL_10' ? '1X2' : '1X2_INTERVAL_10')}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors border ${
                  activeMarket === '1X2_INTERVAL_10'
                    ? 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                    : 'bg-amber-950/60 text-amber-300 border-amber-800 hover:bg-amber-900'
                }`}
                title="Switch between Full-Time 1X2 and 10-Minute Interval"
              >
                {activeMarket === '1X2_INTERVAL_10' ? '↩ Full Time' : '⚡ 10m Interval'}
              </button>
            )}
          </div>

          {/* Market-specific views */}
          {activeMarket === '1X2' && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {/* Home */}
              <div className={`p-2 rounded-xl border ${
                prediction.market1X2.predictedOutcome === '1' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">1 (Home)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.market1X2.homeWin)}
                </div>
                {prediction.market1X2.predictedOutcome === '1' && (
                  <div className="text-[9px] uppercase font-bold text-emerald-400 mt-0.5">Pick</div>
                )}
              </div>

              {/* Draw */}
              <div className={`p-2 rounded-xl border ${
                prediction.market1X2.predictedOutcome === 'X' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">X (Draw)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.market1X2.draw)}
                </div>
                {prediction.market1X2.predictedOutcome === 'X' && (
                  <div className="text-[9px] uppercase font-bold text-emerald-400 mt-0.5">Pick</div>
                )}
              </div>

              {/* Away */}
              <div className={`p-2 rounded-xl border ${
                prediction.market1X2.predictedOutcome === '2' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">2 (Away)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.market1X2.awayWin)}
                </div>
                {prediction.market1X2.predictedOutcome === '2' && (
                  <div className="text-[9px] uppercase font-bold text-emerald-400 mt-0.5">Pick</div>
                )}
              </div>
            </div>
          )}

          {activeMarket === 'BTTS' && (
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className={`p-2 rounded-xl border ${
                prediction.marketBTTS.predictedOutcome === 'YES' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">Both Teams To Score: YES</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.marketBTTS.yes)}
                </div>
              </div>

              <div className={`p-2 rounded-xl border ${
                prediction.marketBTTS.predictedOutcome === 'NO' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">Both Teams To Score: NO</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.marketBTTS.no)}
                </div>
              </div>
            </div>
          )}

          {activeMarket === 'OVER_UNDER_25' && (
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className={`p-2 rounded-xl border ${
                prediction.marketOverUnder25.predictedOutcome === 'OVER' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">Over 2.5 Goals (3+ goals)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.marketOverUnder25.over)}
                </div>
              </div>

              <div className={`p-2 rounded-xl border ${
                prediction.marketOverUnder25.predictedOutcome === 'UNDER' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">Under 2.5 Goals (0-2 goals)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.marketOverUnder25.under)}
                </div>
              </div>
            </div>
          )}

          {activeMarket === 'DOUBLE_CHANCE' && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className={`p-2 rounded-xl border ${
                prediction.marketDoubleChance.predictedOutcome === '1X' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">1X (Home or Draw)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.marketDoubleChance['1X'])}
                </div>
              </div>

              <div className={`p-2 rounded-xl border ${
                prediction.marketDoubleChance.predictedOutcome === '12' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">12 (Any Win)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.marketDoubleChance['12'])}
                </div>
              </div>

              <div className={`p-2 rounded-xl border ${
                prediction.marketDoubleChance.predictedOutcome === 'X2' 
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300' 
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="text-[10px] text-slate-400 font-semibold">X2 (Draw or Away)</div>
                <div className="font-extrabold text-sm sm:text-base mt-0.5">
                  {formatProb(prediction.marketDoubleChance['X2'])}
                </div>
              </div>
            </div>
          )}

          {activeMarket === 'HT_FT' && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400">Most Likely HT/FT Combination:</span>
                <div className="font-bold text-sm text-emerald-300 mt-0.5">
                  {prediction.marketHtFt.predictedOutcome} ({
                    prediction.marketHtFt.predictedOutcome === 'HH' ? 'Home/Home' :
                    prediction.marketHtFt.predictedOutcome === 'DH' ? 'Draw/Home' :
                    prediction.marketHtFt.predictedOutcome === 'DD' ? 'Draw/Draw' :
                    prediction.marketHtFt.predictedOutcome === 'DA' ? 'Draw/Away' :
                    prediction.marketHtFt.predictedOutcome === 'AA' ? 'Away/Away' :
                    prediction.marketHtFt.predictedOutcome
                  })
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400">Joint Probability:</span>
                <div className="font-black text-sm text-slate-100">
                  {formatProb(prediction.marketHtFt.probabilities[prediction.marketHtFt.predictedOutcome])}
                </div>
              </div>
            </div>
          )}

          {activeMarket === '1X2_INTERVAL_10' && prediction.market1X2Interval10 && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {/* 1: Home Leads 00:01-09:59 */}
                <div className={`p-2 rounded-xl border ${
                  prediction.market1X2Interval10.predictedOutcome === '1'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}>
                  <div className="text-[10px] text-slate-400 font-semibold">1 (Home Leads)</div>
                  <div className="font-extrabold text-sm sm:text-base mt-0.5">
                    {formatProb(prediction.market1X2Interval10.homeWin)}
                  </div>
                  {prediction.market1X2Interval10.predictedOutcome === '1' && (
                    <div className="text-[9px] uppercase font-bold text-emerald-400 mt-0.5">Pick</div>
                  )}
                </div>

                {/* X: Draw at 09:59 */}
                <div className={`p-2 rounded-xl border ${
                  prediction.market1X2Interval10.predictedOutcome === 'X'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}>
                  <div className="text-[10px] text-slate-400 font-semibold">X (Tied / Draw)</div>
                  <div className="font-extrabold text-sm sm:text-base mt-0.5">
                    {formatProb(prediction.market1X2Interval10.draw)}
                  </div>
                  {prediction.market1X2Interval10.predictedOutcome === 'X' && (
                    <div className="text-[9px] uppercase font-bold text-emerald-400 mt-0.5">Pick</div>
                  )}
                </div>

                {/* 2: Away Leads 00:01-09:59 */}
                <div className={`p-2 rounded-xl border ${
                  prediction.market1X2Interval10.predictedOutcome === '2'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}>
                  <div className="text-[10px] text-slate-400 font-semibold">2 (Away Leads)</div>
                  <div className="font-extrabold text-sm sm:text-base mt-0.5">
                    {formatProb(prediction.market1X2Interval10.awayWin)}
                  </div>
                  {prediction.market1X2Interval10.predictedOutcome === '2' && (
                    <div className="text-[9px] uppercase font-bold text-emerald-400 mt-0.5">Pick</div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-850 text-slate-400">
                <span>Early Goal Chance (00:01-09:59):</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {formatProb(prediction.market1X2Interval10.earlyGoalProbability)}
                </span>
              </div>
            </div>
          )}

          {/* Settlement result badge strictly resolved against activeMarket */}
          {prediction.settlement && activeMarketSettlement && (
            <div className="mt-2.5 flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400">Verified Result:</span>
              <span className="font-mono text-slate-200">{prediction.settlement.actualScore}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-mono">
                  {activeMarketSettlement.marketLabel} ({activeMarketSettlement.pickLabel}):
                </span>
                <span className={`flex items-center gap-1 font-bold text-[11px] ${
                  activeMarketSettlement.status === 'WON'
                    ? 'text-emerald-400'
                    : activeMarketSettlement.status === 'LOST'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}>
                  {activeMarketSettlement.status === 'WON' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : activeMarketSettlement.status === 'LOST' ? (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  {activeMarketSettlement.status}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-900/50 text-xs text-amber-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Model abstains: {prediction?.qualityReason || 'Insufficient data coverage.'}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <button
          onClick={() => onSelectFixture(fixture)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold whitespace-nowrap transition-colors"
        >
          <span>Score Matrix &amp; Details</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onOpenScout(fixture)}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-teal-300 text-xs font-medium whitespace-nowrap transition-colors"
          title="Search Grounded Scout Report"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Scout</span>
        </button>

        {onOpenChat && (
          <button
            onClick={() => onOpenChat(fixture)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-300 text-xs font-medium whitespace-nowrap transition-colors"
            title="Ask Gemini 4 Analyst Chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ask AI</span>
          </button>
        )}

        <button
          onClick={() => onOpenVeo(fixture)}
          className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-purple-300 text-xs font-medium transition-colors"
          title="Veo 3.1 Cinematic Preview"
        >
          <Video className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
