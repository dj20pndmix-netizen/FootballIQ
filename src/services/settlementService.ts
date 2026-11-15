import {
  Fixture,
  FixturePrediction,
  FixtureStatus,
  MatchScores,
} from '../types/football';

export interface MarketGradingResult {
  marketKey: string;
  pick: string;
  outcome: 'WON' | 'LOST' | 'VOID' | 'PENDING';
  actualValue: string;
  reason: string;
}

export interface DetailedSettlementAudit {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  status: FixtureStatus;
  settlementStatus: 'WON' | 'LOST' | 'VOID' | 'PENDING';
  finalScore: string;
  htScore?: string;
  settledAt: string;
  source: string;
  isConfirmed: boolean;
  markets: Record<string, 'WON' | 'LOST' | 'VOID'>;
  auditTrail: MarketGradingResult[];
}

/**
 * Grades all markets for a given fixture against its verified scores and status.
 */
export function gradeFixtureSettlement(
  fixture: Fixture,
  source: string = 'FootballIQ-Settlement-Engine'
): {
  settledFixture: Fixture;
  audit: DetailedSettlementAudit | null;
} {
  const pred = fixture.prediction;
  if (!pred) {
    return { settledFixture: fixture, audit: null };
  }

  const { status, scores } = fixture;
  const isPostponed = status === 'POSTP';
  const isCancelled = status === 'CANC';
  const isCompleted = status === 'FT';

  // If match is unplayed (NS) or Live without official FT, predictions remain PENDING
  if (!isCompleted && !isPostponed && !isCancelled) {
    return {
      settledFixture: {
        ...fixture,
        prediction: {
          ...pred,
          settlement: {
            status: 'PENDING',
            settledMarkets: {
              market1X2: 'PENDING' as any,
              marketBTTS: 'PENDING' as any,
              marketOverUnder25: 'PENDING' as any,
              marketHtFt: 'PENDING' as any,
              marketDoubleChance: 'PENDING' as any,
            },
          },
        },
      },
      audit: null,
    };
  }

  const settledAt = new Date().toISOString();
  const h = typeof scores?.currentHome === 'number' ? Math.max(0, Math.round(scores.currentHome)) : null;
  const a = typeof scores?.currentAway === 'number' ? Math.max(0, Math.round(scores.currentAway)) : null;
  const htH = typeof scores?.htHome === 'number' ? Math.max(0, Math.round(scores.htHome)) : null;
  const htA = typeof scores?.htAway === 'number' ? Math.max(0, Math.round(scores.htAway)) : null;
  const hasValidFt = h !== null && a !== null;
  const hasValidHt = htH !== null && htA !== null;

  // Postponed / Cancelled policy: All markets are graded VOID (not loss)
  if (isPostponed || isCancelled) {
    const reason = isPostponed ? 'Match officially postponed' : 'Match officially cancelled';
    const settledMarkets = {
      market1X2: 'VOID' as const,
      marketBTTS: 'VOID' as const,
      marketOverUnder25: 'VOID' as const,
      marketHtFt: 'VOID' as const,
      marketDoubleChance: 'VOID' as const,
      market1X2Interval10: 'VOID' as const,
    };

    const audit: DetailedSettlementAudit = {
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      status,
      settlementStatus: 'VOID',
      finalScore: isPostponed ? 'P - P' : 'C - C',
      settledAt,
      source,
      isConfirmed: true,
      markets: settledMarkets,
      auditTrail: [
        { marketKey: 'ALL_MARKETS', pick: 'ANY', outcome: 'VOID', actualValue: status, reason },
      ],
    };

    const settlementRec = {
      status: 'VOID' as const,
      verifiedAt: settledAt,
      actualScore: isPostponed ? 'Postponed' : 'Cancelled',
      settledMarkets,
    };

    return {
      settledFixture: {
        ...fixture,
        settlement: settlementRec as any,
        prediction: {
          ...pred,
          settlement: settlementRec,
        },
      },
      audit,
    };
  }

  // If FT status but final scores are missing/invalid, match is awaiting confirmation: DO NOT grade as final
  if (!hasValidFt) {
    return {
      settledFixture: fixture,
      audit: null,
    };
  }

  const finalScoreStr = `${h} - ${a}`;
  const htScoreStr = hasValidHt ? `${htH} - ${htA}` : undefined;
  const actualScoreLabel = htScoreStr ? `${finalScoreStr} (HT: ${htScoreStr})` : finalScoreStr;

  const auditTrail: MarketGradingResult[] = [];
  const settledMarkets: Record<string, 'WON' | 'LOST' | 'VOID'> = {};

  // 1. Market 1X2 Full-Time
  const actual1X2 = h > a ? '1' : h === a ? 'X' : '2';
  const won1X2 = pred.market1X2.predictedOutcome === actual1X2;
  settledMarkets.market1X2 = won1X2 ? 'WON' : 'LOST';
  auditTrail.push({
    marketKey: '1X2',
    pick: pred.market1X2.predictedOutcome,
    outcome: settledMarkets.market1X2,
    actualValue: actual1X2,
    reason: `Score ${finalScoreStr} results in ${actual1X2}. Pick was ${pred.market1X2.predictedOutcome}.`,
  });

  // 2. Double Chance
  const actualDC: string[] = actual1X2 === '1' ? ['1X', '12'] : actual1X2 === 'X' ? ['1X', 'X2'] : ['X2', '12'];
  const wonDC = actualDC.includes(pred.marketDoubleChance.predictedOutcome);
  settledMarkets.marketDoubleChance = wonDC ? 'WON' : 'LOST';
  auditTrail.push({
    marketKey: 'DOUBLE_CHANCE',
    pick: pred.marketDoubleChance.predictedOutcome,
    outcome: settledMarkets.marketDoubleChance,
    actualValue: actualDC.join('/'),
    reason: `Outcome ${actual1X2} satisfies [${actualDC.join(', ')}]. Pick was ${pred.marketDoubleChance.predictedOutcome}.`,
  });

  // 3. Both Teams To Score (BTTS)
  const actualBTTS = h > 0 && a > 0 ? 'YES' : 'NO';
  const wonBTTS = pred.marketBTTS.predictedOutcome === actualBTTS;
  settledMarkets.marketBTTS = wonBTTS ? 'WON' : 'LOST';
  auditTrail.push({
    marketKey: 'BTTS',
    pick: pred.marketBTTS.predictedOutcome,
    outcome: settledMarkets.marketBTTS,
    actualValue: actualBTTS,
    reason: `Both scored: ${actualBTTS}. Pick was ${pred.marketBTTS.predictedOutcome}.`,
  });

  // 4. Over/Under 2.5 Total Goals
  const totalGoals = h + a;
  const actualOU25 = totalGoals >= 3 ? 'OVER' : 'UNDER';
  const wonOU25 = pred.marketOverUnder25.predictedOutcome === actualOU25;
  settledMarkets.marketOverUnder25 = wonOU25 ? 'WON' : 'LOST';
  auditTrail.push({
    marketKey: 'OVER_UNDER_25',
    pick: pred.marketOverUnder25.predictedOutcome,
    outcome: settledMarkets.marketOverUnder25,
    actualValue: `${actualOU25} (${totalGoals} goals)`,
    reason: `Total goals ${totalGoals} is ${actualOU25} 2.5. Pick was ${pred.marketOverUnder25.predictedOutcome}.`,
  });

  // 5. Half-Time / Full-Time (HT/FT 9-Way)
  if (hasValidHt) {
    const htState = htH > htA ? 'H' : htH === htA ? 'D' : 'A';
    const ftState = h > a ? 'H' : h === a ? 'D' : 'A';
    const actualHtFt = `${htState}${ftState}`;
    const wonHtFt = pred.marketHtFt.predictedOutcome === actualHtFt;
    settledMarkets.marketHtFt = wonHtFt ? 'WON' : 'LOST';
    auditTrail.push({
      marketKey: 'HT_FT',
      pick: pred.marketHtFt.predictedOutcome,
      outcome: settledMarkets.marketHtFt,
      actualValue: actualHtFt,
      reason: `HT: ${htH}-${htA} (${htState}), FT: ${h}-${a} (${ftState}) gives ${actualHtFt}. Pick was ${pred.marketHtFt.predictedOutcome}.`,
    });
  } else {
    settledMarkets.marketHtFt = 'VOID';
    auditTrail.push({
      marketKey: 'HT_FT',
      pick: pred.marketHtFt.predictedOutcome,
      outcome: 'VOID',
      actualValue: 'MISSING_HT_SCORE',
      reason: 'Official half-time score unavailable; voided per market integrity policy.',
    });
  }

  // 6. 10-Minute Interval 00:01 - 09:59 (if present)
  if (pred.market1X2Interval10) {
    // If score was 0-0 at 10 minutes (typical), outcome is 'X'
    // If half-time score was 0-0, 10' score was guaranteed 0-0 ('X')
    if (hasValidHt && htH === 0 && htA === 0) {
      const wonInt = pred.market1X2Interval10.predictedOutcome === 'X';
      settledMarkets.market1X2Interval10 = wonInt ? 'WON' : 'LOST';
      auditTrail.push({
        marketKey: '1X2_INTERVAL_10',
        pick: pred.market1X2Interval10.predictedOutcome,
        outcome: settledMarkets.market1X2Interval10,
        actualValue: 'X (0-0 at HT)',
        reason: 'Score was 0-0 at HT, guaranteeing 0-0 at 10 minutes.',
      });
    } else {
      settledMarkets.market1X2Interval10 = 'VOID';
      auditTrail.push({
        marketKey: '1X2_INTERVAL_10',
        pick: pred.market1X2Interval10.predictedOutcome,
        outcome: 'VOID',
        actualValue: 'UNVERIFIED_MINUTE_SPLIT',
        reason: 'Granular 10-minute in-play score split unverified; voided per integrity policy.',
      });
    }
  }

  // Primary overall settlement status (follows 1X2 primary market)
  const overallSettlementStatus = won1X2 ? 'WON' : 'LOST';

  const audit: DetailedSettlementAudit = {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    status: 'FT',
    settlementStatus: overallSettlementStatus,
    finalScore: finalScoreStr,
    htScore: htScoreStr,
    settledAt,
    source,
    isConfirmed: true,
    markets: settledMarkets,
    auditTrail,
  };

  const settlementRec = {
    status: overallSettlementStatus,
    verifiedAt: settledAt,
    actualScore: actualScoreLabel,
    settledMarkets: settledMarkets as any,
  };

  const settledFixture: Fixture = {
    ...fixture,
    settlement: settlementRec as any,
    prediction: {
      ...pred,
      settlement: settlementRec,
    },
  };

  return { settledFixture, audit };
}

