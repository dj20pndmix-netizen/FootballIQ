import React, { useState, useEffect } from 'react';
import { 
  Fixture, 
  HtFtOutcome, 
  TacticalScoutReport 
} from '../types/football';
import { formatFixtureTime } from '../utils/timezone';
import { TeamBadge } from './TeamBadge';
import { 
  X, 
  Activity, 
  Sparkles, 
  TrendingUp, 
  Grid, 
  ShieldCheck, 
  BarChart2, 
  ExternalLink, 
  Video,
  Clock,
  MapPin,
  CheckCircle2,
  MessageSquare
} from 'lucide-react';

interface MatchDetailModalProps {
  fixture: Fixture | null;
  onClose: () => void;
  selectedTimezone: string;
  oddsFormat: 'PROBABILITY' | 'DECIMAL';
  onLaunchVeo: (fixture: Fixture) => void;
  onOpenChat?: (fixture: Fixture) => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  fixture,
  onClose,
  selectedTimezone,
  oddsFormat,
  onLaunchVeo,
  onOpenChat,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'markets' | 'scout' | 'h2h'>('matrix');
  const [isScoutLoading, setIsScoutLoading] = useState(false);
  const [scoutReport, setScoutReport] = useState<TacticalScoutReport | null>(null);
  const [scoutError, setScoutError] = useState<string | null>(null);

  // Reset cached modal state whenever opening or switching to a different fixture
  useEffect(() => {
    setActiveTab('matrix');
    setScoutReport(null);
    setScoutError(null);
    setIsScoutLoading(false);
  }, [fixture?.id]);

  // Allow Escape key to dismiss modal accessibly
  useEffect(() => {
    if (!fixture) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fixture, onClose]);

  if (!fixture) return null;

  const { homeTeam, awayTeam, competition, status, scores, prediction } = fixture;

  const formatProb = (p: number) => {
    if (oddsFormat === 'DECIMAL') {
      if (p <= 0.01) return '99.0';
      return (1 / p).toFixed(2);
    }
    return `${(p * 100).toFixed(1)}%`;
  };

