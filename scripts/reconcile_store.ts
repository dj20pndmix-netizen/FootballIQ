import { getInitialFixtures } from '../src/services/mockHistoricalData.ts';
import { serverStore, saveServerStore } from '../server/store.ts';
import { runServerAutoSettlement } from '../server/settlementEngine.ts';

console.log('--- RECONCILING SERVER STORE ---');
const baseline = getInitialFixtures();
let repairedCount = 0;

for (const fix of baseline) {
  const existing = serverStore.fixtureUpdates[fix.id];
  if (!existing) {
    serverStore.fixtureUpdates[fix.id] = {
      fixtureId: fix.id,
      homeTeamName: fix.homeTeam.name,
      awayTeamName: fix.awayTeam.name,
      competitionId: fix.competition.id,
      kickoffTimeUtc: fix.kickoffTimeUtc,
      status: fix.status as any,
      scores: {
        currentHome: fix.scores.currentHome,
        currentAway: fix.scores.currentAway,
        ...(typeof fix.scores.htHome === 'number' ? { htHome: fix.scores.htHome } : {}),
        ...(typeof fix.scores.htAway === 'number' ? { htAway: fix.scores.htAway } : {}),
        ...(typeof fix.scores.minute === 'number' ? { minute: fix.scores.minute } : {}),
      },
      lastUpdatedUtc: fix.lastUpdatedUtc,
      syncSource: 'Verified-Historical-Reconciliation',
    };
    repairedCount++;
  } else {
    // Reconcile metadata & status
    existing.kickoffTimeUtc = fix.kickoffTimeUtc;
    existing.homeTeamName = fix.homeTeam.name;
    existing.awayTeamName = fix.awayTeam.name;
    existing.competitionId = fix.competition.id;
    existing.lastUpdatedUtc = new Date().toISOString();
    existing.syncSource = 'Verified-Historical-Reconciliation';
    if (fix.status === 'FT') {
      existing.status = 'FT';
      existing.scores = {
        currentHome: fix.scores.currentHome,
        currentAway: fix.scores.currentAway,
        ...(typeof fix.scores.htHome === 'number' ? { htHome: fix.scores.htHome } : {}),
        ...(typeof fix.scores.htAway === 'number' ? { htAway: fix.scores.htAway } : {}),
      };
      repairedCount++;
    } else {
      existing.status = fix.status as any;
      existing.scores = {
        currentHome: fix.scores.currentHome,
        currentAway: fix.scores.currentAway,
      };
      // If it previously had a settlement from a different match, remove it
      delete (existing as any).settlement;
      repairedCount++;
    }
  }
}

serverStore.trackedFixtures = baseline.map((f) => ({
  fixtureId: f.id,
  homeTeam: f.homeTeam.name,
  awayTeam: f.awayTeam.name,
  competitionId: f.competition.id,
  competition: f.competition.name,
  kickoffTimeUtc: f.kickoffTimeUtc,
}));

console.log(`Repaired/seeded ${repairedCount} fixture updates in server store.`);

const settlementSummary = runServerAutoSettlement();
console.log('Automated Settlement Summary:', JSON.stringify(settlementSummary, null, 2));

saveServerStore(serverStore);
console.log('Successfully saved reconciled server store to .data/sync_state.json.');
