import http from 'node:http';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApiApp } from '../server.ts';
import { optaDiscoveryService } from '../src/services/opta/optaDiscoveryService.ts';
import { optaIngestionService } from '../src/services/opta/optaIngestionService.ts';
import { OptaPredictionBridge } from '../src/services/opta/optaPredictionBridge.ts';
import { WorldwideCoverageDashboardView } from '../src/components/WorldwideCoverageDashboardView.tsx';
import { MatchDetailModal } from '../src/components/MatchDetailModal.tsx';
import { getInitialFixtures } from '../src/services/mockHistoricalData.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}`);
    if (failureDetails) console.error(`    ↳ Details: ${failureDetails}`);
  }
}

async function runOptaIntegrationTests() {
  console.log('================================================================');
  console.log('OPTA / STATS PERFORM WORLDWIDE INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // 1. Worldwide Competition Discovery & Classification Tests
  // -------------------------------------------------------------------------
  console.log('--- 1. Worldwide Competition Discovery & Confederation Coverage ---');
  const allCompetitions = optaDiscoveryService.discoverCompetitions();
  assert(allCompetitions.length >= 35, `Discovered at least 35 worldwide competitions (actual: ${allCompetitions.length})`);

  // Check 6 confederations + FIFA
  const confs = new Set(allCompetitions.map((c) => c.confederation));
  assert(confs.has('UEFA'), 'Discovered UEFA competitions');
  assert(confs.has('CAF'), 'Discovered CAF competitions (Africa)');
  assert(confs.has('CONMEBOL'), 'Discovered CONMEBOL competitions (South America)');
  assert(confs.has('CONCACAF'), 'Discovered CONCACAF competitions (North/Central America)');
  assert(confs.has('AFC'), 'Discovered AFC competitions (Asia)');
  assert(confs.has('OFC'), 'Discovered OFC competitions (Oceania)');
  assert(confs.has('FIFA'), 'Discovered FIFA global tournaments');

  // Check Men's, Women's and Youth
  const genders = new Set(allCompetitions.map((c) => c.gender));
  assert(genders.has('MEN'), 'Discovered Men football competitions');
  assert(genders.has('WOMEN'), 'Discovered Women football competitions');

  const youthTournaments = allCompetitions.filter((c) => c.competitionType === 'YOUTH_TOURNAMENT');
  assert(youthTournaments.length > 0, `Discovered Youth tournaments (actual: ${youthTournaments.length})`);

  // Check Lower Divisions
  const lowerDivs = allCompetitions.filter((c) => c.competitionType === 'LOWER_DIVISION');
  assert(lowerDivs.length > 0, `Discovered Lower Divisions (e.g., EFL Championship, actual: ${lowerDivs.length})`);

  // Check UUID format
  const validUuids = allCompetitions.every((c) => c.optaCompetitionId.startsWith('opta:comp:'));
  assert(validUuids, 'Every competition carries a valid Opta UUID identifier (opta:comp:*)');

  // Check Strict Completeness Status Logic: Tier 3 or 4 competitions without xG or lineups must NOT be marked COMPLETE
  const partialOrUnavailable = allCompetitions.filter(
    (c) => c.coverageStatus === 'PARTIAL' || c.coverageStatus === 'UNAVAILABLE'
  );
  assert(
    partialOrUnavailable.length > 0,
    `Strict coverage status enforced: incomplete feeds are marked PARTIAL/UNAVAILABLE (actual: ${partialOrUnavailable.length})`
  );
  const falseCompletes = allCompetitions.filter(
    (c) => c.coverageStatus === 'COMPLETE' && (!c.statsAvailable.expectedGoalsXg || !c.statsAvailable.lineups)
  );
  assert(
    falseCompletes.length === 0,
    'Zero competitions falsely marked COMPLETE without verified xG and lineups'
  );

  // -------------------------------------------------------------------------
  // 2. Opta Ingestion Service, Schemas & Spatial Coordinates Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Opta Ingestion Service, Schemas & Coordinates ---');
  const eventsResult = await optaIngestionService.ingestMatchEvents('opta:match:m101');
  assert(eventsResult.success, 'Successfully ingested Opta F24 match events');
  assert(eventsResult.data.length >= 5, `Ingested ${eventsResult.data.length} match events`);

  // Spatial coordinate bounds for F24
  const validCoordinates = eventsResult.data.every(
    (e) => e.pitchX >= 0 && e.pitchX <= 100 && e.pitchY >= 0 && e.pitchY <= 100
  );
  assert(validCoordinates, 'All F24 event pitch coordinates within 0 <= X, Y <= 100');

  // Lineup formation coordinates
  const lineupsResult = await optaIngestionService.ingestLineups('opta:match:m101');
  assert(lineupsResult.success, 'Successfully ingested Opta starting formations');
  assert(lineupsResult.data.homeStartingXI.length === 11, 'Home starting XI has exactly 11 players');
  assert(lineupsResult.data.awayStartingXI.length === 11, 'Away starting XI has exactly 11 players');
  assert(lineupsResult.data.homeTeamFormation === '4-3-3', 'Home formation correctly parsed as 4-3-3');
  assert(lineupsResult.data.awayTeamFormation === '4-2-3-1', 'Away formation correctly parsed as 4-2-3-1');

  const validFormationSlots = lineupsResult.data.homeStartingXI.every(
    (p) => Boolean(p.formationSlot) && p.pitchCoordinateX >= 0 && p.pitchCoordinateX <= 100
  );
  assert(validFormationSlots, 'Lineup players contain valid formation slots and 2D pitch coordinates');

  // Advanced metrics & xG
  const metricsResult = await optaIngestionService.ingestAdvancedMetrics('opta:match:m101');
  assert(metricsResult.success, 'Successfully ingested advanced metrics & xG');
  assert(metricsResult.data.homeStats.xg > 0, `Home xG strictly positive (${metricsResult.data.homeStats.xg})`);
  assert(metricsResult.data.homeStats.fieldTiltPct > 0, `Home Field Tilt strictly positive (${metricsResult.data.homeStats.fieldTiltPct}%)`);
  assert(metricsResult.data.homeStats.ppda > 0, `Home PPDA strictly positive (${metricsResult.data.homeStats.ppda})`);

  const validShots = metricsResult.data.xgShots.every(
    (s) => s.xgValue >= 0 && s.xgValue <= 1.0 && s.pitchX >= 0 && s.pitchX <= 100
  );
  assert(validShots, 'All individual xG shot values in [0, 1] with valid pitch coordinates');

  // Official Opta MA21 Predictions
  const officialPred = await optaIngestionService.ingestOptaPredictions('opta:match:m101');
  assert(officialPred.success, 'Successfully ingested official Opta Supercomputer MA21 predictions');
  const sumOfficial =
    officialPred.data.homeWinProbability +
    officialPred.data.drawProbability +
    officialPred.data.awayWinProbability;
  assert(
    Math.abs(sumOfficial - 1.0) < 0.001,
    `Official Opta MA21 win probabilities sum to 1.0 (actual: ${sumOfficial.toFixed(4)})`
  );
  assert(officialPred.data.simulationRuns === 10000, 'Official Opta prediction based on 10,000 Monte Carlo runs');

  // -------------------------------------------------------------------------
  // 3. Prediction Engine Expansion (All 12 Markets & Strict Provenance)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Prediction Engine Expansion & Dual-Model Provenance ---');
  const fixture = getInitialFixtures()[0];
  const suite = OptaPredictionBridge.deriveOptaEnhancedPredictions(
    fixture,
    officialPred.data,
    { homeStats: metricsResult.data.homeStats, awayStats: metricsResult.data.awayStats }
  );

  // Provenance Checks
  assert(suite.provenance.officialOptaAvailable === true, 'Provenance correctly identifies official Opta prediction');
  assert(
    suite.provenance.officialProviderName.includes('Opta Supercomputer'),
    'Official provider named as Opta Supercomputer'
  );
  assert(
    suite.provenance.inHouseModelName.includes('FootballIQ Dixon-Coles'),
    'In-house model named as FootballIQ Dixon-Coles'
  );
  assert(
    suite.officialOpta?.market1X2.homeWin === officialPred.data.homeWinProbability,
    'Official Opta probability strictly preserved without contamination'
  );

  // 12 Markets Mathematical Invariants
  const inHouse = suite.inHouse;
  assert(!Number.isNaN(inHouse.homeLambda) && inHouse.homeLambda > 0, 'Calibrated home lambda strictly positive');
  assert(!Number.isNaN(inHouse.awayLambda) && inHouse.awayLambda > 0, 'Calibrated away lambda strictly positive');

  // 1. 1X2
  const sum1X2 = inHouse.market1X2.homeWin + inHouse.market1X2.draw + inHouse.market1X2.awayWin;
  assert(Math.abs(sum1X2 - 1.0) < 0.001, `Market 1: 1X2 sums to 1.0 (actual: ${sum1X2.toFixed(4)})`);

  // 2. Double Chance
  const dc1X = (inHouse.marketDoubleChance as any)['1X'] ?? (inHouse.marketDoubleChance as any).oneX;
  const dcX2 = (inHouse.marketDoubleChance as any)['X2'] ?? (inHouse.marketDoubleChance as any).xTwo;
  const dc12 = (inHouse.marketDoubleChance as any)['12'] ?? (inHouse.marketDoubleChance as any).oneTwo;
  const dc1XDiff = Math.abs(dc1X - (inHouse.market1X2.homeWin + inHouse.market1X2.draw));
  const dcX2Diff = Math.abs(dcX2 - (inHouse.market1X2.draw + inHouse.market1X2.awayWin));
  const dc12Diff = Math.abs(dc12 - (inHouse.market1X2.homeWin + inHouse.market1X2.awayWin));
  assert(dc1XDiff < 0.001, 'Market 2: Double Chance 1X = 1 + X strictly holds');
  assert(dcX2Diff < 0.001, 'Market 2: Double Chance X2 = X + 2 strictly holds');
  assert(dc12Diff < 0.001, 'Market 2: Double Chance 12 = 1 + 2 strictly holds');

  // 3. BTTS
  const sumBtts = inHouse.marketBTTS.yes + inHouse.marketBTTS.no;
  assert(Math.abs(sumBtts - 1.0) < 0.001, `Market 3: BTTS sums to 1.0 (actual: ${sumBtts.toFixed(4)})`);

  // 4. Over/Under 0.5
  const sumOu05 = inHouse.marketOverUnder05.over + inHouse.marketOverUnder05.under;
  assert(Math.abs(sumOu05 - 1.0) < 0.001, `Market 4: Over/Under 0.5 sums to 1.0 (actual: ${sumOu05.toFixed(4)})`);

  // 5. Over/Under 1.5
  const sumOu15 = inHouse.marketOverUnder15.over + inHouse.marketOverUnder15.under;
  assert(Math.abs(sumOu15 - 1.0) < 0.001, `Market 5: Over/Under 1.5 sums to 1.0 (actual: ${sumOu15.toFixed(4)})`);

  // 6. Over/Under 2.5
  const sumOu25 = inHouse.marketOverUnder25.over + inHouse.marketOverUnder25.under;
  assert(Math.abs(sumOu25 - 1.0) < 0.001, `Market 6: Over/Under 2.5 sums to 1.0 (actual: ${sumOu25.toFixed(4)})`);

  // 7. Over/Under 3.5
  const sumOu35 = inHouse.marketOverUnder35.over + inHouse.marketOverUnder35.under;
  assert(Math.abs(sumOu35 - 1.0) < 0.001, `Market 7: Over/Under 3.5 sums to 1.0 (actual: ${sumOu35.toFixed(4)})`);

  // Monotonic property: P(Over 0.5) > P(Over 1.5) > P(Over 2.5) > P(Over 3.5)
  assert(
    inHouse.marketOverUnder05.over >= inHouse.marketOverUnder15.over &&
    inHouse.marketOverUnder15.over >= inHouse.marketOverUnder25.over &&
    inHouse.marketOverUnder25.over >= inHouse.marketOverUnder35.over,
    'Over/Under thresholds strictly satisfy monotonic probability ordering (O0.5 >= O1.5 >= O2.5 >= O3.5)'
  );

  // 8 & 9. Half Goals
  const sum1H05 = inHouse.marketHalfGoals.firstHalf.over05 + inHouse.marketHalfGoals.firstHalf.under05;
  const sum2H05 = inHouse.marketHalfGoals.secondHalf.over05 + inHouse.marketHalfGoals.secondHalf.under05;
  assert(Math.abs(sum1H05 - 1.0) < 0.001, `Market 8: 1st Half Goals O/U 0.5 sums to 1.0 (actual: ${sum1H05.toFixed(4)})`);
  assert(Math.abs(sum2H05 - 1.0) < 0.001, `Market 9: 2nd Half Goals O/U 0.5 sums to 1.0 (actual: ${sum2H05.toFixed(4)})`);

  // 10. HT/FT (All 9 outcomes)
  const htFtValues = inHouse.marketHtFt.probabilities
    ? Object.values(inHouse.marketHtFt.probabilities)
    : (inHouse.marketHtFt as any).outcomes?.map((it: any) => it.probability) || [];
  const sumHtFt = htFtValues.reduce((acc: number, val: number) => acc + val, 0);
  assert(Math.abs(sumHtFt - 1.0) < 0.005, `Market 10: HT/FT 9 outcomes sum to ~1.0 (actual: ${sumHtFt.toFixed(4)})`);
  assert(htFtValues.length === 9, 'HT/FT contains all 9 joint outcome combinations');

  // 11. Clean Sheets
  assert(
    inHouse.marketCleanSheet.homeCleanSheet >= 0 && inHouse.marketCleanSheet.homeCleanSheet <= 1,
    'Market 11: Home clean sheet probability in [0, 1]'
  );
  assert(
    inHouse.marketCleanSheet.awayCleanSheet >= 0 && inHouse.marketCleanSheet.awayCleanSheet <= 1,
    'Market 11: Away clean sheet probability in [0, 1]'
  );

  // 12. Team to Score
  const sumTts =
    inHouse.marketTeamToScore.bothToScore +
    inHouse.marketTeamToScore.neitherToScore +
    (inHouse.marketTeamToScore.homeToScore - inHouse.marketTeamToScore.bothToScore) +
    (inHouse.marketTeamToScore.awayToScore - inHouse.marketTeamToScore.bothToScore);
  assert(Math.abs(sumTts - 1.0) < 0.001, `Market 12: Team to score decomposition sums to 1.0 (actual: ${sumTts.toFixed(4)})`);

  // -------------------------------------------------------------------------
  // 4. Component SSR Rendering Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 4. UI Component SSR Rendering Tests ---');
  try {
    const coverageHtml = renderToStaticMarkup(React.createElement(WorldwideCoverageDashboardView));
    assert(coverageHtml.includes('Worldwide Opta Football Coverage'), 'WorldwideCoverageDashboardView renders title');
    assert(coverageHtml.includes('Tier 1 (Granular)'), 'WorldwideCoverageDashboardView renders Tier 1 Granular badge');
    assert(coverageHtml.includes('COMPLETE'), 'WorldwideCoverageDashboardView renders COMPLETE badge');
    assert(coverageHtml.includes('PARTIAL'), 'WorldwideCoverageDashboardView renders PARTIAL badge');
  } catch (err: any) {
    assert(false, 'WorldwideCoverageDashboardView SSR render failed', err?.message);
  }

  try {
    const modalHtml = renderToStaticMarkup(
      React.createElement(MatchDetailModal, {
        fixture,
        onClose: () => {},
        selectedTimezone: 'Africa/Kampala',
        oddsFormat: 'PROBABILITY',
        onLaunchVeo: () => {},
      })
    );
    assert(modalHtml.includes('Opta Intelligence &amp; xG'), 'MatchDetailModal includes Opta tab button');
  } catch (err: any) {
    assert(false, 'MatchDetailModal SSR render failed', err?.message);
  }

  // -------------------------------------------------------------------------
  // 5. Server REST API Endpoints Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Server-Side REST API Endpoints Tests ---');
  const app = createApiApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/opta/status
    const statusRes = await fetch(`${baseUrl}/api/opta/status`);
    assert(statusRes.status === 200, 'GET /api/opta/status returns HTTP 200');
    const statusData = await statusRes.json();
    assert(statusData.success === true, 'GET /api/opta/status reports success: true');
    assert(statusData.data.provider.includes('Opta / Stats Perform'), 'Status data confirms Opta / Stats Perform');
    assert(statusData.data.coverageMetrics.totalDiscoveredCompetitions >= 35, 'Status reports >= 35 competitions');

    // 2. GET /api/opta/competitions?confederation=UEFA
    const uefaRes = await fetch(`${baseUrl}/api/opta/competitions?confederation=UEFA`);
    assert(uefaRes.status === 200, 'GET /api/opta/competitions?confederation=UEFA returns HTTP 200');
    const uefaData = await uefaRes.json();
    assert(uefaData.success === true, 'Competitions query reports success: true');
    const allUefa = uefaData.data.every((c: any) => c.confederation === 'UEFA');
    assert(allUefa, 'Filtered competitions strictly belong to UEFA');

    // 3. GET /api/opta/match/opta:match:m101
    const matchRes = await fetch(`${baseUrl}/api/opta/match/opta:match:m101`);
    assert(matchRes.status === 200, 'GET /api/opta/match/:id returns HTTP 200');
    const matchData = await matchRes.json();
    assert(matchData.success === true, 'Match endpoint reports success: true');
    assert(matchData.data.events.length >= 5, 'Match payload contains F24 events');
    assert(matchData.data.lineup.homeStartingXI.length === 11, 'Match payload contains starting XI');
    assert(matchData.data.prediction.simulationRuns === 10000, 'Match payload contains MA21 prediction');

    // 4. POST /api/opta/sync
    const syncRes = await fetch(`${baseUrl}/api/opta/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletKey: 'test-outlet-key' }),
    });
    assert(syncRes.status === 200, 'POST /api/opta/sync returns HTTP 200');
    const syncData = await syncRes.json();
    assert(syncData.success === true, 'Sync endpoint reports success: true');
    assert(syncData.data.discoveredCount >= 35, 'Sync endpoint reports updated discovered count');
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runOptaIntegrationTests().catch((err) => {
  console.error('Fatal error running Opta integration test suite:', err);
  process.exit(1);
});
