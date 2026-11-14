import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SyncStatus = 'NS' | 'LIVE' | 'HT' | 'FT' | 'POSTP' | 'CANC';

export interface ServerMatchScores {
  currentHome: number;
  currentAway: number;
  htHome?: number;
  htAway?: number;
  minute?: number;
}

export interface ServerFixtureUpdate {
  fixtureId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionId: string;
  kickoffTimeUtc: string;
  status: SyncStatus;
  scores: ServerMatchScores;
  lastUpdatedUtc: string;
  syncSource: string;
}

export interface TrackedFixtureMeta {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  competitionId: string;
  competition: string;
  kickoffTimeUtc: string;
}

export interface ServerSyncJob {
  id: string;
  provider: string;
  trigger: 'auto' | 'manual' | 'boot';
  status: 'success' | 'failed' | 'running';
  recordsSynced: number;
  message: string;
  startedAt: string;
  completedAt: string;
  sources?: { title: string; uri: string }[];
}

export interface PersistedServerStore {
  fixtureUpdates: Record<string, ServerFixtureUpdate>;
  trackedFixtures: TrackedFixtureMeta[];
  syncJobs: ServerSyncJob[];
  lastAutoSyncAt: string | null;
  lastExternalSearchEpochMs: number;
  dateLabel: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '..', '.data');
export const STORE_PATH = path.resolve(DATA_DIR, 'sync_state.json');
export const AUTO_SYNC_INTERVAL_MS = 60_000;
export const EXTERNAL_SEARCH_COOLDOWN_MS = 5 * 60_000;

export const STATUS_RANK: Record<SyncStatus, number> = {
  NS: 0,
  LIVE: 1,
  HT: 2,
  FT: 3,
  POSTP: 3,
  CANC: 3,
};

export const VALID_SYNC_STATUSES: SyncStatus[] = ['NS', 'LIVE', 'HT', 'FT', 'POSTP', 'CANC'];

export function normalizeTeamKey(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseScorePair(scoreText?: string): { home: number; away: number } | null {
  if (!scoreText || typeof scoreText !== 'string') return null;
  const m = scoreText.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!m) return null;
  const home = parseInt(m[1], 10);
  const away = parseInt(m[2], 10);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || home > 50 || away < 0 || away > 50) {
    return null;
  }
  return { home, away };
}

export function loadServerStore(): PersistedServerStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        fixtureUpdates: parsed.fixtureUpdates || {},
        trackedFixtures: Array.isArray(parsed.trackedFixtures) ? parsed.trackedFixtures : [],
        syncJobs: Array.isArray(parsed.syncJobs) ? parsed.syncJobs : [],
        lastAutoSyncAt: parsed.lastAutoSyncAt || null,
        lastExternalSearchEpochMs: Number(parsed.lastExternalSearchEpochMs || 0),
        dateLabel: parsed.dateLabel || '14 November 2026',
      };
    }
  } catch (err) {
    console.warn('Warning loading sync_state.json, initializing fresh store:', err);
  }
  return {
    fixtureUpdates: {},
    trackedFixtures: [],
    syncJobs: [],
    lastAutoSyncAt: null,
    lastExternalSearchEpochMs: 0,
    dateLabel: '14 November 2026',
  };
}

export function saveServerStore(store: PersistedServerStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist .data/sync_state.json:', err);
  }
}

export function checkStoreHealth(): { storeWritable: boolean; persistedFixtures: number; syncJobsCount: number } {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
    return {
      storeWritable: true,
      persistedFixtures: Object.keys(serverStore.fixtureUpdates).length,
      syncJobsCount: serverStore.syncJobs.length,
    };
  } catch {
    return {
      storeWritable: false,
      persistedFixtures: Object.keys(serverStore.fixtureUpdates).length,
      syncJobsCount: serverStore.syncJobs.length,
    };
  }
}

export const serverStore: PersistedServerStore = loadServerStore();

export function upsertFixtureUpdate(incoming: ServerFixtureUpdate): boolean {
  const existing = serverStore.fixtureUpdates[incoming.fixtureId];
  if (!existing) {
    serverStore.fixtureUpdates[incoming.fixtureId] = incoming;
    return true;
  }

  const existingRank = STATUS_RANK[existing.status] ?? 0;
  const incomingRank = STATUS_RANK[incoming.status] ?? 0;

  if (incomingRank < existingRank) {
    return false;
  }

  const safeHome = Number.isFinite(incoming.scores.currentHome)
    ? Math.max(0, Math.min(50, Math.round(incoming.scores.currentHome)))
    : existing.scores.currentHome;
  const safeAway = Number.isFinite(incoming.scores.currentAway)
    ? Math.max(0, Math.min(50, Math.round(incoming.scores.currentAway)))
    : existing.scores.currentAway;

  const scoreChanged =
    safeHome !== existing.scores.currentHome ||
    safeAway !== existing.scores.currentAway ||
    incoming.status !== existing.status ||
    (typeof incoming.scores.htHome === 'number' && incoming.scores.htHome !== existing.scores.htHome) ||
    (typeof incoming.scores.htAway === 'number' && incoming.scores.htAway !== existing.scores.htAway);

  const isFresher = incoming.lastUpdatedUtc > existing.lastUpdatedUtc;
  if (!scoreChanged && !isFresher && incomingRank === existingRank) {
    return false;
  }

  serverStore.fixtureUpdates[incoming.fixtureId] = {
    ...existing,
    status: incoming.status,
    scores: {
      currentHome: safeHome,
      currentAway: safeAway,
      ...(typeof incoming.scores.htHome === 'number'
        ? { htHome: Math.max(0, Math.min(50, Math.round(incoming.scores.htHome))) }
        : typeof existing.scores.htHome === 'number'
        ? { htHome: existing.scores.htHome }
        : {}),
      ...(typeof incoming.scores.htAway === 'number'
        ? { htAway: Math.max(0, Math.min(50, Math.round(incoming.scores.htAway))) }
        : typeof existing.scores.htAway === 'number'
        ? { htAway: existing.scores.htAway }
        : {}),
      ...(typeof incoming.scores.minute === 'number'
        ? { minute: Math.max(0, Math.min(140, Math.round(incoming.scores.minute))) }
        : incoming.status === 'FT'
        ? {}
        : typeof existing.scores.minute === 'number'
        ? { minute: existing.scores.minute }
        : {}),
    },
    lastUpdatedUtc:
      incoming.lastUpdatedUtc > existing.lastUpdatedUtc
        ? incoming.lastUpdatedUtc
        : existing.lastUpdatedUtc,
    syncSource: incoming.syncSource || existing.syncSource,
  };
  return scoreChanged;
}

export function recordSyncJob(job: ServerSyncJob): void {
  serverStore.syncJobs = [job, ...serverStore.syncJobs].slice(0, 30);
}
