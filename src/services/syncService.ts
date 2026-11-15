import {
  Fixture,
  FixtureStatus,
  PersistedFixtureUpdate,
  SyncJobRecord,
} from '../types/football';
import { settleCompletedFixture } from './calibration';

const FIXTURE_CACHE_KEY = 'footballiq_synced_fixtures_v3';
const SYNC_JOBS_CACHE_KEY = 'footballiq_sync_jobs_v2';

const STATUS_RANK: Record<FixtureStatus, number> = {
  NS: 0,
  LIVE: 1,
  HT: 2,
  FT: 3,
  POSTP: 3,
  CANC: 3,
};

function normalizeTeamKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isValidScoreNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 50;
}

/**
 * Deterministically merges verified fixture updates into baseline fixtures while
 * enforcing monotonic match progression, valid score bounds, and HT preservation.
 */
export function mergeFixtureUpdates(
  baseFixtures: Fixture[],
  updates: PersistedFixtureUpdate[]
): Fixture[] {
  if (!Array.isArray(updates) || updates.length === 0) {
    return baseFixtures.map((f) => settleCompletedFixture(f));
  }

  return baseFixtures.map((f) => {
    const matchedUpdate = updates.find(
      (u) =>
        (u.fixtureId && u.fixtureId === f.id) ||
        (u.homeTeamName &&
          u.awayTeamName &&
          normalizeTeamKey(u.homeTeamName) === normalizeTeamKey(f.homeTeam.name) &&
          normalizeTeamKey(u.awayTeamName) === normalizeTeamKey(f.awayTeam.name))
    );

    if (!matchedUpdate) {
      return settleCompletedFixture(f);
    }

    const currentRank = STATUS_RANK[f.status] ?? 0;
    const incomingRank = STATUS_RANK[matchedUpdate.status] ?? 0;

    // Monotonic status check: never regress FT/POSTP/CANC back to NS/LIVE
    const allowStatusAdvance = incomingRank > currentRank;
    const sameRankNewer =
      incomingRank === currentRank &&
      matchedUpdate.lastUpdatedUtc > f.lastUpdatedUtc;

    if (!allowStatusAdvance && !sameRankNewer) {
      return settleCompletedFixture(f);
    }

    const nextStatus = allowStatusAdvance ? matchedUpdate.status : f.status;

    const nextHome = isValidScoreNumber(matchedUpdate.scores?.currentHome)
      ? matchedUpdate.scores.currentHome
      : f.scores.currentHome;
    const nextAway = isValidScoreNumber(matchedUpdate.scores?.currentAway)
      ? matchedUpdate.scores.currentAway
      : f.scores.currentAway;

    const nextHtHome = isValidScoreNumber(matchedUpdate.scores?.htHome)
      ? matchedUpdate.scores.htHome
      : f.scores.htHome;
    const nextHtAway = isValidScoreNumber(matchedUpdate.scores?.htAway)
      ? matchedUpdate.scores.htAway
      : f.scores.htAway;

    const nextMinute =
      typeof matchedUpdate.scores?.minute === 'number' &&
      matchedUpdate.scores.minute >= 0 &&
      matchedUpdate.scores.minute <= 140
        ? matchedUpdate.scores.minute
        : nextStatus === 'FT'
        ? undefined
        : f.scores.minute;

    const updatedFixture: Fixture = {
      ...f,
      status: nextStatus,
      scores: {
        currentHome: nextHome,
        currentAway: nextAway,
        ...(typeof nextHtHome === 'number' ? { htHome: nextHtHome } : {}),
        ...(typeof nextHtAway === 'number' ? { htAway: nextHtAway } : {}),
        ...(typeof nextMinute === 'number' ? { minute: nextMinute } : {}),
      },
      lastUpdatedUtc:
        matchedUpdate.lastUpdatedUtc > f.lastUpdatedUtc
          ? matchedUpdate.lastUpdatedUtc
          : f.lastUpdatedUtc,
      syncSource: matchedUpdate.syncSource || f.syncSource,
    };

    return settleCompletedFixture(updatedFixture);
  });
}

export function extractPersistedUpdates(fixtures: Fixture[]): PersistedFixtureUpdate[] {
  return fixtures.map((f) => ({
    fixtureId: f.id,
    homeTeamName: f.homeTeam.name,
    awayTeamName: f.awayTeam.name,
    competitionId: f.competition.id,
    kickoffTimeUtc: f.kickoffTimeUtc,
    status: f.status,
    scores: {
      currentHome: f.scores.currentHome,
      currentAway: f.scores.currentAway,
      ...(typeof f.scores.htHome === 'number' ? { htHome: f.scores.htHome } : {}),
      ...(typeof f.scores.htAway === 'number' ? { htAway: f.scores.htAway } : {}),
      ...(typeof f.scores.minute === 'number' ? { minute: f.scores.minute } : {}),
    },
    lastUpdatedUtc: f.lastUpdatedUtc,
    syncSource: f.syncSource || 'FootballIQ-Baseline',
  }));
}

export function saveFixtureUpdatesToCache(fixtures: Fixture[]): void {
  try {
    const payload = extractPersistedUpdates(fixtures);
    localStorage.setItem(FIXTURE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadFixtureUpdatesFromCache(): PersistedFixtureUpdate[] {
  try {
    const raw = localStorage.getItem(FIXTURE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSyncJobsToCache(jobs: SyncJobRecord[]): void {
  try {
    localStorage.setItem(SYNC_JOBS_CACHE_KEY, JSON.stringify(jobs.slice(0, 25)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSyncJobsFromCache(): SyncJobRecord[] {
  try {
    const raw = localStorage.getItem(SYNC_JOBS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface ServerSyncStateResponse {
  success: boolean;
  data: {
    fixtureUpdates: PersistedFixtureUpdate[];
    syncJobs: SyncJobRecord[];
    lastAutoSyncAt: string | null;
    nextAutoSyncAt: string | null;
    autoSyncIntervalMs: number;
    sportmonksConfigured: boolean;
  };
}

export async function fetchServerSyncState(): Promise<ServerSyncStateResponse['data'] | null> {
  try {
    const res = await fetch('/api/fixtures/state');
    if (!res.ok) return null;
    const payload: ServerSyncStateResponse = await res.json();
    if (!payload.success) return null;
    return payload.data;
  } catch {
    return null;
  }
}

export interface ServerSyncTriggerResponse {
  success: boolean;
  error?: string;
  data?: {
    job: SyncJobRecord;
    fixtureUpdates: PersistedFixtureUpdate[];
    syncJobs: SyncJobRecord[];
    lastAutoSyncAt: string | null;
    nextAutoSyncAt: string | null;
    summary: string;
    sources: { title: string; uri: string }[];
  };
}

export async function triggerServerFixtureSync(params: {
  fixtures: Fixture[];
  trigger: 'auto' | 'manual' | 'boot';
  dateLabel: string;
  forceExternal?: boolean;
}): Promise<ServerSyncTriggerResponse> {
  const res = await fetch('/api/fixtures/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trigger: params.trigger,
      dateLabel: params.dateLabel,
      forceExternal: Boolean(params.forceExternal),
      fixtures: params.fixtures.map((f) => ({
        fixtureId: f.id,
        homeTeam: f.homeTeam.name,
        awayTeam: f.awayTeam.name,
        competitionId: f.competition.id,
        competition: f.competition.name,
        kickoffTimeUtc: f.kickoffTimeUtc,
        status: f.status,
        scores: f.scores,
        lastUpdatedUtc: f.lastUpdatedUtc,
      })),
    }),
  });
  return res.json();
}
