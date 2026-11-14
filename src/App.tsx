import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SidebarNav } from './components/SidebarNav';
import { TopBar } from './components/TopBar';
import { FixtureCard } from './components/FixtureCard';
import { MatchDetailModal } from './components/MatchDetailModal';
import { VeoStudioView } from './components/VeoStudioView';
import { TacticalScoutView } from './components/TacticalScoutView';
import { CalibrationView } from './components/CalibrationView';
import { AdminConsoleView } from './components/AdminConsoleView';
import { MethodologyView } from './components/MethodologyView';
import { GeminiChatView } from './components/GeminiChatView';
import { PredictionOutcomeBarGraph } from './components/PredictionOutcomeBarGraph';
import { AuthPortalView } from './components/AuthPortalView';
import { GoogleDriveSyncModal } from './components/GoogleDriveSyncModal';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  Fixture,
  GroundedSyncResult,
  SyncJobRecord,
} from './types/football';
import {
  getInitialFixtures,
  COMPETITIONS,
  MATCHDAY_DATE_LABEL,
  WORLD_REGIONS,
} from './services/mockHistoricalData';
import {
  UserProfile,
  auth,
  syncUserProfile,
  testConnection,
  loadSyncedFixturesFromFirestore,
  loadSyncJobsFromFirestore,
  persistFixturesAndPredictionsToFirestore,
  saveSyncJobToFirestore,
  getCachedUserSession,
  setCachedUserSession,
  signOutUser,
  isAdminUser,
} from './services/firebase';
import {
  mergeFixtureUpdates,
  saveFixtureUpdatesToCache,
  loadFixtureUpdatesFromCache,
  saveSyncJobsToCache,
  loadSyncJobsFromCache,
  fetchServerSyncState,
  triggerServerFixtureSync,
} from './services/syncService';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Search,
  RefreshCw,
  AlertCircle,
  Globe,
  ExternalLink,
  X,
  Clock,
  Flame,
} from 'lucide-react';

