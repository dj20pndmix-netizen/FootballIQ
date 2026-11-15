import { 
  QuantitativePredictionEngine, 
  poissonPmf 
} from '../src/services/predictionEngine';
import { 
  getInitialFixtures, 
  COMPETITIONS 
} from '../src/services/mockHistoricalData';
import { computeEvaluationMetrics, computeOutcomeDistribution, settleCompletedFixture } from '../src/services/calibration';
import { formatFixtureTime } from '../src/utils/timezone';
import { mergeFixtureUpdates } from '../src/services/syncService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('FOOTBALLIQ QUANTITATIVE ENGINE TEST SUITE');
console.log('================================================================');

// 1. Poisson PMF Tests
console.log('\n--- 1. Poisson Probability Mass Function Tests ---');
const p0 = poissonPmf(0, 1.5);
const p1 = poissonPmf(1, 1.5);
const p2 = poissonPmf(2, 1.5);
assert(p0 > 0 && p0 < 1, 'P(0; 1.5) is within (0, 1)');
assert(Math.abs(p0 - 0.2231) < 0.001, `P(0; 1.5) = ${p0.toFixed(4)} matches analytical value 0.2231`);
assert(Math.abs(p1 - 0.3347) < 0.001, `P(1; 1.5) = ${p1.toFixed(4)} matches analytical value 0.3347`);

// 2. Score Matrix Normalization Tests
console.log('\n--- 2. Score Matrix Normalization & Dixon-Coles Tests ---');
const matrix = QuantitativePredictionEngine.computeScoreMatrix(1.8, 1.1, -0.09, 6);
let sumMatrix = 0;
for (let h = 0; h < matrix.length; h++) {
  for (let a = 0; a < matrix[h].length; a++) {
    sumMatrix += matrix[h][a];
  }
}
assert(Math.abs(sumMatrix - 1.0) < 0.0001, `Score Matrix sums to 1.0 (actual: ${sumMatrix.toFixed(6)})`);

// 3. 1X2 Exhaustive Market Tests
console.log('\n--- 3. 1X2 Market Bounds & Sum-To-One Tests ---');
const m1x2 = QuantitativePredictionEngine.derive1X2(matrix);
const sum1x2 = m1x2.homeWin + m1x2.draw + m1x2.awayWin;
assert(Math.abs(sum1x2 - 1.0) < 0.001, `1X2 probabilities sum to 1.0 (actual: ${sum1x2.toFixed(4)})`);
assert(m1x2.homeWin > 0 && m1x2.homeWin < 1, 'Home win probability in valid range');
assert(m1x2.draw > 0 && m1x2.draw < 1, 'Draw probability in valid range');
assert(m1x2.awayWin > 0 && m1x2.awayWin < 1, 'Away win probability in valid range');

const maxProb = Math.max(m1x2.homeWin, m1x2.draw, m1x2.awayWin);
const expectedPick = 
  maxProb === m1x2.homeWin ? '1' :
  maxProb === m1x2.draw ? 'X' : '2';
assert(m1x2.predictedOutcome === expectedPick, `Predicted outcome (${m1x2.predictedOutcome}) matches strictly highest probability outcome`);

// 3b. 1X2 - Interval 10 Minutes (00:01 - 09:59) Tests
console.log('\n--- 3b. 1X2 Interval 10 Minutes (00:01 - 09:59) Tests ---');
const m10 = QuantitativePredictionEngine.derive1X2Interval10(1.8, 1.1);
const sum10 = m10.homeWin + m10.draw + m10.awayWin;
assert(Math.abs(sum10 - 1.0) < 0.001, `10-minute interval probabilities sum to 1.0 (actual: ${sum10.toFixed(4)})`);
assert(m10.draw > 0.70 && m10.draw < 0.98, `10-minute Draw probability (${(m10.draw * 100).toFixed(1)}%) dominates due to low opening tempo`);
assert(m10.homeWin > 0 && m10.awayWin > 0, 'Home and Away lead probabilities in valid positive range');
assert(m10.predictedOutcome === 'X', 'Predicted 10-minute outcome is Draw (X)');
assert(m10.earlyGoalProbability > 0 && m10.earlyGoalProbability < 0.30, `Early goal probability (${(m10.earlyGoalProbability * 100).toFixed(1)}%) is valid`);

