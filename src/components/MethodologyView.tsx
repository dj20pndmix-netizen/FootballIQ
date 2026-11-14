import React from 'react';
import { BookOpen, ShieldCheck, CheckCircle2, AlertTriangle, Layers, Cpu } from 'lucide-react';

export const MethodologyView: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-200">
      {/* Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-800/40 relative overflow-hidden">
        <div className="space-y-2">
          <span className="font-mono font-bold uppercase tracking-wider text-emerald-400 text-xs">
            Scientific Transparency &amp; Rigor
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Methodology & Mathematical Foundation
          </h2>
          <p className="text-sm text-slate-300">
            FootballIQ does not rely on opaque black-box machine learning or arbitrary percentages. Our predictions are rooted in the classical Bivariate Poisson and Dixon-Coles goal intensity models.
          </p>
        </div>
      </div>

      {/* Pillar 1: Poisson & Dixon-Coles Mathematical Formulation */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Cpu className="w-5 h-5 text-emerald-400" />
          1. Bivariate Poisson & Dixon-Coles Goal Rate Formulation
        </h3>
        
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Standard Poisson assumes independence between home and away scoring. However, empirical football research (Dixon & Coles, 1997) shows low-scoring scorelines (0-0, 1-0, 0-1, 1-1) exhibit significant mutual correlation due to match tempo and defensive caution.
        </p>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs space-y-2 text-emerald-300">
          <div>P(X = x, Y = y) = τ(x, y, λ, μ, ρ) × P(X = x; λ) × P(Y = y; μ)</div>
          <div className="text-slate-400 text-[11px] pt-1">
            Where P(k; λ) = (λ^k · e^(-λ)) / k! is the Poisson PMF, and τ is the Dixon-Coles adjustment:
          </div>
          <ul className="text-slate-400 text-[11px] list-disc list-inside space-y-0.5 pl-2">
            <li>τ(0, 0) = 1 - λ · μ · ρ</li>
            <li>τ(0, 1) = 1 + λ · ρ</li>
            <li>τ(1, 0) = 1 + μ · ρ</li>
            <li>τ(1, 1) = 1 - ρ</li>
            <li>τ(x, y) = 1.0 for all other scorelines (x + y ≥ 3)</li>
          </ul>
        </div>
      </div>

      {/* Pillar 2: Derivation of the 5 Prediction Markets */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-teal-400" />
          2. Mathematical Derivation of All 6 Supported Markets
        </h3>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Market A: Full-Time 1X2</h4>
            <p className="text-slate-400 text-xs">
              Derived by summing the joint probability matrix: Home Win = ∑(x &gt; y), Draw = ∑(x = y), Away Win = ∑(x &lt; y). The outcome with the strictly highest probability is selected as the predicted pick, even when it is an away win or a draw.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Market B: Both Teams To Score (BTTS)</h4>
            <p className="text-slate-400 text-xs">
              Yes = ∑(x &gt; 0 ∧ y &gt; 0); No = 1 - P(Yes). Exhaustive probabilities sum strictly to 1.0.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Market C: Over / Under 2.5 Total Goals</h4>
            <p className="text-slate-400 text-xs">
              Under 2.5 = ∑(x + y ≤ 2) across (0-0, 1-0, 0-1, 2-0, 0-2, 1-1); Over 2.5 = 1 - Under 2.5. Exhaustive probabilities sum strictly to 1.0.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Market D: Half-Time / Full-Time (HT/FT)</h4>
            <p className="text-slate-400 text-xs">
              Modeled using time-sliced goal arrivals: 44% of expected scoring intensity occurs in the first half (HT), and 56% in the second half (SH). All 9 joint outcomes (HH, HD, HA, DH, DD, DA, AH, AD, AA) are computed and normalized to sum strictly to 1.0.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Market E: Double Chance (1X, 12, X2)</h4>
            <p className="text-slate-400 text-xs">
              Calculated mathematically directly from 1X2: 1X = P(Home) + P(Draw), X2 = P(Draw) + P(Away), 12 = P(Home) + P(Away). Ensures total mathematical coherence across markets.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850">
            <h4 className="font-bold text-slate-100 text-sm mb-1">Market F: 1X2 - Interval 10 Minutes (00:01 - 09:59)</h4>
            <p className="text-slate-400 text-xs">
              Models opening tempo using time-sliced Poisson intensities: λ(10m) = λ(90) × 0.088. Evaluates probability of Home leading (1), Tied/Draw (X, predominantly 0-0), or Away leading (2) at minute 09:59. Probabilities sum strictly to 1.0.
            </p>
          </div>
        </div>
      </div>

      {/* Pillar 3: Zero Temporal Leakage & Abstention Policy */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          3. Zero Temporal Leakage & Explicit Abstention Policy
        </h3>

        <div className="space-y-3 text-xs sm:text-sm text-slate-300">
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-850">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Pre-Kickoff Feature Snapshot:</strong> All statistical features (rolling xG, defense ratings, rest days) are frozen strictly at prediction time. No post-match event or future lineup leaks into pre-match evaluation.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-850">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Explicit Abstention:</strong> If a team has insufficient verified match history or conflicting data feeds, the model abstains (status: WITHHELD or LIMITED_DATA). We never fabricate predictions to fill cards.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-850">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Probabilistic Nature:</strong> A 70% model probability signifies that over large repeated samples, this event is estimated to occur 7 out of 10 times. It is never a guaranteed victory.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