const SIDEBAR_STORAGE_KEY = 'footballiq_sidebar_collapsed';
const AUTO_SYNC_PREF_KEY = 'footballiq_auto_sync_enabled';
const AUTO_SYNC_INTERVAL_MS = 60_000;

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('fixtures');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [selectedTimezone, setSelectedTimezone] = useState<string>('Africa/Kampala');
  const [oddsFormat, setOddsFormat] = useState<'PROBABILITY' | 'DECIMAL'>('PROBABILITY');
  const [activeMarket, setActiveMarket] = useState<
    '1X2' | 'BTTS' | 'OVER_UNDER_25' | 'HT_FT' | 'DOUBLE_CHANCE' | '1X2_INTERVAL_10'
  >('1X2');

  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const [selectedFixtureForChat, setSelectedFixtureForChat] = useState<Fixture | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState<boolean>(false);

  // Live Search & Automatic Background Sync state
  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTO_SYNC_PREF_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncJobs, setSyncJobs] = useState<SyncJobRecord[]>(() => loadSyncJobsFromCache());
  const [groundedSyncResult, setGroundedSyncResult] = useState<GroundedSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Filters
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedCompetition, setSelectedCompetition] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fixturesRef = useRef<Fixture[]>([]);
  const userRef = useRef<UserProfile | null>(null);
  const lastSyncEpochRef = useRef<number>(0);

  useEffect(() => {
    fixturesRef.current = fixtures;
  }, [fixtures]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Strictly prevent auto-login: purge any stale legacy cached sessions on startup
  useEffect(() => {
    try {
      localStorage.removeItem('footballiq_active_session');
    } catch {}
  }, []);

  const handleToggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  };

  const handleToggleAutoSync = () => {
    setAutoSyncEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_SYNC_PREF_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const applyAndPersistSyncedFixtures = useCallback(
    async (
      nextFixtures: Fixture[],
      jobs?: SyncJobRecord[],
      latestJob?: SyncJobRecord | null
    ) => {
      setFixtures(nextFixtures);
      fixturesRef.current = nextFixtures;
      saveFixtureUpdatesToCache(nextFixtures);

      if (jobs) {
        setSyncJobs(jobs);
        saveSyncJobsToCache(jobs);
      }

      const activeUser = userRef.current;
      if (isAdminUser(activeUser)) {
        try {
          await persistFixturesAndPredictionsToFirestore(nextFixtures);
          if (latestJob) {
            await saveSyncJobToFirestore(latestJob);
          }
        } catch (fbErr) {
          console.warn('Firestore background persistence deferred:', fbErr);
        }
      }
    },
    []
  );

  const runUnifiedSync = useCallback(
    async (trigger: 'auto' | 'manual' | 'boot', forceExternal: boolean) => {
      try {
        if (forceExternal) {
          setIsLiveSyncing(true);
          setSyncError(null);
        }

        const currentBase =
          fixturesRef.current.length > 0 ? fixturesRef.current : getInitialFixtures();

        const payload = await triggerServerFixtureSync({
          fixtures: currentBase,
          trigger,
          dateLabel: MATCHDAY_DATE_LABEL,
          forceExternal,
        });

        lastSyncEpochRef.current = Date.now();

        if (payload?.data) {
          const updates = payload.data.fixtureUpdates || [];
          const merged = mergeFixtureUpdates(currentBase, updates);
          const nextJobs = payload.data.syncJobs || [];
          const latestJob = payload.data.job || null;
          setLastSyncedAt(payload.data.lastAutoSyncAt || new Date().toISOString());

          await applyAndPersistSyncedFixtures(merged, nextJobs, latestJob);

          if (forceExternal && payload.success) {
            setGroundedSyncResult({
              syncedAt: payload.data.job.completedAt || new Date().toISOString(),
              dateChecked: MATCHDAY_DATE_LABEL,
              summary: payload.data.summary,
              verifiedFixtures: [],
              sources: payload.data.sources || [],
            });
          }
        }

        if (!payload.success && forceExternal) {
          setSyncError(
            payload.error || 'External live search sync hit quota limits; persisted cache retained.'
          );
        }
      } catch (err: any) {
        if (forceExternal) {
          setSyncError(err?.message || 'Live synchronization failed');
        }
      } finally {
        if (forceExternal) {
          setIsLiveSyncing(false);
        }
      }
    },
    [applyAndPersistSyncedFixtures]
  );

  // Initial hydration from Baseline -> localStorage -> Server Store -> Firestore
  useEffect(() => {
    const baseline = getInitialFixtures();
    const cachedUpdates = loadFixtureUpdatesFromCache();
    const initialMerged = mergeFixtureUpdates(baseline, cachedUpdates);
    setFixtures(initialMerged);
    fixturesRef.current = initialMerged;

    testConnection().catch(() => {
      // handled gracefully inside testConnection
    });

    // Hydrate from server store & kick off initial boot sync
    (async () => {
      const serverState = await fetchServerSyncState();
      if (serverState) {
        const mergedWithServer = mergeFixtureUpdates(
          fixturesRef.current,
          serverState.fixtureUpdates
        );
        setFixtures(mergedWithServer);
        fixturesRef.current = mergedWithServer;
        saveFixtureUpdatesToCache(mergedWithServer);
        if (serverState.syncJobs?.length) {
          setSyncJobs(serverState.syncJobs);
          saveSyncJobsToCache(serverState.syncJobs);
        }
        if (serverState.lastAutoSyncAt) {
          setLastSyncedAt(serverState.lastAutoSyncAt);
        }
      }
      await runUnifiedSync('boot', false);
    })();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && fbUser.emailVerified) {
        try {
          const profile = await syncUserProfile(fbUser);
          if (profile.emailVerified) {
            setUser(profile);
            userRef.current = profile;
            if (profile.timezone) {
              setSelectedTimezone(profile.timezone);
            }

            // Reconcile with Firestore stored fixtures & sync jobs
            try {
              const [fsFixtures, fsJobs] = await Promise.all([
                loadSyncedFixturesFromFirestore(),
                loadSyncJobsFromFirestore(),
              ]);
              if (fsFixtures.length > 0) {
                const merged = mergeFixtureUpdates(fixturesRef.current, fsFixtures);
                setFixtures(merged);
                fixturesRef.current = merged;
                saveFixtureUpdatesToCache(merged);
              }
              if (fsJobs.length > 0) {
                setSyncJobs((prev) => {
                  const seen = new Set(prev.map((j) => j.id));
                  const combined = [...prev, ...fsJobs.filter((j) => !seen.has(j.id))]
                    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                    .slice(0, 25);
                  saveSyncJobsToCache(combined);
                  return combined;
                });
              }
              if (isAdminUser(profile) && fixturesRef.current.length > 0) {
                await persistFixturesAndPredictionsToFirestore(fixturesRef.current);
              }
            } catch (fbErr) {
              console.warn('Firestore state sync deferred:', fbErr);
            }
          } else {
            setUser(null);
            userRef.current = null;
          }
        } catch (err) {
          console.warn('Auth state sync error:', err);
          setUser(null);
          userRef.current = null;
        }
      } else {
        // No verified Firebase session: user MUST remain logged out
        setUser(null);
        userRef.current = null;
      }
      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, [runUnifiedSync]);

  // Automatic 60s Background Polling & Tab-Focus Re-sync
  useEffect(() => {
    if (!autoSyncEnabled) return;

    const intervalId = window.setInterval(() => {
      runUnifiedSync('auto', false);
    }, AUTO_SYNC_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastSyncEpochRef.current > 15_000
      ) {
        runUnifiedSync('auto', false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoSyncEnabled, runUnifiedSync]);

  // Filter fixtures across world leagues, regions, and search
  const filteredFixtures = fixtures.filter((f) => {
    if (selectedRegion !== 'ALL' && f.competition.region !== selectedRegion) {
      return false;
    }
    if (selectedCompetition !== 'ALL' && f.competition.id !== selectedCompetition) {
      return false;
    }
    if (statusFilter !== 'ALL' && f.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchHome = f.homeTeam.name.toLowerCase().includes(q) || f.homeTeam.country.toLowerCase().includes(q);
      const matchAway = f.awayTeam.name.toLowerCase().includes(q) || f.awayTeam.country.toLowerCase().includes(q);
      const matchComp = f.competition.name.toLowerCase().includes(q) || f.competition.country.toLowerCase().includes(q);
      if (!matchHome && !matchAway && !matchComp) return false;
    }
    return true;
  });

  const liveMatches = fixtures.filter((f) => f.status === 'LIVE');
  const upcomingMatches = fixtures.filter((f) => f.status === 'NS');
  const completedMatches = fixtures.filter((f) => f.status === 'FT');

  const handleLaunchVeo = (fixture: Fixture) => {
    setSelectedFixture(fixture);
    setActiveTab('veo');
  };

  const handleOpenScout = (fixture: Fixture) => {
    setSelectedFixture(fixture);
    setActiveTab('scout');
  };

  const handleOpenChat = (fixture: Fixture) => {
    setSelectedFixtureForChat(fixture);
    setActiveTab('chat');
  };

  const handleTriggerSync = async () => {
    await runUnifiedSync('manual', true);
  };

  const handleLiveSearchSync = async () => {
    await runUnifiedSync('manual', true);
  };

  // Auth Session Loading Screen
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4 text-white select-none">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center animate-pulse">
          <Flame className="w-7 h-7 text-emerald-400" />
        </div>
        <div className="text-sm font-semibold tracking-wide text-slate-300">
          Authenticating FootballIQ Session...
        </div>
      </div>
    );
  }

  // Strict Authentication & Verification Gate
  // The user MUST NOT access the app menu or workspaces without creating an account or signing in, with verified email.
  if (!user || !user.emailVerified) {
    return (
      <AuthPortalView
        user={user}
        initialMode={user && !user.emailVerified ? 'verify_pending' : 'signin'}
        onAuthSuccess={(authedUser) => {
          setUser(authedUser);
          userRef.current = authedUser;
          if (authedUser.timezone) {
            setSelectedTimezone(authedUser.timezone);
          }
        }}
        onSignOut={() => {
          signOutUser();
          setUser(null);
          userRef.current = null;
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Collapsible Left Navigation Sidebar */}
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        user={user}
        liveCount={liveMatches.length}
      />

      {/* Right Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Slim Contextual Top Bar */}
        <TopBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          selectedTimezone={selectedTimezone}
          setSelectedTimezone={setSelectedTimezone}
          oddsFormat={oddsFormat}
          setOddsFormat={setOddsFormat}
          user={user}
          onOpenGoogleDriveSync={() => setIsGoogleDriveOpen(true)}
          onSignOut={() => {
            signOutUser();
            setUser(null);
            userRef.current = null;
          }}
        />

        {/* Main Viewport */}
        <main className="flex-1">
          {activeTab === 'fixtures' && (
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
              {/* Streamlined Matchday Header */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-800/80">
                <div className="space-y-1">
                  <div className="text-xs text-slate-400 font-mono tabular-nums flex items-center gap-2">
                    <span>{MATCHDAY_DATE_LABEL}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-400 font-medium">30 World Leagues &amp; Competitions</span>
                    <span aria-hidden="true">·</span>
                    <span>Global Coverage</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight text-balance">
                    World Football Predictions &amp; Intelligence
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="font-mono tabular-nums text-slate-400 flex items-center gap-2">
                    <span className={liveMatches.length > 0 ? 'text-rose-400 font-bold' : ''}>
                      {liveMatches.length} Live
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{upcomingMatches.length} Upcoming</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-400 font-semibold">
                      {completedMatches.length} Settled
                    </span>
                  </div>

                  <button
                    onClick={handleToggleAutoSync}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      autoSyncEnabled
                        ? 'bg-slate-900 border-emerald-700/60 text-emerald-300 hover:bg-slate-800'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                    title="Automatically poll server store and sync live results every 60 seconds"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{autoSyncEnabled ? 'Auto-Sync 60s' : 'Auto-Sync Off'}</span>
                    {lastSyncedAt && (
                      <span className="font-mono text-[10px] text-slate-400 hidden sm:inline">
                        ({new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                      </span>
                    )}
                  </button>

                  <button
                    onClick={handleLiveSearchSync}
                    disabled={isLiveSyncing}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                    title="Verify live match statuses and scores via SportMonks & Gemini Search Grounding"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLiveSyncing ? 'animate-spin' : ''}`} />
                    <span>{isLiveSyncing ? 'Syncing...' : 'Live Search Sync'}</span>
                  </button>
                </div>
              </div>

              {/* Grounded Search Sync Feedback */}
              {syncError && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{syncError}</span>
                  </div>
                  <button onClick={() => setSyncError(null)} className="text-rose-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {groundedSyncResult && (
                <div className="p-4 rounded-xl bg-slate-900 border border-teal-800/60 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold text-teal-300">
                      <Globe className="w-4 h-4 text-teal-400" />
                      <span>Search Verified ({groundedSyncResult.dateChecked})</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(groundedSyncResult.syncedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <button
                      onClick={() => setGroundedSyncResult(null)}
                      className="text-slate-400 hover:text-white"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-slate-200 leading-relaxed">{groundedSyncResult.summary}</p>
                  {groundedSyncResult.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[11px] font-medium text-slate-400">Sources:</span>
                      {groundedSyncResult.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200 underline underline-offset-2 text-[11px]"
                        >
                          <span className="truncate max-w-[180px]">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Compact Won / Lost / Pending Bar Graph Snapshot */}
              <PredictionOutcomeBarGraph
                fixtures={fixtures}
                compact
                onNavigateToFullCalibration={() => setActiveTab('calibration')}
              />

              {/* Compact Unified Filter & Market Toolbar */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3">
                {/* Row 0: World Region Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-800/70">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Region:
                  </span>
                  {WORLD_REGIONS.map((reg) => {
                    const isSelected = selectedRegion === reg;
                    const count = reg === 'ALL'
                      ? fixtures.length
                      : fixtures.filter((f) => f.competition.region === reg).length;
                    const badgeMap: Record<string, string> = {
                      ALL: '🌐',
                      Europe: '🇪🇺',
                      Americas: '🌎',
                      Africa: '🌍',
                      'Asia & Oceania': '🌏',
                      International: '🏆',
                    };
                    return (
                      <button
                        key={reg}
                        onClick={() => {
                          setSelectedRegion(reg);
                          if (reg !== 'ALL' && selectedCompetition !== 'ALL') {
                            const comp = COMPETITIONS.find((c) => c.id === selectedCompetition);
                            if (comp && comp.region !== reg) {
                              setSelectedCompetition('ALL');
                            }
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-950'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        <span>{badgeMap[reg] || '⚽'}</span>
                        <span>{reg === 'ALL' ? 'All World' : reg}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                            isSelected
                              ? 'bg-emerald-700/80 text-white'
                              : 'bg-slate-900 text-slate-500'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Row 1: Search, League Dropdown, Status Segmented Control */}
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search team, country, or league..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <select
                    value={selectedCompetition}
                    onChange={(e) => setSelectedCompetition(e.target.value)}
                    aria-label="Filter by competition"
                    className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer max-w-[260px] truncate"
                  >
                    <option value="ALL">
                      All Leagues ({fixtures.filter((f) => selectedRegion === 'ALL' || f.competition.region === selectedRegion).length})
                    </option>
                    {selectedRegion === 'ALL' ? (
                      <>
                        <optgroup label="🇪🇺 Europe Top Flight">
                          {COMPETITIONS.filter((c) => c.region === 'Europe').map((c) => {
                            const count = fixtures.filter((f) => f.competition.id === c.id).length;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.logo} {c.name} {count > 0 ? `(${count})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="🌎 Americas">
                          {COMPETITIONS.filter((c) => c.region === 'Americas').map((c) => {
                            const count = fixtures.filter((f) => f.competition.id === c.id).length;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.logo} {c.name} {count > 0 ? `(${count})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="🌍 Africa">
                          {COMPETITIONS.filter((c) => c.region === 'Africa').map((c) => {
                            const count = fixtures.filter((f) => f.competition.id === c.id).length;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.logo} {c.name} {count > 0 ? `(${count})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="🌏 Asia & Oceania">
                          {COMPETITIONS.filter((c) => c.region === 'Asia & Oceania').map((c) => {
                            const count = fixtures.filter((f) => f.competition.id === c.id).length;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.logo} {c.name} {count > 0 ? `(${count})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                        <optgroup label="🏆 International Tournaments">
                          {COMPETITIONS.filter((c) => c.region === 'International').map((c) => {
                            const count = fixtures.filter((f) => f.competition.id === c.id).length;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.logo} {c.name} {count > 0 ? `(${count})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      </>
                    ) : (
                      COMPETITIONS.filter((c) => c.region === selectedRegion).map((c) => {
                        const count = fixtures.filter((f) => f.competition.id === c.id).length;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.logo} {c.name} {count > 0 ? `(${count})` : ''}
                          </option>
                        );
                      })
                    )}
                  </select>

                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 shrink-0">
                    {[
                      { id: 'ALL', label: 'All' },
                      { id: 'LIVE', label: 'Live' },
                      { id: 'NS', label: 'Upcoming' },
                      { id: 'FT', label: 'Settled' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setStatusFilter(st.id)}
                        className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                          statusFilter === st.id
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row 2: Active Market Selector */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">Market:</span>
                  {[
                    { id: '1X2', label: '1X2 Full Time' },
                    { id: '1X2_INTERVAL_10', label: '1X2 10m Interval (00:01–09:59)' },
                    { id: 'BTTS', label: 'BTTS' },
                    { id: 'OVER_UNDER_25', label: 'Over / Under 2.5' },
                    { id: 'DOUBLE_CHANCE', label: 'Double Chance' },
                    { id: 'HT_FT', label: 'HT / FT 9-Way' },
                  ].map((m) => {
                    const isSelected = activeMarket === m.id;
                    const isInterval = m.id === '1X2_INTERVAL_10';
                    return (
                      <button
                        key={m.id}
                        onClick={() => setActiveMarket(m.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                          isSelected
                            ? isInterval
                              ? 'bg-amber-600 border-amber-500 text-white'
                              : 'bg-emerald-600 border-emerald-500 text-white'
                            : isInterval
                            ? 'bg-amber-950/30 border-amber-800/70 text-amber-300 hover:bg-amber-950/60'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Clean 2-Column Match Grid with Skeleton Loading State */}
              {fixtures.length === 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5" aria-label="Loading fixtures">
                  {[0, 1, 2, 3].map((slot) => (
                    <div
                      key={slot}
                      className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 animate-pulse"
                    >
                      <div className="h-3 w-48 bg-slate-800 rounded" />
                      <div className="flex items-center justify-between py-3">
                        <div className="h-5 w-32 bg-slate-800 rounded" />
                        <div className="h-5 w-10 bg-slate-800 rounded" />
                        <div className="h-5 w-32 bg-slate-800 rounded" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="h-14 bg-slate-950 border border-slate-800 rounded-xl" />
                        <div className="h-14 bg-slate-950 border border-slate-800 rounded-xl" />
                        <div className="h-14 bg-slate-950 border border-slate-800 rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredFixtures.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {filteredFixtures.map((fixture) => (
                    <FixtureCard
                      key={fixture.id}
                      fixture={fixture}
                      activeMarket={activeMarket}
                      selectedTimezone={selectedTimezone}
                      oddsFormat={oddsFormat}
                      onSelectFixture={(f) => setSelectedFixture(f)}
                      onOpenScout={handleOpenScout}
                      onOpenVeo={handleLaunchVeo}
                      onOpenChat={handleOpenChat}
                      onSelectMarket={setActiveMarket}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <AlertCircle className="w-9 h-9 text-slate-500 mx-auto" />
                  <h3 className="text-base font-bold text-slate-200">
                    No fixtures match active filters
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Clear competition filters or search keywords to restore the full matchday catalog.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedRegion('ALL');
                      setSelectedCompetition('ALL');
                      setStatusFilter('ALL');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>
          )}

          <ErrorBoundary
            key={activeTab}
            fallbackTitle="This FootballIQ workspace section encountered an error"
            onResetHome={() => setActiveTab('fixtures')}
          >
            {activeTab === 'scout' && (
              <TacticalScoutView
                fixtures={fixtures}
                onSelectFixtureForDeepDive={(f) => setSelectedFixture(f)}
              />
            )}

            {activeTab === 'chat' && (
              <GeminiChatView
                fixtures={fixtures}
                initialFixture={selectedFixtureForChat}
                user={user}
              />
            )}

            {activeTab === 'veo' && (
              <VeoStudioView selectedFixture={selectedFixture} user={user} />
            )}

            {activeTab === 'calibration' && (
              <CalibrationView fixtures={fixtures} user={user} />
            )}

            {activeTab === 'admin' && (
              <AdminConsoleView
                user={user}
                fixtures={fixtures}
                syncJobs={syncJobs}
                lastSyncedAt={lastSyncedAt}
                autoSyncEnabled={autoSyncEnabled}
                onToggleAutoSync={handleToggleAutoSync}
                onTriggerSync={handleTriggerSync}
              />
            )}

            {activeTab === 'methodology' && <MethodologyView />}
          </ErrorBoundary>
        </main>

        {/* Quiet Transparency Footer */}
        <footer className="border-t border-slate-900 bg-slate-950 py-6 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-center sm:text-left">
              <span className="font-semibold text-slate-300">FootballIQ</span>
              <span className="mx-2">·</span>
              <span>Statistical Bivariate Poisson &amp; Dixon-Coles research platform. Outcomes are never guaranteed.</span>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <button
                onClick={() => setActiveTab('methodology')}
                className="hover:text-slate-300 transition-colors"
              >
                Methodology
              </button>
              <button
                onClick={() => setActiveTab('calibration')}
                className="hover:text-slate-300 transition-colors"
              >
                Calibration &amp; Graphs
              </button>
              <span className="font-mono text-slate-400">{selectedTimezone}</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Match Detail Modal */}
      <MatchDetailModal
        fixture={selectedFixture}
        onClose={() => setSelectedFixture(null)}
        selectedTimezone={selectedTimezone}
        oddsFormat={oddsFormat}
        onLaunchVeo={handleLaunchVeo}
        onOpenChat={handleOpenChat}
      />

      {/* Google Drive Cloud Storage & Sync Modal */}
      <GoogleDriveSyncModal
        isOpen={isGoogleDriveOpen}
        onClose={() => setIsGoogleDriveOpen(false)}
        fixtures={fixtures}
        user={user}
      />

      {/* PWA Mobile / Android Home Screen Installation Prompt */}
      <InstallPwaBanner />
    </div>
  );
}