// 4. BTTS Exhaustive Market Tests
console.log('\n--- 4. BTTS Market Tests ---');
const btts = QuantitativePredictionEngine.deriveBTTS(matrix);
const sumBtts = btts.yes + btts.no;
assert(Math.abs(sumBtts - 1.0) < 0.001, `BTTS probabilities sum to 1.0 (actual: ${sumBtts.toFixed(4)})`);
assert(btts.yes > 0 && btts.yes < 1, 'BTTS Yes in valid range');
assert(btts.no > 0 && btts.no < 1, 'BTTS No in valid range');

// 5. Over/Under 2.5 Market Tests
console.log('\n--- 5. Over/Under 2.5 Goals Tests ---');
const ou25 = QuantitativePredictionEngine.deriveOverUnder25(matrix);
const sumOu = ou25.over + ou25.under;
assert(Math.abs(sumOu - 1.0) < 0.001, `Over/Under 2.5 probabilities sum to 1.0 (actual: ${sumOu.toFixed(4)})`);
assert(ou25.over > 0 && ou25.over < 1, 'Over 2.5 in valid range');
assert(ou25.under > 0 && ou25.under < 1, 'Under 2.5 in valid range');

// 6. Double Chance Direct Derivation Tests
console.log('\n--- 6. Double Chance Mathematical Consistency Tests ---');
const dc = QuantitativePredictionEngine.deriveDoubleChance(m1x2);
assert(Math.abs(dc['1X'] - (m1x2.homeWin + m1x2.draw)) < 0.001, '1X strictly equals Home Win + Draw');
assert(Math.abs(dc['X2'] - (m1x2.draw + m1x2.awayWin)) < 0.001, 'X2 strictly equals Draw + Away Win');
assert(Math.abs(dc['12'] - (m1x2.homeWin + m1x2.awayWin)) < 0.001, '12 strictly equals Home Win + Away Win');

// 7. HT/FT 9 Joint Combinations Tests
console.log('\n--- 7. HT/FT All 9 Outcomes Tests ---');
const htft = QuantitativePredictionEngine.deriveHtFt(1.8, 1.1);
const htftSum = Object.values(htft.probabilities).reduce((acc, v) => acc + v, 0);
assert(Math.abs(htftSum - 1.0) < 0.001, `HT/FT all 9 outcomes sum to 1.0 (actual: ${htftSum.toFixed(4)})`);
assert(Object.keys(htft.probabilities).length === 9, 'All 9 combinations present');

// 8. Timezone Localization Tests (Africa/Kampala)
console.log('\n--- 8. Timezone Conversion (Africa/Kampala default) ---');
const utcTime = '2026-10-10T18:00:00Z';
const kampalaFormatted = formatFixtureTime(utcTime, 'Africa/Kampala', false);
assert(kampalaFormatted.includes('21:00'), `UTC 18:00 converts to 21:00 in Africa/Kampala (EAT, UTC+3) (actual: ${kampalaFormatted})`);

// 9. Historical Holdout Evaluation & Calibration
console.log('\n--- 9. Historical Evaluation & Calibration Pipeline ---');
const fixtures = getInitialFixtures();
const metrics = computeEvaluationMetrics(fixtures);
assert(metrics.totalEvaluated > 0, `Total settled fixtures evaluated: ${metrics.totalEvaluated}`);
assert(metrics.brierScore.market1X2 >= 0 && metrics.brierScore.market1X2 <= 1, `1X2 Brier score (${metrics.brierScore.market1X2}) in valid range [0, 1]`);
assert(metrics.logLoss.market1X2 > 0, `1X2 Log loss (${metrics.logLoss.market1X2}) strictly positive`);
assert(metrics.hitRate.overall > 0 && metrics.hitRate.overall <= 1, `Overall Hit rate (${metrics.hitRate.overall}) in valid range`);

// 10. Win / Loss / Pending Distribution Chart Data
console.log('\n--- 10. Win / Loss / Pending Outcome Distribution Tests ---');
const distAll = computeOutcomeDistribution(fixtures, 'ALL');
assert(distAll.won + distAll.lost + distAll.pending + distAll.voided === distAll.total, `Total picks (${distAll.total}) equals Won + Lost + Pending + Voided`);
assert(distAll.won > 0 && distAll.pending > 0, `Contains both settled wins (${distAll.won}) and pending picks (${distAll.pending})`);
assert(distAll.settledAccuracyPct >= 0 && distAll.settledAccuracyPct <= 100, `Settled accuracy (${distAll.settledAccuracyPct}%) in [0, 100]`);

