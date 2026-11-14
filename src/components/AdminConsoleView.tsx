import React, { useState } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  AlertTriangle, 
  Database, 
  Key, 
  Users, 
  Clock, 
  Server,
  Activity,
  Layers
} from 'lucide-react';
import { sportmonksService, SyncResult } from '../services/sportmonksAdapter';
import { Fixture, SyncJobRecord } from '../types/football';
import { UserProfile, ADMIN_EMAIL } from '../services/firebase';

interface AdminConsoleViewProps {
  user: UserProfile | null;
  fixtures: Fixture[];
  syncJobs?: SyncJobRecord[];
  lastSyncedAt?: string | null;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
  onTriggerSync: () => Promise<void>;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({
  user,
  fixtures,
  syncJobs = [],
  lastSyncedAt = null,
  autoSyncEnabled = true,
  onToggleAutoSync,
  onTriggerSync,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Check admin rights
  if (!user || user.email !== ADMIN_EMAIL) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-950 text-rose-400 flex items-center justify-center mx-auto border border-rose-800">
          <XCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white">Administrator Access Required</h2>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Administrative control is restricted to verified root credentials ({ADMIN_EMAIL}). Please sign in with your authorized Google account.
        </p>
      </div>
    );
  }

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      if (tokenInput.trim()) {
        sportmonksService.setToken(tokenInput.trim());
      }
      const res = await sportmonksService.testConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message, latencyMs: 0 });
    } finally {
      setIsTesting(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setIsSyncing(true);
      await onTriggerSync();
      const res = await sportmonksService.synchronizeFixtures(fixtures);
      setLastSyncResult(res.syncResult);
    } catch (err: any) {
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const dataQualityStats = {
    valid: fixtures.filter(f => f.dataQuality === 'VALID').length,
    limited: fixtures.filter(f => f.dataQuality === 'LIMITED_DATA').length,
    stale: fixtures.filter(f => f.dataQuality === 'STALE').length,
    abstained: fixtures.filter(f => f.prediction?.isAbstained).length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-950 border border-amber-800/40 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-bold uppercase tracking-wider text-amber-400">
              Administration &amp; Observability
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-slate-400">Authenticated: {user.email}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            System Monitor & Data Provider Gateway
          </h2>
          <p className="text-sm text-slate-300">
            Monitor football data feed ingestion, test SportMonks Football API v3 connectivity, audit data quality gates, and manage prediction model deployments.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Provider Config & Sync */}
        <div className="lg:col-span-6 space-y-6">
          {/* SportMonks API Configuration */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Server className="w-4 h-4 text-amber-400" />
                SportMonks Football API v3 Gateway
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                sportmonksService.isConfigured() ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
              }`}>
                {sportmonksService.isConfigured() ? 'Connected' : 'Historical Fallback'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  API Token Mask (Configured: {sportmonksService.getMaskedToken()})
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      placeholder="Enter SportMonks API Token (v3)..."
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    {isTesting && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>Test Connection</span>
                  </button>
                </div>
              </div>

              {testResult && (
                <div className={`p-3 rounded-2xl border text-xs flex items-start gap-2 ${
                  testResult.ok ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}>
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">{testResult.message}</p>
                    {testResult.latencyMs > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Roundtrip Latency: {testResult.latencyMs}ms
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Manual & Auto Sync Trigger */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  Automatic &amp; Manual Result Ingestion
                </p>
                <p className="text-[11px] text-slate-400">
                  Background scheduler reconciles every 60s
                  {lastSyncedAt ? ` · Last run: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onToggleAutoSync && (
                  <button
                    onClick={onToggleAutoSync}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                      autoSyncEnabled
                        ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {autoSyncEnabled ? 'Auto-Sync: ON' : 'Auto-Sync: PAUSED'}
                  </button>
                )}
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-950/40 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Sync Fixtures Now'}</span>
                </button>
              </div>
            </div>

            {lastSyncResult && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-850 text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>{lastSyncResult.message}</span>
                  <span className="font-mono text-emerald-400">{lastSyncResult.fixturesCount} fixtures</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Timestamp: {new Date(lastSyncResult.timestamp).toLocaleString()} ({lastSyncResult.latencyMs}ms)
                </div>
              </div>
            )}
          </div>

          {/* Model Deployment & Artifacts */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Active Prediction Engine Specification
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Active Model Version:</span>
                <span className="font-mono font-bold text-emerald-400">v2.4-dixon-coles-poisson</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Low-Score Tau Parameter (ρ):</span>
                <span className="font-mono font-bold text-slate-200">-0.09 (Calibrated)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Temporal Leakage Enforcement:</span>
                <span className="font-mono font-bold text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Strict Pre-Kickoff
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Veo Video Model:</span>
                <span className="font-mono font-bold text-purple-300">veo-3.1-fast-generate-preview</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Search Grounding Model:</span>
                <span className="font-mono font-bold text-teal-300">gemini-4-hydrogen (googleSearch)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-850 gap-2">
                <span className="text-slate-400">Multi-Model Chat Router:</span>
                <span className="font-mono font-bold text-emerald-300 text-right">
                  4-carbon • 4-argon • 4-hydrogen • 3.1-flash-lite
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Data Quality Gate & Audit Events */}
        <div className="lg:col-span-6 space-y-6">
          {/* Data Quality Gate Monitor */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Data-Quality Gate & Coverage
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Fully Validated</span>
                <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                  {dataQualityStats.valid}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Limited Coverage</span>
                <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                  {dataQualityStats.limited}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Stale Flagged</span>
                <div className="text-2xl font-black font-mono text-slate-400 mt-1">
                  {dataQualityStats.stale}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400">Model Abstained</span>
                <div className="text-2xl font-black font-mono text-rose-400 mt-1">
                  {dataQualityStats.abstained}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-850 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-200">Abstention Policy Active</p>
              <p className="text-[11px] leading-relaxed">
                Matches lacking adequate rolling sample size or conflicting scorelines automatically trigger model abstention instead of fabricating random percentages.
              </p>
            </div>
          </div>

          {/* Security & Audit Events */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              Identity & Access Verification
            </h3>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Root Super Admin:</span>
                <span className="font-mono text-emerald-400 font-bold">{ADMIN_EMAIL}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Firebase Firestore Database:</span>
                <span className="font-mono text-slate-300">Enterprise Edition Provisioned</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">ABAC Security Rules:</span>
                <span className="font-mono text-emerald-400">Deployed (8-Pillars Hardened)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Default Display Timezone:</span>
                <span className="font-mono text-slate-300">Africa/Kampala (UTC+3)</span>
              </div>
            </div>
          </div>

          {/* Persisted Synchronization Audit Log */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Stored Synchronization Audit Log
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                {syncJobs.length} recorded runs
              </span>
            </div>

            {syncJobs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {syncJobs.slice(0, 10).map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-850 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-200">
                        [{job.trigger.toUpperCase()}] {job.provider}
                      </span>
                      <span
                        className={`font-mono text-[10px] font-bold uppercase ${
                          job.status === 'success'
                            ? 'text-emerald-400'
                            : job.status === 'failed'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {job.status} · {job.recordsSynced} rec
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{job.message}</p>
                    <div className="text-[10px] font-mono text-slate-500">
                      {new Date(job.completedAt || job.startedAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No sync jobs recorded yet. Automatic or manual sync runs will appear here once stored.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