  const handleFetchScout = async () => {
    try {
      setIsScoutLoading(true);
      setScoutError(null);
      const res = await fetch('/api/gemini/grounded-scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: homeTeam.name,
          awayTeam: awayTeam.name,
          competition: competition.name,
          venue: fixture.venue,
          kickoffTimeUtc: fixture.kickoffTimeUtc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to retrieve scout data');
      }

      setScoutReport(data.data);
    } catch (err: any) {
      setScoutError(err.message || 'Error executing search grounding');
    } finally {
      setIsScoutLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-detail-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-emerald-400">{competition.name}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-500" />
                {fixture.venue}
              </span>
            </div>
            <h3 id="match-detail-modal-title" className="text-lg sm:text-xl font-extrabold text-slate-100 mt-1">
              {homeTeam.name} vs {awayTeam.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close match details"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Match Overview Bar */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800/80 grid grid-cols-12 items-center gap-4">
          <div className="col-span-5 flex items-center gap-3">
            <TeamBadge team={homeTeam} size="lg" />
            <div>
              <h4 className="font-bold text-slate-100 text-base">{homeTeam.name}</h4>
              <p className="text-xs text-slate-400">Attack: {homeTeam.attackRating} | Def: {homeTeam.defenseRating}</p>
            </div>
          </div>

          <div className="col-span-2 text-center">
            {status === 'LIVE' || status === 'FT' ? (
              <div className="text-2xl font-black font-mono text-emerald-400">
                {scores.currentHome} - {scores.currentAway}
              </div>
            ) : (
              <div className="text-xs font-mono text-slate-400">
                {formatFixtureTime(fixture.kickoffTimeUtc, selectedTimezone, true)}
              </div>
            )}
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 inline-block mt-1">
              {status}
            </span>
          </div>

          <div className="col-span-5 flex items-center justify-end gap-3 text-right">
            <div>
              <h4 className="font-bold text-slate-100 text-base">{awayTeam.name}</h4>
              <p className="text-xs text-slate-400">Attack: {awayTeam.attackRating} | Def: {awayTeam.defenseRating}</p>
            </div>
            <TeamBadge team={awayTeam} size="lg" />
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex px-6 border-b border-slate-800 bg-slate-900/60 overflow-x-auto gap-2 py-2">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'matrix' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Scoreline Matrix Heatmap</span>
          </button>

          <button
            onClick={() => setActiveTab('markets')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'markets' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>All 6 Markets Breakdown</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('scout');
              if (!scoutReport && !isScoutLoading) handleFetchScout();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'scout' ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>AI Search Scout Intel</span>
          </button>

          <button
            onClick={() => setActiveTab('h2h')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'h2h' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Team Form & xG Radar</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: 7x7 SCORELINE PROBABILITY MATRIX */}
          {activeTab === 'matrix' && prediction && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">
                    Dixon-Coles 7×7 Exact Scoreline Probability Matrix
                  </h4>
                  <p className="text-xs text-slate-400">
                    Joint distribution computed using Home λ = <span className="text-emerald-400 font-mono">{prediction.poisson.homeLambda}</span>, 
                    Away λ = <span className="text-emerald-400 font-mono">{prediction.poisson.awayLambda}</span> with low-score correlation adjustment.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <span className="text-slate-400">Most Likely Score:</span>{' '}
                  <span className="font-mono font-bold text-emerald-400">
                    {prediction.poisson.mostLikelyScore.home} - {prediction.poisson.mostLikelyScore.away}
                  </span>{' '}
                  <span className="text-slate-500">({formatProb(prediction.poisson.mostLikelyScore.probability)})</span>
                </div>
              </div>

              {/* Matrix Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950 p-3">
                <table className="w-full text-center border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="p-2 text-slate-500 font-normal text-[10px]">Home \ Away</th>
                      {[0, 1, 2, 3, 4, 5, 6].map((a) => (
                        <th key={a} className="p-2 font-bold text-slate-300 font-mono">{a} goals</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prediction.poisson.scoreMatrix.map((row, h) => (
                      <tr key={h} className="border-t border-slate-850">
                        <td className="p-2 font-bold text-slate-300 font-mono border-r border-slate-850">
                          {h} goals
                        </td>
                        {row.map((prob, a) => {
                          const isMostLikely = 
                            h === prediction.poisson.mostLikelyScore.home && 
                            a === prediction.poisson.mostLikelyScore.away;
                          const intensity = Math.min(1, prob * 8);

                          return (
                            <td
                              key={a}
                              className={`p-2 font-mono transition-colors ${
                                isMostLikely ? 'ring-2 ring-emerald-400 bg-emerald-950/80 font-bold text-emerald-300' : ''
                              }`}
                              style={{
                                backgroundColor: isMostLikely ? undefined : `rgba(16, 185, 129, ${intensity * 0.3})`,
                              }}
                              title={`${h} - ${a}: ${(prob * 100).toFixed(2)}%`}
                            >
                              <div className="text-[11px] font-semibold text-slate-200">
                                {(prob * 100).toFixed(1)}%
                              </div>
                              <div className="text-[9px] text-slate-500">
                                {h}-{a}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: ALL 5 MARKETS */}
          {activeTab === 'markets' && prediction && (
            <div className="space-y-5">
              {/* Market 1: 1X2 */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <h5 className="font-bold text-slate-200 text-sm mb-2 flex items-center justify-between">
                  <span>1. Full-Time 1X2 Market (Match Winner)</span>
                  <span className="text-xs font-mono text-emerald-400">Picks: {prediction.market1X2.predictedOutcome}</span>
                </h5>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">1 (Home Win)</div>
                    <div className="text-lg font-black text-slate-100 mt-1">{formatProb(prediction.market1X2.homeWin)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">X (Draw)</div>
                    <div className="text-lg font-black text-slate-100 mt-1">{formatProb(prediction.market1X2.draw)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">2 (Away Win)</div>
                    <div className="text-lg font-black text-slate-100 mt-1">{formatProb(prediction.market1X2.awayWin)}</div>
                  </div>
                </div>
              </div>

              {/* Market: 1X2 Interval 10 Minutes (00:01 - 09:59) */}
              {prediction.market1X2Interval10 && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                        <span>2. 1X2 - Interval 10 Minutes (00:01 - 09:59)</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Time-Slice Poisson
                        </span>
                      </h5>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Predicted match leader at the end of the opening 10 minutes (09:59).
                      </p>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      Pick: {prediction.market1X2Interval10.predictedOutcome}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className={`p-3 rounded-xl border ${
                      prediction.market1X2Interval10.predictedOutcome === '1'
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}>
                      <div className="text-xs text-slate-400">1 (Home Leads)</div>
                      <div className="text-lg font-black mt-1">
                        {formatProb(prediction.market1X2Interval10.homeWin)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">e.g. 1-0 at 09:59</div>
                    </div>

                    <div className={`p-3 rounded-xl border ${
                      prediction.market1X2Interval10.predictedOutcome === 'X'
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}>
                      <div className="text-xs text-slate-400">X (Tied / Draw)</div>
                      <div className="text-lg font-black mt-1">
                        {formatProb(prediction.market1X2Interval10.draw)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">e.g. 0-0, 1-1 at 09:59</div>
                    </div>

                    <div className={`p-3 rounded-xl border ${
                      prediction.market1X2Interval10.predictedOutcome === '2'
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}>
                      <div className="text-xs text-slate-400">2 (Away Leads)</div>
                      <div className="text-lg font-black mt-1">
                        {formatProb(prediction.market1X2Interval10.awayWin)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">e.g. 0-1 at 09:59</div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs p-3 rounded-xl bg-slate-900 border border-slate-850 gap-2">
                    <span className="text-slate-400">
                      Probability of any goal scored before 10:00:
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-emerald-400">
                        {formatProb(prediction.market1X2Interval10.earlyGoalProbability)}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">
                        Most Likely 10m Score:{' '}
                        <strong className="text-slate-200 font-mono">
                          {prediction.market1X2Interval10.mostLikelyScore}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Market 2 & 3: BTTS and Over/Under */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <h5 className="font-bold text-slate-200 text-sm mb-2">2. Both Teams To Score (BTTS)</h5>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Yes</div>
                      <div className="text-lg font-black text-emerald-300 mt-1">{formatProb(prediction.marketBTTS.yes)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">No</div>
                      <div className="text-lg font-black text-slate-300 mt-1">{formatProb(prediction.marketBTTS.no)}</div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <h5 className="font-bold text-slate-200 text-sm mb-2">3. Over / Under 2.5 Total Goals</h5>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Over 2.5</div>
                      <div className="text-lg font-black text-emerald-300 mt-1">{formatProb(prediction.marketOverUnder25.over)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-xs text-slate-400">Under 2.5</div>
                      <div className="text-lg font-black text-slate-300 mt-1">{formatProb(prediction.marketOverUnder25.under)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Market 4: Double Chance */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <h5 className="font-bold text-slate-200 text-sm mb-2">
                  4. Double Chance (Derived Directly from 1X2 Probabilities)
                </h5>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">1X (Home or Draw)</div>
                    <div className="text-lg font-black text-slate-100 mt-1">{formatProb(prediction.marketDoubleChance['1X'])}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">12 (Home or Away)</div>
                    <div className="text-lg font-black text-slate-100 mt-1">{formatProb(prediction.marketDoubleChance['12'])}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">X2 (Draw or Away)</div>
                    <div className="text-lg font-black text-slate-100 mt-1">{formatProb(prediction.marketDoubleChance['X2'])}</div>
                  </div>
                </div>
              </div>

              {/* Market 5: HT/FT 9 Combinations */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <h5 className="font-bold text-slate-200 text-sm mb-3">
                  5. Half-Time / Full-Time (HT/FT) All 9 Joint Combinations
                </h5>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {(Object.keys(prediction.marketHtFt.probabilities) as HtFtOutcome[]).map((key) => {
                    const prob = prediction.marketHtFt.probabilities[key];
                    const isPick = prediction.marketHtFt.predictedOutcome === key;
                    return (
                      <div
                        key={key}
                        className={`p-2 rounded-xl border ${
                          isPick ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="font-mono font-bold text-slate-400">{key}</div>
                        <div className="text-sm font-extrabold text-slate-100 mt-0.5">{formatProb(prob)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TACTICAL SCOUT (GOOGLE SEARCH GROUNDED) */}
          {activeTab === 'scout' && (
            <div className="space-y-4">
              {isScoutLoading ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-slate-200">
                    Grounding latest squad news with Google Search...
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Scanning confirmed lineups, suspension announcements, and managerial press conferences via Gemini 4 Hydrogen.
                  </p>
                </div>
              ) : scoutError ? (
                <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
                  <p className="font-bold mb-1">Scout Search Grounding Error</p>
                  <p>{scoutError}</p>
                  <button
                    onClick={handleFetchScout}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-rose-900 text-white font-medium hover:bg-rose-800 transition-colors"
                  >
                    Retry Search
                  </button>
                </div>
              ) : scoutReport ? (
                <div className="space-y-4 text-xs">
                  {/* Headline */}
                  <div className="p-4 rounded-2xl bg-teal-950/40 border border-teal-800/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                      Live Grounded Intel
                    </span>
                    <h4 className="text-base font-extrabold text-slate-100 mt-1">
                      {scoutReport.headline}
                    </h4>
                  </div>

                  {/* Injuries & Suspensions */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                    <h5 className="font-bold text-slate-200 text-sm mb-3">
                      Confirmed Player Availability & Squad Status
                    </h5>
                    <div className="space-y-2.5">
                      {scoutReport.keyInjuries.map((item, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                          <div>
                            <span className="font-bold text-slate-200">{item.player}</span>{' '}
                            <span className="text-slate-500 font-mono">({item.team})</span>
                            <p className="text-slate-400 text-[11px] mt-0.5">{item.impactAnalysis}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.status === 'OUT' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                            item.status === 'DOUBTFUL' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tactical Key Points */}
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                    <h5 className="font-bold text-slate-200 text-sm mb-2">Tactical Battlegrounds & Pace</h5>
                    <ul className="space-y-2 text-slate-300">
                      {scoutReport.tacticalKeyPoints.map((pt, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-teal-400 font-bold">•</span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Grounded Web Sources with external URLs */}
                  {scoutReport.searchGroundedSources.length > 0 && (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                      <h5 className="font-bold text-slate-400 text-xs mb-2">Google Search Grounding Sources</h5>
                      <div className="flex flex-wrap gap-2">
                        {scoutReport.searchGroundedSources.map((src, i) => (
                          <a
                            key={i}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-teal-300 hover:text-teal-200 text-[11px] transition-colors"
                          >
                            <span className="truncate max-w-[200px]">{src.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 4: H2H & TEAM STATS */}
          {activeTab === 'h2h' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <h5 className="font-bold text-slate-200 text-sm mb-2">Advanced Performance Metrics</h5>
                <div className="grid grid-cols-3 gap-2 items-center text-center">
                  <div className="font-bold text-slate-100">{homeTeam.avgGoalsScored.toFixed(2)}</div>
                  <div className="text-slate-500">Avg Goals Scored / Match</div>
                  <div className="font-bold text-slate-100">{awayTeam.avgGoalsScored.toFixed(2)}</div>

                  <div className="font-bold text-slate-100">{homeTeam.avgXg.toFixed(2)}</div>
                  <div className="text-slate-500">Average xG Created</div>
                  <div className="font-bold text-slate-100">{awayTeam.avgXg.toFixed(2)}</div>

                  <div className="font-bold text-slate-100">{Math.round(homeTeam.cleanSheetPct * 100)}%</div>
                  <div className="text-slate-500">Clean Sheet Percentage</div>
                  <div className="font-bold text-slate-100">{Math.round(awayTeam.cleanSheetPct * 100)}%</div>

                  <div className="font-bold text-slate-100">{homeTeam.attackRating}</div>
                  <div className="text-slate-500">Attack Rating (Poisson Scale)</div>
                  <div className="font-bold text-slate-100">{awayTeam.attackRating}</div>

                  <div className="font-bold text-slate-100">{homeTeam.defenseRating}</div>
                  <div className="text-slate-500">Defense Suppression</div>
                  <div className="font-bold text-slate-100">{awayTeam.defenseRating}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onLaunchVeo(fixture);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-xs font-semibold transition-colors"
            >
              <Video className="w-4 h-4 text-purple-400" />
              <span>Generate Veo 3.1 Cinematic Match Reel</span>
            </button>

            {onOpenChat && (
              <button
                onClick={() => {
                  onClose();
                  onOpenChat(fixture);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>Ask Gemini 4 Analyst</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
          >
            Close Room
          </button>
        </div>
      </div>
    </div>
  );
};