const dist1x2 = computeOutcomeDistribution(fixtures, '1X2');
assert(dist1x2.total === fixtures.length, `1X2 market distribution matches fixture count (${dist1x2.total})`);

// 11. Sync Integrity, Monotonic Status Protection & Honest Settlement Tests
console.log('\n--- 11. Sync Integrity & Settlement Accuracy Tests ---');
const upcomingSample = fixtures.find((f) => f.status === 'NS')!;
const ftSample = fixtures.find((f) => f.status === 'FT')!;

// Test monotonic regression protection: FT fixture must NOT revert to NS
const afterStaleDowngrade = mergeFixtureUpdates(fixtures, [
  {
    fixtureId: ftSample.id,
    homeTeamName: ftSample.homeTeam.name,
    awayTeamName: ftSample.awayTeam.name,
    competitionId: ftSample.competition.id,
    kickoffTimeUtc: ftSample.kickoffTimeUtc,
    status: 'NS',
    scores: { currentHome: 0, currentAway: 0 },
    lastUpdatedUtc: '2026-11-15T00:00:00Z',
    syncSource: 'StaleFeed',
  },
]);
const preservedFt = afterStaleDowngrade.find((f) => f.id === ftSample.id)!;
assert(preservedFt.status === 'FT', 'Monotonic guard blocks FT -> NS status regression');
assert(
  preservedFt.scores.currentHome === ftSample.scores.currentHome &&
    preservedFt.scores.currentAway === ftSample.scores.currentAway,
  'Monotonic guard preserves verified FT scores against stale 0-0 overwrite'
);

// Test honest HT/FT VOID when HT scores are missing (never fabricate Math.floor(h/2))
const syncedWithoutHt = mergeFixtureUpdates([upcomingSample], [
  {
    fixtureId: upcomingSample.id,
    homeTeamName: upcomingSample.homeTeam.name,
    awayTeamName: upcomingSample.awayTeam.name,
    competitionId: upcomingSample.competition.id,
    kickoffTimeUtc: upcomingSample.kickoffTimeUtc,
    status: 'FT',
    scores: { currentHome: 2, currentAway: 1 },
    lastUpdatedUtc: '2026-11-15T22:30:00Z',
    syncSource: 'Search-Verified',
  },
]);
const settledNoHt = settleCompletedFixture(syncedWithoutHt[0]);
assert(settledNoHt.prediction?.settlement?.settledMarkets.marketHtFt === 'VOID', 'Missing HT scores mark HT/FT VOID instead of fabricating Math.floor(h/2)');
assert(
  settledNoHt.prediction?.settlement?.settledMarkets.marketOverUnder25 === 'WON' ||
    settledNoHt.prediction?.settlement?.settledMarkets.marketOverUnder25 === 'LOST',
  'Full-time O/U 2.5 settles deterministically from verified 2-1 score'
);

// Test full settlement once verified HT score arrives
const syncedWithHt = mergeFixtureUpdates(syncedWithoutHt, [
  {
    fixtureId: upcomingSample.id,
    homeTeamName: upcomingSample.homeTeam.name,
    awayTeamName: upcomingSample.awayTeam.name,
    competitionId: upcomingSample.competition.id,
    kickoffTimeUtc: upcomingSample.kickoffTimeUtc,
    status: 'FT',
    scores: { currentHome: 2, currentAway: 1, htHome: 1, htAway: 0 },
    lastUpdatedUtc: '2026-11-15T22:35:00Z',
    syncSource: 'SportMonks-v3',
  },
]);
const settledWithHt = settleCompletedFixture(syncedWithHt[0]);
assert(
  settledWithHt.prediction?.settlement?.settledMarkets.marketHtFt === 'WON' ||
    settledWithHt.prediction?.settlement?.settledMarkets.marketHtFt === 'LOST',
  'Verified HT split (1-0) re-settles HT/FT market cleanly without VOID'
);
assert(
  settledWithHt.prediction?.settlement?.actualScore === '2 - 1 (HT: 1 - 0)',
  `Re-settled actual score string matches "${settledWithHt.prediction?.settlement?.actualScore}"`
);

