import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  ShieldCheck, 
  TrendingUp, 
  Activity, 
  CheckCircle2, 
  Info,
  Scale,
  Award,
  Database
} from 'lucide-react';
import { Fixture, HistoricalEvaluationMetrics } from '../types/football';
import { computeEvaluationMetrics, settleCompletedFixture } from '../services/calibration';
import { PredictionOutcomeBarGraph } from './PredictionOutcomeBarGraph';
import { UserProfile, ADMIN_EMAIL, persistFixturesAndPredictionsToFirestore } from '../services/firebase';

interface CalibrationViewProps {
  fixtures: Fixture[];
  user?: UserProfile | null;
}

export const CalibrationView: React.FC<CalibrationViewProps> = ({ fixtures, user }) => {
  const normalizedFixtures = useMemo(
    () => fixtures.map(settleCompletedFixture),
    [fixtures]
  );
  const metrics: HistoricalEvaluationMetrics = useMemo(
    () => computeEvaluationMetrics(normalizedFixtures),
    [normalizedFixtures]
  );
  const settledFixtures = normalizedFixtures.filter(f => f.status === 'FT');

  const [isSyncingLedger, setIsSyncingLedger] = useState(false);
  const [ledgerMessage, setLedgerMessage] = useState<string | null>(null);

  const handleSyncLedger = async () => {
    try {
      setIsSyncingLedger(true);
      setLedgerMessage(null);
      await persistFixturesAndPredictionsToFirestore(normalizedFixtures);
      const count = normalizedFixtures.filter((f) => Boolean(f.prediction)).length;
      setLedgerMessage(`Synced ${count} fixtures & 6-market snapshots to Firestore.`);
    } catch (err: any) {
      setLedgerMessage(err.message || 'Failed to sync snapshots to Firestore.');
    } finally {
      setIsSyncingLedger(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-800/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-bold uppercase tracking-wider text-emerald-400">
                Mathematical Model Evaluation
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-400">Chronological Holdout Validation</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Probability Calibration & Model Performance
            </h2>
            <p className="text-sm text-slate-300">
              Transparent statistical tracking across all 6 prediction markets. Metrics are computed out-of-sample with strict pre-kickoff feature freezes and zero post-match leakage.
            </p>
          </div>

          {user && user.email === ADMIN_EMAIL && (
            <div className="flex flex-col items-start md:items-end gap-1.5">
              <button
                onClick={handleSyncLedger}
                disabled={isSyncingLedger}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{isSyncingLedger ? 'Syncing Ledger...' : 'Sync Ledger to Firestore'}</span>
              </button>
              {ledgerMessage && (
                <span className="text-[11px] text-emerald-300 font-mono">{ledgerMessage}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Primary KPI Grid: Brier Score, Log Loss, Hit Rate, Sample Size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sample Size */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Verified Sample Size</span>
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {metrics.totalEvaluated} <span className="text-xs text-slate-500 font-normal">settled fixtures</span>
          </div>
          <p className="text-[11px] text-slate-500">Excludes postponed & void fixtures</p>
        </div>

        {/* 1X2 Brier Score */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>1X2 Multi-Class Brier</span>
            <Activity className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-300">
            {metrics.brierScore.market1X2.toFixed(4)}
          </div>
          <p className="text-[11px] text-slate-500">Lower is better (0.0000 = perfect calibration)</p>
        </div>

        {/* 1X2 Multi-Class Log Loss */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>1X2 Cross-Entropy Loss</span>
            <TrendingUp className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black font-mono text-sky-300">
            {metrics.logLoss.market1X2.toFixed(4)}
          </div>
          <p className="text-[11px] text-slate-500">Penalizes overconfident incorrect odds</p>
        </div>

        {/* Overall Hit Rate */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Multi-Market Hit Rate</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-300">
            {Math.round(metrics.hitRate.overall * 100)}%
          </div>
          <p className="text-[11px] text-slate-500">Aggregated across 1X2, BTTS, O/U & DC</p>
        </div>
      </div>

      {/* Won / Lost / Pending Separate-Column Bar Graph */}
      <PredictionOutcomeBarGraph fixtures={normalizedFixtures} />

      {/* Market-by-Market Accuracy & Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance by Market */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            Performance Breakdown Across Supported Markets
          </h3>

          <div className="space-y-3">
            {/* 1X2 */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">1X2 Match Winner (Home, Draw, Away)</span>
                <span className="font-mono text-emerald-400 font-bold">{Math.round(metrics.hitRate.market1X2 * 100)}% Hit Rate</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{ width: `${metrics.hitRate.market1X2 * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Brier Score: {metrics.brierScore.market1X2}</span>
                <span>Log Loss: {metrics.logLoss.market1X2}</span>
              </div>
            </div>

            {/* BTTS */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">BTTS (Both Teams To Score: Yes / No)</span>
                <span className="font-mono text-teal-400 font-bold">{Math.round(metrics.hitRate.marketBTTS * 100)}% Hit Rate</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-teal-500 h-full rounded-full transition-all"
                  style={{ width: `${metrics.hitRate.marketBTTS * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Brier Score: {metrics.brierScore.marketBTTS}</span>
                <span>Log Loss: {metrics.logLoss.marketBTTS}</span>
              </div>
            </div>

            {/* Over/Under 2.5 */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">Over / Under 2.5 Total Goals</span>
                <span className="font-mono text-sky-400 font-bold">{Math.round(metrics.hitRate.marketOverUnder25 * 100)}% Hit Rate</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-sky-500 h-full rounded-full transition-all"
                  style={{ width: `${metrics.hitRate.marketOverUnder25 * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Brier Score: {metrics.brierScore.marketOverUnder25}</span>
                <span>Log Loss: {metrics.logLoss.marketOverUnder25}</span>
              </div>
            </div>

            {/* Double Chance */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">Double Chance (1X, 12, X2 Derived)</span>
                <span className="font-mono text-purple-400 font-bold">{Math.round(metrics.hitRate.marketDoubleChance * 100)}% Hit Rate</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all"
                  style={{ width: `${metrics.hitRate.marketDoubleChance * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Brier Score: {metrics.brierScore.marketDoubleChance}</span>
                <span>Derived mathematically from 1X2 probabilities</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reliability Curve / Calibration Bands */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Reliability Diagram (Predicted vs Observed)
            </h3>
            <span className="text-xs text-slate-500">Home Win Probability</span>
          </div>

          <p className="text-xs text-slate-400">
            A well-calibrated engine should track close to the dashed diagonal (predicted probability ≈ observed win rate).
          </p>

          {/* SVG Reliability Plot */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-850">
            <svg viewBox="0 0 360 190" className="w-full h-44" role="img" aria-label="Calibration Reliability Curve">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = 160 - t * 135;
                const x = 40 + t * 290;
                return (
                  <g key={t}>
                    <line x1={40} y1={y} x2={330} y2={y} stroke="#1e293b" strokeWidth={1} />
                    <line x1={x} y1={25} x2={x} y2={160} stroke="#1e293b" strokeWidth={1} />
                    <text x={32} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">
                      {Math.round(t * 100)}%
                    </text>
                    <text x={x} y={175} textAnchor="middle" fontSize="9" fill="#64748b">
                      {Math.round(t * 100)}%
                    </text>
                  </g>
                );
              })}

              {/* Ideal y = x diagonal */}
              <line
                x1={40}
                y1={160}
                x2={330}
                y2={25}
                stroke="#475569"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />

              {/* Polyline connecting active calibration buckets */}
              {(() => {
                const activePts = metrics.calibrationBands
                  .filter((b) => b.count > 0)
                  .map((b) => ({
                    x: 40 + b.predictedAvg * 290,
                    y: 160 - b.actualObserved * 135,
                    band: b,
                  }));
                if (activePts.length === 0) return null;
                return (
                  <>
                    {activePts.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        points={activePts.map((p) => `${p.x},${p.y}`).join(' ')}
                      />
                    )}
                    {activePts.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={6}
                          fill="#10b981"
                          stroke="#020617"
                          strokeWidth={2}
                        >
                          <title>{`${p.band.predictedRange}: Pred ${Math.round(
                            p.band.predictedAvg * 100
                          )}% | Obs ${Math.round(p.band.actualObserved * 100)}% (n=${
                            p.band.count
                          })`}</title>
                        </circle>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
            <div className="flex items-center justify-between text-[10px] text-slate-500 px-2">
              <span>Dashed: Perfect Calibration (y = x)</span>
              <span className="text-emerald-400">Green Dots: Observed Sample Buckets</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            {metrics.calibrationBands.map((band, i) => {
              const diff = Math.abs(band.predictedAvg - band.actualObserved);
              const isWellCalibrated = diff < 0.15;

              return (
                <div key={i} className="p-3 rounded-2xl bg-slate-950 border border-slate-850 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-semibold text-slate-300">{band.predictedRange}</span>
                    <span className="text-[11px] text-slate-500 font-mono ml-2">({band.count} events)</span>
                  </div>
                  <div className="flex items-center gap-4 font-mono">
                    <span className="text-emerald-400 font-bold">
                      Pred: {Math.round(band.predictedAvg * 100)}%
                    </span>
                    <span className={`font-bold ${band.count === 0 ? 'text-slate-600' : isWellCalibrated ? 'text-teal-300' : 'text-amber-400'}`}>
                      Obs: {band.count > 0 ? `${Math.round(band.actualObserved * 100)}%` : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Historical Settled Matches Audit List */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Verified Result Reconciliation Audit Trail
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-2.5 px-3">Fixture</th>
                <th className="py-2.5 px-3">Competition</th>
                <th className="py-2.5 px-3">Verified Final Score</th>
                <th className="py-2.5 px-3">1X2 Pick</th>
                <th className="py-2.5 px-3">BTTS Pick</th>
                <th className="py-2.5 px-3">O/U 2.5 Pick</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {settledFixtures.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-3 text-center text-slate-500">
                    No completed fixtures have been settled yet. Settled results will appear automatically once matches finish.
                  </td>
                </tr>
              ) : (
                settledFixtures.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-200">
                      {f.homeTeam.name} vs {f.awayTeam.name}
                    </td>
                    <td className="py-3 px-3 text-slate-400">{f.competition.name}</td>
                    <td className="py-3 px-3 font-mono text-slate-100 font-bold">
                      {f.prediction?.settlement?.actualScore || `${f.scores.currentHome} - ${f.scores.currentAway}`}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {f.prediction?.market1X2.predictedOutcome} ({Math.round((f.prediction?.market1X2.homeWin ?? 0) * 100)}% / {Math.round((f.prediction?.market1X2.draw ?? 0) * 100)}% / {Math.round((f.prediction?.market1X2.awayWin ?? 0) * 100)}%)
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {f.prediction?.marketBTTS.predictedOutcome}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {f.prediction?.marketOverUnder25.predictedOutcome}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          f.prediction?.settlement?.status === 'WON'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {f.prediction?.settlement?.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
