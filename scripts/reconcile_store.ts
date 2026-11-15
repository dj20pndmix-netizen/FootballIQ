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
  } else if (fix.status === 'FT' && existing.status !== 'FT') {
    existing.status = 'FT';
    existing.scores = {
      currentHome: fix.scores.currentHome,
      currentAway: fix.scores.currentAway,
      ...(typeof fix.scores.htHome === 'number' ? { htHome: fix.scores.htHome } : {}),
      ...(typeof fix.scores.htAway === 'number' ? { htAway: fix.scores.htAway } : {}),
    };
    existing.lastUpdatedUtc = new Date().toISOString();
    existing.syncSource = 'Verified-Historical-Reconciliation';
    repairedCount++;
  }
}

console.log(`Repaired/seeded ${repairedCount} fixture updates in server store.`);

const settlementSummary = runServerAutoSettlement();
console.log('Automated Settlement Summary:', JSON.stringify(settlementSummary, null, 2));

saveServerStore(serverStore);
console.log('Successfully saved reconciled server store to .data/sync_state.json.');
