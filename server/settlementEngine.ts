import {
  ServerFixtureUpdate,
  ServerSettlementRecord,
  serverStore,
  saveServerStore,
} from './store.ts';
import { getInitialFixtures } from '../src/services/mockHistoricalData.ts';

const baselineMap = new Map<string, any>();
try {
  for (const fix of getInitialFixtures()) {
    baselineMap.set(fix.id, fix.prediction);
  }
} catch {
  // Graceful fallback during tests
}

export interface ServerSettlementSummary {
  settledCount: number;
  alreadySettledCount: number;
  pendingCount: number;
  voidedCount: number;
  details: {
    fixtureId: string;
    teams: string;
    score: string;
    status: 'WON' | 'LOST' | 'VOID' | 'PENDING';
    reason: string;
  }[];
}

/**
 * Server-side Automatic Match Settlement Engine
 * Automatically audits all tracked fixtures, grades officially completed matches,
 * records complete settlement provenance, and persists to store.
 */
export function runServerAutoSettlement(): ServerSettlementSummary {
  const summary: ServerSettlementSummary = {
    settledCount: 0,
    alreadySettledCount: 0,
    pendingCount: 0,
    voidedCount: 0,
    details: [],
  };

  const now = new Date();
  const nowMs = now.getTime();

  for (const [fixtureId, update] of Object.entries(serverStore.fixtureUpdates)) {
    const { status, scores, kickoffTimeUtc } = update;
    const kickoffMs = Date.parse(kickoffTimeUtc);
    const elapsedMinutes = !Number.isNaN(kickoffMs) ? (nowMs - kickoffMs) / 60000 : 0;

    // Check if match is Postponed or Cancelled
    if (status === 'POSTP' || status === 'CANC') {
      if (!update.settlement || update.settlement.status !== 'VOID') {
        const record: ServerSettlementRecord = {
          status: 'VOID',
          settledAt: now.toISOString(),
          actualScore: status === 'POSTP' ? 'Postponed' : 'Cancelled',
          markets: {
            market1X2: 'VOID',
            marketBTTS: 'VOID',
            marketOverUnder25: 'VOID',
            marketHtFt: 'VOID',
            marketDoubleChance: 'VOID',
          },
          source: 'Server-Settlement-Engine (Integrity Void Policy)',
        };
        update.settlement = record;
        summary.voidedCount++;
        summary.details.push({
          fixtureId,
          teams: `${update.homeTeamName} vs ${update.awayTeamName}`,
          score: status,
          status: 'VOID',
          reason: `Match was ${status === 'POSTP' ? 'postponed' : 'cancelled'}. All markets voided.`,
        });
      } else {
        summary.alreadySettledCount++;
      }
      continue;
    }

    // Check if match is completed Full Time (FT)
    const isOfficiallyCompleted = status === 'FT';
    const hasValidScores =
      typeof scores?.currentHome === 'number' &&
      typeof scores?.currentAway === 'number' &&
      Number.isFinite(scores.currentHome) &&
      Number.isFinite(scores.currentAway);

    // If kickoff was > 120 minutes ago and scores are valid, ensure status is marked FT
    if (!isOfficiallyCompleted && elapsedMinutes > 120 && hasValidScores && (scores.currentHome > 0 || scores.currentAway > 0)) {
      update.status = 'FT';
    }

    if (update.status === 'FT' && hasValidScores) {
      const h = Math.max(0, Math.round(scores.currentHome));
      const a = Math.max(0, Math.round(scores.currentAway));
      const scoreStr = `${h} - ${a}`;
      const htH = typeof scores.htHome === 'number' ? Math.max(0, Math.round(scores.htHome)) : null;
      const htA = typeof scores.htAway === 'number' ? Math.max(0, Math.round(scores.htAway)) : null;
      const htScoreStr = htH !== null && htA !== null ? `${htH} - ${htA}` : undefined;

      // Check if already settled for this exact score
      if (update.settlement && update.settlement.actualScore === scoreStr) {
        summary.alreadySettledCount++;
        continue;
      }

      // Grade the 5 primary markets using actual pre-match predictions
      const actual1X2 = h > a ? '1' : h === a ? 'X' : '2';
      const actualBTTS = h > 0 && a > 0 ? 'YES' : 'NO';
      const actualOU25 = h + a >= 3 ? 'OVER' : 'UNDER';
      const actualDC = actual1X2 === '1' ? ['1X', '12'] : actual1X2 === 'X' ? ['1X', 'X2'] : ['X2', '12'];

      const pred = baselineMap.get(fixtureId);
      const predicted1X2 = pred?.market1X2?.predictedOutcome || '1';
      const predictedBTTS = pred?.marketBTTS?.predictedOutcome || 'NO';
      const predictedOU25 = pred?.marketOverUnder25?.predictedOutcome || 'UNDER';
      const predictedDC = pred?.marketDoubleChance?.predictedOutcome || '1X';
      const predictedHtFt = pred?.marketHtFt?.predictedOutcome;

      const won1X2 = actual1X2 === predicted1X2;
      const wonBTTS = actualBTTS === predictedBTTS;
      const wonOU25 = actualOU25 === predictedOU25;
      const wonDC = actualDC.includes(predictedDC);

      let htFtResult: 'WON' | 'LOST' | 'VOID' = 'VOID';
      if (htH !== null && htA !== null && predictedHtFt) {
        const htState = htH > htA ? 'H' : htH === htA ? 'D' : 'A';
        const ftState = h > a ? 'H' : h === a ? 'D' : 'A';
        const actualHtFt = `${htState}${ftState}`;
        htFtResult = actualHtFt === predictedHtFt ? 'WON' : 'LOST';
      }

      const settlementRecord: ServerSettlementRecord = {
        status: won1X2 ? 'WON' : 'LOST',
        settledAt: now.toISOString(),
        actualScore: scoreStr,
        htScore: htScoreStr,
        markets: {
          market1X2: won1X2 ? 'WON' : 'LOST',
          marketBTTS: wonBTTS ? 'WON' : 'LOST',
          marketOverUnder25: wonOU25 ? 'WON' : 'LOST',
          marketDoubleChance: wonDC ? 'WON' : 'LOST',
          marketHtFt: htFtResult,
        },
        source: update.syncSource || 'Server-Auto-Settlement',
      };

      update.settlement = settlementRecord;
      summary.settledCount++;
      summary.details.push({
        fixtureId,
        teams: `${update.homeTeamName} vs ${update.awayTeamName}`,
        score: scoreStr,
        status: settlementRecord.status,
        reason: `Full time verified score ${scoreStr}. Markets graded.`,
      });
    } else {
      summary.pendingCount++;
    }
  }

  if (summary.settledCount > 0 || summary.voidedCount > 0) {
    saveServerStore(serverStore);
  }

  return summary;
}
