import React, { useState } from 'react';
import { 
  Sparkles, 
  Search, 
  ExternalLink, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Flame, 
  Wind,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Fixture, TacticalScoutReport } from '../types/football';
import { TeamBadge } from './TeamBadge';

interface TacticalScoutViewProps {
  fixtures: Fixture[];
  onSelectFixtureForDeepDive: (fixture: Fixture) => void;
}

export const TacticalScoutView: React.FC<TacticalScoutViewProps> = ({
  fixtures,
  onSelectFixtureForDeepDive,
}) => {
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(fixtures[0]?.id || '');
  const [customHome, setCustomHome] = useState('');
  const [customAway, setCustomAway] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<TacticalScoutReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeFixture = fixtures.find(f => f.id === selectedFixtureId);

  const handleRunScout = async (home?: string, away?: string, comp?: string, ven?: string) => {
    const homeTeam = home || (activeFixture ? activeFixture.homeTeam.name : customHome);
    const awayTeam = away || (activeFixture ? activeFixture.awayTeam.name : customAway);

    if (!homeTeam || !awayTeam) {
      setError('Please select or enter both home and away teams.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/gemini/grounded-scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam,
          awayTeam,
          competition: comp || activeFixture?.competition.name || 'Top Flight Football',
          venue: ven || activeFixture?.venue || 'Stadium',
          kickoffTimeUtc: activeFixture?.kickoffTimeUtc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to retrieve grounded tactical scout report');
      }

      setReport(data.data);
    } catch (err: any) {
      setError(err.message || 'Error executing search grounding');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-teal-950/60 via-slate-900 to-slate-950 border border-teal-800/40 relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-bold uppercase tracking-wider text-teal-400">
              Gemini 4 Hydrogen Search Grounding
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-slate-400">Live Squad &amp; Tactical Intel</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Real-Time Tactical Scout with Live Google Search
          </h2>
          <p className="text-sm text-slate-300">
            Ground pre-match intelligence with the live Google Search index to detect breaking lineup changes, last-minute hamstring injuries, disciplinary suspensions, and managerial tactics.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Match Selection */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Flame className="w-4 h-4 text-teal-400" />
              Select Fixture to Ground
            </h3>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {fixtures.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setSelectedFixtureId(f.id);
                    handleRunScout(f.homeTeam.name, f.awayTeam.name, f.competition.name, f.venue);
                  }}
                  className={`w-full text-left p-3 rounded-2xl border transition-all ${
                    selectedFixtureId === f.id
                      ? 'bg-teal-950/60 border-teal-500/80 shadow-md shadow-teal-950/40'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-teal-300 truncate">{f.competition.name}</span>
                    <span className="font-mono">{f.status}</span>
                  </div>
                  <div className="font-bold text-xs text-slate-200 mt-1.5 flex items-center justify-between gap-2">
                    <span className="truncate">{f.homeTeam.name} vs {f.awayTeam.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <TeamBadge team={f.homeTeam} size="xs" />
                      <TeamBadge team={f.awayTeam} size="xs" />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Match Search */}
            <div className="pt-4 border-t border-slate-800/80 space-y-3">
              <span className="text-xs font-semibold text-slate-300">Or Search Custom Clash:</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Home Team"
                  value={customHome}
                  onChange={(e) => setCustomHome(e.target.value)}
                  className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
                <input
                  type="text"
                  placeholder="Away Team"
                  value={customAway}
                  onChange={(e) => setCustomAway(e.target.value)}
                  className="rounded-xl bg-slate-950 border border-slate-800 p-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
              <button
                onClick={() => handleRunScout(customHome, customAway)}
                disabled={isLoading || !customHome || !customAway}
                className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search Custom Match Intel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Search Grounded Output */}
        <div className="lg:col-span-8 space-y-6">
          {isLoading ? (
            <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="space-y-1">
                <h4 className="font-bold text-white text-base">Grounding Tactical Query with Google Search</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Querying live press wires, verified journalist reports, and medical bulletins to prevent model hallucinations.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-6 rounded-3xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Grounding Error</span>
              </div>
              <p>{error}</p>
            </div>
          ) : report ? (
            <div className="space-y-6">
              {/* Headline & Overview */}
              <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <span>Report Generated: {new Date(report.generatedAt).toLocaleTimeString()}</span>
                  </div>
                  {activeFixture && (
                    <button
                      onClick={() => onSelectFixtureForDeepDive(activeFixture)}
                      className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                    >
                      <span>Open Dixon-Coles Matrix</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <h3 className="text-xl font-extrabold text-white leading-snug">
                  {report.headline}
                </h3>

                {report.summary && (
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-slate-850">
                    {report.summary}
                  </p>
                )}
              </div>

              {/* Injury & Availability Grid */}
              <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Grounded Injury & Suspension Intelligence
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.keyInjuries.map((item, idx) => (
                    <div key={idx} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-850 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 text-xs">{item.player}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'OUT' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                          item.status === 'DOUBTFUL' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-teal-400 font-mono block">{item.team}</span>
                      <p className="text-slate-400 text-[11px] leading-tight">{item.impactAnalysis}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tactical Key Points & Weather */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-teal-400" />
                    Key Tactical Matchups
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {report.tacticalKeyPoints.map((pt, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-teal-400 font-bold shrink-0">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Wind className="w-4 h-4 text-sky-400" />
                    Weather & Pitch Grounding
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {report.weatherAndPitch}
                  </p>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-850 text-[11px] text-slate-400">
                    Expected to favor fast transitions with standard surface friction.
                  </div>
                </div>
              </div>

              {/* Grounded Web Sources Citations */}
              {report.searchGroundedSources.length > 0 && (
                <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Grounding Sources & Citations (Google Search)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {report.searchGroundedSources.map((source, idx) => (
                      <a
                        key={idx}
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-800 text-teal-300 hover:text-teal-200 text-xs transition-colors"
                      >
                        <span className="truncate max-w-[220px]">{source.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 rounded-3xl bg-slate-900/90 border border-dashed border-slate-800 text-center text-slate-500 space-y-3">
              <Sparkles className="w-10 h-10 text-teal-500/50 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Select a fixture to retrieve scout intelligence</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Uses Gemini 4 Hydrogen with the Google Search tool to verify real squad status before placing statistical trust.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
