import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMatchLifecycle } from '../src/services/fixtureClassifier.ts';
import { settleCompletedFixture, computeOutcomeDistribution } from '../src/services/calibration.ts';
import { settleFixtureRecord, batchSettleFixtures } from '../src/services/settlementService.ts';
import { runServerAutoSettlement } from '../server/settlementEngine.ts';
import { serverStore } from '../server/store.ts';
import { getFixtureLocalDate, getLocalDateString } from '../src/utils/timezone.ts';
import { getInitialFixtures } from '../src/services/mockHistoricalData.ts';
import { Fixture } from '../src/types/football.ts';

describe('Phase 10 Verification: Scheduling, Live Results, Automatic Settlement & Calibration', () => {
  const referenceDate = new Date('2026-11-15T12:00:00Z'); // 15 Nov 2026 12:00 UTC (15:00 Kampala EAT)
  const kampalaTz = 'Africa/Kampala';

  // Scenario 1: Yesterday's match is never in upcoming
  it('Scenario 1: Completed match from yesterday is never classified as UPCOMING', () => {
    const yesterdayFixture = {
      kickoffTimeUtc: '2026-11-14T14:00:00Z',
      status: 'NS', // stale provider status
      scores: { currentHome: 2, currentAway: 1 },
    };

    const lifecycle = resolveMatchLifecycle(yesterdayFixture, referenceDate, kampalaTz);
    assert.notEqual(lifecycle.category, 'UPCOMING', "Yesterday's match must not be classified as UPCOMING");
    assert.equal(lifecycle.category, 'COMPLETED', "Yesterday's match with scores must be classified as COMPLETED");
    assert.equal(lifecycle.isPast, true);
    assert.equal(lifecycle.isSettlable, true);
  });

  // Scenario 2: Genuinely future match is upcoming
  it('Scenario 2: Genuinely future match is classified as UPCOMING', () => {
    const futureFixture = {
      kickoffTimeUtc: '2026-11-15T18:00:00Z', // 6 hours in the future
      status: 'NS',
      scores: { currentHome: 0, currentAway: 0 },
    };

    const lifecycle = resolveMatchLifecycle(futureFixture, referenceDate, kampalaTz);
    assert.equal(lifecycle.category, 'UPCOMING');
    assert.equal(lifecycle.effectiveStatus, 'NS');
    assert.equal(lifecycle.isSettlable, false);
    assert.equal(lifecycle.isToday, true);
  });

  // Scenario 3: Verified in-progress match is live
  it('Scenario 3: Verified in-progress match is classified as LIVE with minute tracking', () => {
    const liveFixture = {
      kickoffTimeUtc: '2026-11-15T11:30:00Z', // 30 minutes ago
      status: 'LIVE',
      scores: { currentHome: 1, currentAway: 0, minute: 30 },
    };

    const lifecycle = resolveMatchLifecycle(liveFixture, referenceDate, kampalaTz);
    assert.equal(lifecycle.category, 'LIVE');
    assert.equal(lifecycle.effectiveStatus, 'LIVE');
    assert.equal(lifecycle.isSettlable, false);
  });

  // Scenario 4: Verified full-time match is completed
  it('Scenario 4: Verified full-time match is classified as COMPLETED', () => {
    const completedFixture = {
      kickoffTimeUtc: '2026-11-15T09:00:00Z', // 3 hours ago
      status: 'FT',
      scores: { currentHome: 3, currentAway: 1 },
    };

    const lifecycle = resolveMatchLifecycle(completedFixture, referenceDate, kampalaTz);
    assert.equal(lifecycle.category, 'COMPLETED');
    assert.equal(lifecycle.effectiveStatus, 'FT');
    assert.equal(lifecycle.isSettlable, true);
  });

  // Scenario 5: Automatic settlement of completed matches
  it('Scenario 5: Automatically settles completed matches without manual intervention', () => {
    const baseline = getInitialFixtures();
    const completedFixture = baseline.find((f) => f.status === 'FT');
    assert.ok(completedFixture, 'Expected at least one completed fixture in baseline');

    const result = settleFixtureRecord(completedFixture);
    assert.ok(result.settlement, 'Fixture must have settlement generated');
    assert.ok(result.settlement.verifiedAt, 'Settlement must include ISO timestamp');
    assert.ok(['WON', 'LOST'].includes(result.settlement.status), 'Settlement status must be WON or LOST');
  });

  // Scenario 6: Correct market grading across all 6 primary markets
  it('Scenario 6: Accurately grades 1X2, Double Chance, BTTS, O/U 2.5, HT/FT, and 10m Interval', () => {
    const mockFixture: Fixture = {
      id: 'test-fix-settle-01',
      competition: { id: 'pl', name: 'Premier League', country: 'England', region: 'Europe', flag: '🇬🇧', tier: 1 },
      homeTeam: { id: 'ars', name: 'Arsenal', shortName: 'ARS', logo: '', country: 'England', attackRating: 1.8, defenseRating: 0.9, formLast5: ['W', 'W', 'W', 'D', 'W'] },
      awayTeam: { id: 'che', name: 'Chelsea', shortName: 'CHE', logo: '', country: 'England', attackRating: 1.4, defenseRating: 1.2, formLast5: ['W', 'L', 'W', 'D', 'L'] },
      kickoffTimeUtc: '2026-11-15T10:00:00Z',
      status: 'FT',
      scores: {
        currentHome: 2,
        currentAway: 1,
        htHome: 1,
        htAway: 0,
        interval10Home: 0,
        interval10Away: 0,
      },
      lastUpdatedUtc: '2026-11-15T12:00:00Z',
      dataQuality: 'VALID',
      prediction: {
        modelId: 'dixon-coles-poisson',
        modelVersion: 'v2.4',
        generatedAt: '2026-11-15T09:00:00Z',
        isAbstained: false,
        confidence: 0.72,
        dataQuality: 'VALID',
        market1X2: { homeWin: 0.55, draw: 0.25, awayWin: 0.20, predictedOutcome: '1' },
        marketDoubleChance: { '1X': 0.80, '12': 0.75, 'X2': 0.45, predictedOutcome: '1X' },
        marketBTTS: { yes: 0.60, no: 0.40, predictedOutcome: 'YES' },
        marketOverUnder25: { over: 0.58, under: 0.42, predictedOutcome: 'OVER' },
        marketHtFt: {
          probabilities: { HH: 0.35, HD: 0.05, HA: 0.02, DH: 0.15, DD: 0.20, DA: 0.08, AH: 0.03, AD: 0.04, AA: 0.08 },
          predictedOutcome: 'HH',
        },
        marketInterval10: {
          predictedOutcome: 'X',
          intervalProbabilities: { homeLeading: 0.12, draw: 0.80, awayLeading: 0.08 },
        },
      },
    };

    const graded = settleFixtureRecord(mockFixture);
    const markets = graded.settlement!.settledMarkets;

    // Actual score: 2-1 (HT: 1-0, 10m: 0-0)
    // 1X2: Home Win (1) -> Predicted 1 -> WON
    assert.equal(markets.market1X2, 'WON');
    // Double Chance: 1X or 12 -> Predicted 1X -> WON
    assert.equal(markets.marketDoubleChance, 'WON');
    // BTTS: 2 > 0 && 1 > 0 -> YES -> Predicted YES -> WON
    assert.equal(markets.marketBTTS, 'WON');
    // O/U 2.5: 2 + 1 = 3 >= 2.5 -> OVER -> Predicted OVER -> WON
    assert.equal(markets.marketOverUnder25, 'WON');
    // HT/FT: HT 1-0 (H), FT 2-1 (H) -> HH -> Predicted HH -> WON
    assert.equal(markets.marketHtFt, 'WON');
    // 10m Interval: 0-0 (X) -> Predicted X -> WON
    assert.equal(markets.market1X2Interval10, 'WON');
  });

  // Scenario 7: Result correction and idempotency
  it('Scenario 7: Re-settling an already-settled match is idempotent and produces no duplicates', () => {
    const baseline = getInitialFixtures();
    const fix = baseline.find((f) => f.status === 'FT')!;

    const run1 = settleFixtureRecord(fix);
    const run2 = settleFixtureRecord(run1);

    assert.equal(run1.settlement?.status, run2.settlement?.status);
    assert.equal(run1.settlement?.actualScore, run2.settlement?.actualScore);
    assert.deepEqual(run1.settlement?.settledMarkets, run2.settlement?.settledMarkets);
  });

  // Scenario 8: Provider failure handling & Void policy
  it('Scenario 8: Postponed or cancelled fixtures are strictly marked VOID without data loss', () => {
    const postpFixture: Fixture = {
      id: 'test-fix-postp',
      competition: { id: 'unl', name: 'Nations League', country: 'Europe', region: 'Europe', flag: '🇪🇺', tier: 1 },
      homeTeam: { id: 'fra', name: 'France', shortName: 'FRA', logo: '', country: 'France', attackRating: 1.9, defenseRating: 0.8, formLast5: ['W', 'W', 'W', 'D', 'W'] },
      awayTeam: { id: 'ita', name: 'Italy', shortName: 'ITA', logo: '', country: 'Italy', attackRating: 1.5, defenseRating: 1.0, formLast5: ['W', 'D', 'W', 'L', 'W'] },
      kickoffTimeUtc: '2026-11-15T19:45:00Z',
      status: 'POSTP',
      scores: { currentHome: 0, currentAway: 0 },
      lastUpdatedUtc: '2026-11-15T12:00:00Z',
      dataQuality: 'VALID',
      prediction: {
        modelId: 'dixon-coles-poisson',
        modelVersion: 'v2.4',
        generatedAt: '2026-11-15T09:00:00Z',
        isAbstained: false,
        confidence: 0.65,
        dataQuality: 'VALID',
        market1X2: { homeWin: 0.50, draw: 0.30, awayWin: 0.20, predictedOutcome: '1' },
        marketDoubleChance: { '1X': 0.80, '12': 0.70, 'X2': 0.50, predictedOutcome: '1X' },
        marketBTTS: { yes: 0.55, no: 0.45, predictedOutcome: 'YES' },
        marketOverUnder25: { over: 0.52, under: 0.48, predictedOutcome: 'OVER' },
        marketHtFt: { probabilities: { HH: 0.30, HD: 0.10, HA: 0.05, DH: 0.20, DD: 0.20, DA: 0.05, AH: 0.03, AD: 0.03, AA: 0.04 }, predictedOutcome: 'HH' },
      },
    };

    const graded = settleFixtureRecord(postpFixture);
    assert.equal(graded.settlement?.status, 'VOID');
    assert.equal(graded.settlement?.settledMarkets.market1X2, 'VOID');
    assert.equal(graded.settlement?.settledMarkets.marketBTTS, 'VOID');
  });

  // Scenario 9: Duplicate processing idempotency
  it('Scenario 9: Batch settlement is idempotent across multiple repeated executions', () => {
    const unsettled = getInitialFixtures().map((f) => {
      const copy = JSON.parse(JSON.stringify(f));
      if (copy.prediction) delete copy.prediction.settlement;
      delete copy.settlement;
      return copy;
    });

    const batch1 = batchSettleFixtures(unsettled);
    const batch2 = batchSettleFixtures(batch1.fixtures);

    assert.equal(batch1.settledCount, 26, 'Should settle all 26 completed fixtures in first run');
    assert.equal(batch2.settledCount, 0, 'Second run should not re-settle already settled fixtures');
    assert.equal(batch2.alreadySettledCount, 26, 'Second run should identify all 26 as already settled');
  });

  // Scenario 10: Calibration metrics calculation
  it('Scenario 10: Win rate denominator strictly equals Won + Lost, excluding pending fixtures', () => {
    const fixtures = getInitialFixtures();
    const dist = computeOutcomeDistribution(fixtures, 'ALL');

    assert.equal(dist.settledTotal, dist.won + dist.lost, 'settledTotal must equal won + lost');
    assert.ok(dist.pending > 0, 'Must have active pending fixtures for today');

    const expectedAccuracy = dist.settledTotal > 0 ? Number(((dist.won / dist.settledTotal) * 100).toFixed(1)) : 0;
    assert.equal(dist.settledAccuracyPct, expectedAccuracy, 'settledAccuracyPct must not divide by total with pending');
    assert.equal(dist.total, dist.won + dist.lost + dist.pending + dist.voided);
  });

  // Scenario 11: Timezone boundary & midnight rollover
  it('Scenario 11: Local midnight boundary correctly shifts dates for Africa/Kampala', () => {
    // 2026-11-14 21:30:00 UTC = 2026-11-15 00:30:00 EAT (Kampala)
    const lateUtc = '2026-11-14T21:30:00Z';
    const kampalaDate = getFixtureLocalDate(lateUtc, 'Africa/Kampala');
    const londonDate = getFixtureLocalDate(lateUtc, 'Europe/London');

    assert.equal(kampalaDate, '2026-11-15', '21:30 UTC is already 15 Nov in Kampala (UTC+3)');
    assert.equal(londonDate, '2026-11-14', '21:30 UTC is still 14 Nov in London (UTC+0)');
  });

  // Scenario 12: Historical integrity
  it('Scenario 12: Historical pre-match probabilities and predictions are never mutated after kickoff', () => {
    const baseline = getInitialFixtures();
    const completed = baseline.find((f) => f.status === 'FT')!;
    const originalPred = JSON.parse(JSON.stringify(completed.prediction));

    const settled = settleFixtureRecord(completed);

    // Probability values must remain strictly unchanged
    assert.deepEqual(settled.prediction?.market1X2.homeWin, originalPred.market1X2.homeWin);
    assert.deepEqual(settled.prediction?.market1X2.draw, originalPred.market1X2.draw);
    assert.deepEqual(settled.prediction?.market1X2.awayWin, originalPred.market1X2.awayWin);
    assert.deepEqual(settled.prediction?.marketBTTS, originalPred.marketBTTS);
    assert.deepEqual(settled.prediction?.marketOverUnder25, originalPred.marketOverUnder25);
  });
});