/**
 * Batch settles a list of fixtures and returns all updated fixtures and audit records.
 * Idempotent: previously settled fixtures with identical scores are preserved without recalculation.
 */
export function settleFixtureList(
  fixtures: Fixture[],
  source: string = 'FootballIQ-Settlement-Engine'
): {
  settledFixtures: Fixture[];
  newlySettledCount: number;
  audits: DetailedSettlementAudit[];
} {
  let newlySettledCount = 0;
  const audits: DetailedSettlementAudit[] = [];

  const settledFixtures = fixtures.map((f) => {
    // Check if already settled with the same score
    if (f.status === 'FT' && f.prediction?.settlement && f.scores) {
      const currentLabel = `${f.scores.currentHome} - ${f.scores.currentAway}`;
      if (f.prediction.settlement.actualScore?.startsWith(currentLabel)) {
        return f;
      }
    }

    const { settledFixture, audit } = gradeFixtureSettlement(f, source);
    if (audit && (audit.settlementStatus === 'WON' || audit.settlementStatus === 'LOST')) {
      newlySettledCount++;
      audits.push(audit);
    }
    return settledFixture;
  });

  return { settledFixtures, newlySettledCount, audits };
}

/**
 * Convenient single-fixture settlement helper
 */
export function settleFixtureRecord(fixture: Fixture, source?: string): Fixture {
  return gradeFixtureSettlement(fixture, source).settledFixture;
}

/**
 * Convenient batch settlement helper
 */
export function batchSettleFixtures(
  fixtures: Fixture[],
  source?: string
): {
  fixtures: Fixture[];
  settledCount: number;
  alreadySettledCount: number;
  audits: DetailedSettlementAudit[];
} {
  let alreadySettledCount = 0;
  for (const f of fixtures) {
    if (f.status === 'FT' && f.prediction?.settlement && f.scores) {
      const currentLabel = `${f.scores.currentHome} - ${f.scores.currentAway}`;
      if (f.prediction.settlement.actualScore?.startsWith(currentLabel)) {
        alreadySettledCount++;
      }
    }
  }
  const result = settleFixtureList(fixtures, source);
  return {
    fixtures: result.settledFixtures,
    settledCount: result.newlySettledCount,
    alreadySettledCount,
    audits: result.audits,
  };
}
