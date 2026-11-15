import { Fixture, FixtureStatus } from '../types/football';
import { getFixtureLocalDate, getLocalDateString } from '../utils/timezone';

export type MatchLifecycleCategory =
  | 'UPCOMING'
  | 'LIVE'
  | 'COMPLETED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'ABANDONED'
  | 'SUSPENDED'
  | 'AWAITING_CONFIRMATION';

export interface MatchLifecycleResult {
  category: MatchLifecycleCategory;
  effectiveStatus: FixtureStatus;
  isSettlable: boolean;
  reason: string;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
}

/**
 * Resolves the lifecycle category and status of a match based on both
 * verified provider data and actual UTC kickoff timestamp vs wall-clock time.
 *
 * Guarantees:
 * - A match whose kickoff was in the past will NEVER be categorized as UPCOMING.
 * - Completed matches (FT) are recognized immediately for automatic settlement.
 * - Matches played yesterday are strictly distinguished from today's matches.
 */
export function resolveMatchLifecycle(
  fixture: {
    kickoffTimeUtc: string;
    status: FixtureStatus | string;
    scores?: { currentHome?: number; currentAway?: number; htHome?: number; htAway?: number; minute?: number };
  },
  now: Date = new Date(),
  timezone: string = 'Africa/Kampala'
): MatchLifecycleResult {
  const rawStatus = (fixture.status || 'NS').toUpperCase().trim();
  const todayDateStr = getLocalDateString(now, timezone);
  const fixtureDateStr = getFixtureLocalDate(fixture.kickoffTimeUtc, timezone);

  const isToday = fixtureDateStr === todayDateStr;
  const isPast = fixtureDateStr < todayDateStr;
  const isFuture = fixtureDateStr > todayDateStr;

  // 1. Explicit terminal statuses
  if (rawStatus === 'POSTP' || rawStatus === 'POSTPONED') {
    return {
      category: 'POSTPONED',
      effectiveStatus: 'POSTP',
      isSettlable: true,
      reason: 'Match officially postponed by competition authority.',
      isToday,
      isPast,
      isFuture,
    };
  }

  if (rawStatus === 'CANC' || rawStatus === 'CANCELLED') {
    return {
      category: 'CANCELLED',
      effectiveStatus: 'CANC',
      isSettlable: true,
      reason: 'Match officially cancelled.',
      isToday,
      isPast,
      isFuture,
    };
  }

  if (rawStatus === 'ABAN' || rawStatus === 'ABANDONED') {
    return {
      category: 'ABANDONED',
      effectiveStatus: 'CANC',
      isSettlable: true,
      reason: 'Match abandoned after kickoff.',
      isToday,
      isPast,
      isFuture,
    };
  }

  if (rawStatus === 'SUSP' || rawStatus === 'SUSPENDED') {
    return {
      category: 'SUSPENDED',
      effectiveStatus: 'LIVE',
      isSettlable: false,
      reason: 'Match temporarily suspended.',
      isToday,
      isPast,
      isFuture,
    };
  }

  if (rawStatus === 'FT' || rawStatus === 'AET' || rawStatus === 'PEN_FT') {
    return {
      category: 'COMPLETED',
      effectiveStatus: 'FT',
      isSettlable: true,
      reason: 'Match officially completed at full time.',
      isToday,
      isPast,
      isFuture,
    };
  }

  // 2. Evaluate against kickoff time
  const kickoffMs = Date.parse(fixture.kickoffTimeUtc);
  if (Number.isNaN(kickoffMs)) {
    return {
      category: 'UPCOMING',
      effectiveStatus: 'NS',
      isSettlable: false,
      reason: 'Invalid kickoff timestamp, treated as scheduled.',
      isToday,
      isPast,
      isFuture,
    };
  }

  const nowMs = now.getTime();
  const elapsedMinutes = (nowMs - kickoffMs) / 60000;

  // Kickoff is in the future
  if (elapsedMinutes < 0) {
    return {
      category: 'UPCOMING',
      effectiveStatus: 'NS',
      isSettlable: false,
      reason: `Match scheduled to kick off in ${Math.round(-elapsedMinutes)} minutes.`,
      isToday,
      isPast,
      isFuture,
    };
  }

  // Match started within the past 115 minutes (active match window: 45' 1H + 15' HT + 45' 2H + 10' stoppage)
  if (elapsedMinutes <= 115) {
    return {
      category: 'LIVE',
      effectiveStatus: rawStatus === 'HT' ? 'HT' : 'LIVE',
      isSettlable: false,
      reason: `Match currently in progress (~${Math.min(90, Math.max(1, Math.round(elapsedMinutes)))}').`,
      isToday,
      isPast,
      isFuture,
    };
  }

  // Match started > 115 minutes ago
  const scores = fixture.scores;
  const hasScores =
    typeof scores?.currentHome === 'number' &&
    typeof scores?.currentAway === 'number' &&
    (scores.currentHome > 0 || scores.currentAway > 0);

  if (hasScores || isPast) {
    return {
      category: 'COMPLETED',
      effectiveStatus: 'FT',
      isSettlable: true,
      reason: `Match completed (~${Math.round(elapsedMinutes)} minutes since kickoff).`,
      isToday,
      isPast,
      isFuture,
    };
  }

  // Kickoff has elapsed but final score is not yet confirmed by provider
  return {
    category: 'AWAITING_CONFIRMATION',
    effectiveStatus: 'NS',
    isSettlable: false,
    reason: `Kickoff elapsed (${Math.round(elapsedMinutes)}m ago), awaiting final score confirmation from provider.`,
    isToday,
    isPast,
    isFuture,
  };
}
