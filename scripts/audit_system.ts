import { RAW_FIXTURES } from '../src/services/mockHistoricalData.ts';
import { getFixtureLocalDate, getLocalDateString } from '../src/utils/timezone.ts';
import { serverStore } from '../server/store.ts';

const countsByDate: Record<string, number> = {};
const statusByDate: Record<string, Record<string, number>> = {};

for (const f of RAW_FIXTURES) {
  const d = getFixtureLocalDate(f.kickoffTimeUtc, 'Africa/Kampala');
  countsByDate[d] = (countsByDate[d] || 0) + 1;
  statusByDate[d] = statusByDate[d] || {};
  statusByDate[d][f.status] = (statusByDate[d][f.status] || 0) + 1;
}

console.log('=== AUDIT RAW_FIXTURES ===');
console.log('Total fixtures in RAW_FIXTURES:', RAW_FIXTURES.length);
console.log('Kampala date today:', getLocalDateString(new Date(), 'Africa/Kampala'));
console.log('Counts by Kampala date:', JSON.stringify(countsByDate, null, 2));
console.log('Statuses by Kampala date:', JSON.stringify(statusByDate, null, 2));

console.log('\n=== AUDIT SERVER STORE ===');
console.log('Tracked fixtures:', serverStore.trackedFixtures.length);
console.log('Fixture updates count:', Object.keys(serverStore.fixtureUpdates).length);
console.log('Sync jobs:', serverStore.syncJobs.length);
console.log('Last auto sync:', serverStore.lastAutoSyncAt);

const sampleUpdates = Object.values(serverStore.fixtureUpdates).slice(0, 5);
console.log('Sample updates:', JSON.stringify(sampleUpdates, null, 2));