// --- 12. Automated Dynamic Daily Matchday & Kampala Midnight Rollover Tests ---
console.log('\n--- 12. Automated Dynamic Daily Matchday & Kampala Midnight Rollover Tests ---');
const {
  getLocalDateString,
  getFixtureLocalDate,
  formatLocalDateLabel,
  isFixturePlayingOnLocalDate,
  getMsUntilMidnight,
  formatCountdownToMidnight,
} = await import('../src/utils/timezone.ts');

const {
  generateMatchdaySlateForDate,
  filterFixturesStrictlyForDate,
  getAutomatedMatchdayState,
} = await import('../src/services/matchdayService.ts');

const fixedNow = new Date('2026-11-15T07:00:00Z');
const kampalaDate = getLocalDateString(fixedNow, 'Africa/Kampala');
assert(kampalaDate === '2026-11-15', `getLocalDateString in Africa/Kampala returns '2026-11-15' (actual: ${kampalaDate})`);

const countdown = formatCountdownToMidnight(fixedNow, 'Africa/Kampala');
assert(typeof countdown === 'string' && countdown.includes('h'), `formatCountdownToMidnight returns valid countdown (actual: ${countdown})`);

const msToMidnight = getMsUntilMidnight(fixedNow, 'Africa/Kampala');
assert(msToMidnight > 0 && msToMidnight <= 86400000, `getMsUntilMidnight returns positive milliseconds <= 24h (actual: ${msToMidnight})`);

// Strict date filtering on 2026-11-15
const todayStrictFixtures = filterFixturesStrictlyForDate(fixtures, '2026-11-15', 'Africa/Kampala');
assert(
  todayStrictFixtures.length === 58,
  `Strict date filter isolates only the 58 matches playing on 15 Nov (actual: ${todayStrictFixtures.length})`
);
assert(
  todayStrictFixtures.every((f) => getFixtureLocalDate(f.kickoffTimeUtc, 'Africa/Kampala') === '2026-11-15'),
  'Every single strictly filtered fixture has local kickoff date equal to 2026-11-15'
);

// Automated matchday slate generation for tomorrow (2026-11-16)
const tomorrowSlate = generateMatchdaySlateForDate('2026-11-16', 'Africa/Kampala');
assert(tomorrowSlate.length >= 40, `Automated generator created full matchday slate for 2026-11-16 (actual: ${tomorrowSlate.length})`);
assert(
  tomorrowSlate.every((f) => getFixtureLocalDate(f.kickoffTimeUtc, 'Africa/Kampala') === '2026-11-16'),
  'All dynamically scheduled matches for 2026-11-16 have local kickoff strictly on 2026-11-16'
);

// Verify quantitative predictions for all dynamically generated fixtures
const sampleGenFixture = tomorrowSlate[0];
assert(sampleGenFixture.prediction !== undefined, 'Dynamically generated fixture carries QuantitativePrediction');
const gen1X2Sum = Number(
  (
    sampleGenFixture.prediction!.market1X2.homeWin +
    sampleGenFixture.prediction!.market1X2.draw +
    sampleGenFixture.prediction!.market1X2.awayWin
  ).toFixed(4)
);
assert(gen1X2Sum === 1.0, `Dynamically generated 1X2 market probabilities sum to 1.0 (actual: ${gen1X2Sum})`);

const genBttsSum = Number(
  (
    sampleGenFixture.prediction!.marketBTTS.yes +
    sampleGenFixture.prediction!.marketBTTS.no
  ).toFixed(4)
);
assert(genBttsSum === 1.0, `Dynamically generated BTTS market probabilities sum to 1.0 (actual: ${genBttsSum})`);

// Test metadata state calculation
const matchdayState = getAutomatedMatchdayState(fixtures, '2026-11-15', 'Africa/Kampala');
assert(matchdayState.todayFixturesCount === 58, `Automated matchday state reports 58 today fixtures (actual: ${matchdayState.todayFixturesCount})`);
assert(matchdayState.upcomingCount === 40, `Automated matchday state reports 40 upcoming fixtures (actual: ${matchdayState.upcomingCount})`);
assert(matchdayState.liveCount === 18, `Automated matchday state reports 18 live fixtures (actual: ${matchdayState.liveCount})`);

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All statistical & quantitative assertions passed successfully.\n');
}
