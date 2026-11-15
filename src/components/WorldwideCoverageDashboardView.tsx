import React, { useState, useMemo } from 'react';
import {
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  RefreshCw,
  Database,
  ShieldCheck,
  Activity,
  Layers,
  Filter,
} from 'lucide-react';
import {
  OptaCompetition,
  OptaConfederation,
  OptaCoverageCompleteness,
  OptaGender,
  OptaCoverageTier,
} from '../types/opta';
import { optaDiscoveryService } from '../services/opta/optaDiscoveryService';

export const WorldwideCoverageDashboardView: React.FC = () => {
  const [selectedConfederation, setSelectedConfederation] = useState<OptaConfederation | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<OptaCoverageCompleteness | 'ALL'>('ALL');
  const [selectedGender, setSelectedGender] = useState<OptaGender | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const competitions = useMemo(() => {
    return optaDiscoveryService.discoverCompetitions({
      confederation: selectedConfederation,
      gender: selectedGender,
      status: selectedStatus,
      searchQuery,
    });
  }, [selectedConfederation, selectedGender, selectedStatus, searchQuery]);

  const allComps = useMemo(() => optaDiscoveryService.discoverCompetitions(), []);

  const completeCount = useMemo(
    () => allComps.filter((c) => c.coverageStatus === 'COMPLETE').length,
    [allComps]
  );
  const partialCount = useMemo(
    () => allComps.filter((c) => c.coverageStatus === 'PARTIAL').length,
    [allComps]
  );
  const unavailableCount = useMemo(
    () => allComps.filter((c) => c.coverageStatus === 'UNAVAILABLE').length,
    [allComps]
  );

  const handleSyncCatalogue = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await optaDiscoveryService.synchronizeCoverage();
      setSyncFeedback(
        `Opta Catalogue Synchronized: Discovered ${res.discoveredCount} worldwide tournaments across UEFA, CAF, CONMEBOL, CONCACAF, and AFC.`
      );
      setTimeout(() => setSyncFeedback(null), 6000);
    } catch (err: any) {
      setSyncFeedback(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const CONFEDERATIONS: (OptaConfederation | 'ALL')[] = [
    'ALL',
    'UEFA',
    'CAF',
    'CONMEBOL',
    'CONCACAF',
    'AFC',
    'OFC',
    'FIFA',
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <Globe className="w-4 h-4" />
            <span>STATS PERFORM / OPTA SPORTS DATA API (SDAPI)</span>
            <span className="text-slate-600">·</span>
            <span>WORLDWIDE COVERAGE REPOSITORY</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
            Worldwide Opta Football Coverage Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Real-time audit of Opta-licensed tournaments globally. Tracking data completeness for Men’s, Women’s, Continental, Domestic, and Lower-Tier football leagues.
          </p>
        </div>

        <button
          onClick={handleSyncCatalogue}
          disabled={isSyncing}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-xs flex items-center gap-2 transition-colors shrink-0 shadow-sm shadow-emerald-950"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Synchronizing Feeds...' : 'Sync Opta Catalogue'}</span>
        </button>
      </div>

      {syncFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Competitions</span>
            <Database className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">{allComps.length}</div>
          <p className="text-[11px] text-slate-500">Across 6 Continental Confederations</p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-emerald-900/40 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
            <span>Complete Coverage</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-300 font-mono">{completeCount}</div>
          <p className="text-[11px] text-slate-500">Lineups + F24 Events + xG + MA21</p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-amber-900/40 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-400 font-medium">
            <span>Partial Coverage</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300 font-mono">{partialCount}</div>
          <p className="text-[11px] text-slate-500">Core events &amp; lineups; missing advanced xG</p>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-rose-900/40 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-rose-400 font-medium">
            <span>Scores Only / Unavailable</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-300 font-mono">{unavailableCount}</div>
          <p className="text-[11px] text-slate-500">Schedule &amp; final score only; no F24 events</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
        {/* Row 1: Search & Dropdowns */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by tournament name, country, or Opta UUID (e.g. opta:comp:8)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Genders &amp; Divisions</option>
              <option value="MEN">Men's Football</option>
              <option value="WOMEN">Women's Football</option>
              <option value="YOUTH">Youth Tournaments</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Coverage Statuses</option>
              <option value="COMPLETE">COMPLETE (All Feeds)</option>
              <option value="PARTIAL">PARTIAL (Core Feeds)</option>
              <option value="UNAVAILABLE">UNAVAILABLE (Scores Only)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Confederation Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            Confederation:
          </span>
          {CONFEDERATIONS.map((conf) => {
            const isSelected = selectedConfederation === conf;
            const count =
              conf === 'ALL'
                ? allComps.length
                : allComps.filter((c) => c.confederation === conf).length;
            return (
              <button
                key={conf}
                onClick={() => setSelectedConfederation(conf)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                  isSelected
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-950'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <span>{conf === 'ALL' ? 'Worldwide (All)' : conf}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Competitions Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Competition</th>
                <th className="py-3.5 px-3">Confed / Country</th>
                <th className="py-3.5 px-3">Opta ID / Code</th>
                <th className="py-3.5 px-3">Season</th>
                <th className="py-3.5 px-3">Dataset Coverage Flags</th>
                <th className="py-3.5 px-3">Coverage Tier</th>
                <th className="py-3.5 px-4 text-right">Completeness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {competitions.map((comp) => {
                return (
                  <tr key={comp.optaCompetitionId} className="hover:bg-slate-800/40 transition-colors">
                    {/* Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg shrink-0" aria-hidden="true">{comp.logo}</span>
                        <div>
                          <div className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                            <span>{comp.name}</span>
                            {comp.gender === 'WOMEN' && (
                              <span className="px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-semibold">
                                Women's
                              </span>
                            )}
                            {comp.gender === 'YOUTH' && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                                Youth
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 capitalize">
                            {comp.competitionType.replace('_', ' ').toLowerCase()}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Confederation & Country */}
                    <td className="py-3.5 px-3">
                      <div className="font-medium text-slate-200">{comp.country}</div>
                      <span className="inline-block px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px] font-mono mt-0.5">
                        {comp.confederation}
                      </span>
                    </td>

                    {/* Opta Identifier */}
                    <td className="py-3.5 px-3 font-mono text-slate-300">
                      <div>{comp.optaCompetitionId}</div>
                      <div className="text-[10px] text-slate-500">{comp.code}</div>
                    </td>

                    {/* Seasons */}
                    <td className="py-3.5 px-3 font-mono text-slate-300">
                      <div>{comp.availableSeasons[0] || '2026/27'}</div>
                      <div className="text-[10px] text-slate-500">
                        {comp.availableSeasons.length} seasons backfilled
                      </div>
                    </td>

                    {/* Dataset Badges */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                            comp.statsAvailable.lineups
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-slate-950 text-slate-600 line-through'
                          }`}
                          title="Starting Lineups & Formations"
                        >
                          Lineups
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                            comp.statsAvailable.eventsF24
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-slate-950 text-slate-600 line-through'
                          }`}
                          title="Opta F24 Event Stream (Touches, Coordinates, Passes)"
                        >
                          F24 Events
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                            comp.statsAvailable.expectedGoalsXg
                              ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60'
                              : 'bg-slate-950 text-slate-600 line-through'
                          }`}
                          title="Official Opta Expected Goals (xG, xGA, xA)"
                        >
                          xG Metrics
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                            comp.statsAvailable.optaPredictionsMA21
                              ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                              : 'bg-slate-950 text-slate-600 line-through'
                          }`}
                          title="Opta Supercomputer Simulation Feed (MA21)"
                        >
                          MA21 Sim
                        </span>
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="py-3.5 px-3 font-mono text-[11px]">
                      {comp.tier === 'TIER_1_GRANULAR' && (
                        <span className="text-emerald-400 font-semibold">Tier 1 (Granular)</span>
                      )}
                      {comp.tier === 'TIER_2_EVENTS' && (
                        <span className="text-teal-400 font-semibold">Tier 2 (Full Events)</span>
                      )}
                      {comp.tier === 'TIER_3_CORE' && (
                        <span className="text-amber-400">Tier 3 (Core Match)</span>
                      )}
                      {comp.tier === 'TIER_4_SCORES_ONLY' && (
                        <span className="text-slate-500">Tier 4 (Scores Only)</span>
                      )}
                    </td>

                    {/* Completeness Badge */}
                    <td className="py-3.5 px-4 text-right">
                      {comp.coverageStatus === 'COMPLETE' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          COMPLETE
                        </span>
                      )}
                      {comp.coverageStatus === 'PARTIAL' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          PARTIAL
                        </span>
                      )}
                      {comp.coverageStatus === 'UNAVAILABLE' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold">
                          <XCircle className="w-3.5 h-3.5" />
                          UNAVAILABLE
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
