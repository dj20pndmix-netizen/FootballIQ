import { Fixture, HistoricalEvaluationMetrics } from '../types/football';

/**
 * Historical Evaluation & Calibration Pipeline
 * Computes strictly out-of-sample Brier scores, multi-class Log Loss, and reliability diagrams
 */

export function computeEvaluationMetrics(fixtures: Fixture[]): HistoricalEvaluationMetrics {
  const settled = fixtures.filter(f => f.status === 'FT' && f.prediction?.settlement);
  
  if (settled.length === 0) {
    return {
      totalEvaluated: 0,
      logLoss: { market1X2: 0, marketBTTS: 0, marketOverUnder25: 0 },
      brierScore: { market1X2: 0, marketBTTS: 0, marketOverUnder25: 0, marketDoubleChance: 0 },
      hitRate: { market1X2: 0, marketBTTS: 0, marketOverUnder25: 0, marketDoubleChance: 0, overall: 0 },
      byCompetition: [],
      calibrationBands: [],
    };
  }

  let sumBrier1X2 = 0;
  let sumBrierBTTS = 0;
  let sumBrierOU = 0;
  let sumBrierDC = 0;

  let sumLogLoss1X2 = 0;
  let sumLogLossBTTS = 0;
  let sumLogLossOU = 0;

  let hits1X2 = 0;
  let hitsBTTS = 0;
  let hitsOU = 0;
  let hitsDC = 0;

  // Track calibration buckets: 0-20%, 20-40%, 40-60%, 60-80%, 80-100%
  const bands = [
    { label: '0% - 20%', min: 0.0, max: 0.20, predSum: 0, actualSum: 0, count: 0 },
    { label: '20% - 40%', min: 0.20, max: 0.40, predSum: 0, actualSum: 0, count: 0 },
    { label: '40% - 60%', min: 0.40, max: 0.60, predSum: 0, actualSum: 0, count: 0 },
    { label: '60% - 80%', min: 0.60, max: 0.80, predSum: 0, actualSum: 0, count: 0 },
    { label: '80% - 100%', min: 0.80, max: 1.00, predSum: 0, actualSum: 0, count: 0 },
  ];

  const compStats: Record<string, { total: number; hits: number; brierSum: number }> = {};

  settled.forEach(f => {
    const pred = f.prediction!;
    const h = f.scores.currentHome;
    const a = f.scores.currentAway;
    const compName = f.competition.name;

    if (!compStats[compName]) {
      compStats[compName] = { total: 0, hits: 0, brierSum: 0 };
    }
    compStats[compName].total++;

    // Actual outcomes
    const actual1X2 = h > a ? '1' : h === a ? 'X' : '2';
    const oH = actual1X2 === '1' ? 1 : 0;
    const oD = actual1X2 === 'X' ? 1 : 0;
    const oA = actual1X2 === '2' ? 1 : 0;

    // 1X2 Brier score = (pH - oH)^2 + (pD - oD)^2 + (pA - oA)^2
    const brierMatch1X2 = 
      Math.pow(pred.market1X2.homeWin - oH, 2) +
      Math.pow(pred.market1X2.draw - oD, 2) +
      Math.pow(pred.market1X2.awayWin - oA, 2);
    sumBrier1X2 += brierMatch1X2;
    compStats[compName].brierSum += brierMatch1X2;

    // Multi-class Log Loss for 1X2
    const eps = 1e-15;
    const pObserved1X2 = 
      actual1X2 === '1' ? pred.market1X2.homeWin :
      actual1X2 === 'X' ? pred.market1X2.draw :
      pred.market1X2.awayWin;
    sumLogLoss1X2 += -Math.log(Math.max(eps, pObserved1X2));

    if (pred.market1X2.predictedOutcome === actual1X2) {
      hits1X2++;
      compStats[compName].hits++;
    }

    // BTTS Brier & Log Loss
    const actualBTTS = h > 0 && a > 0 ? 1 : 0;
    const brierBTTS = Math.pow(pred.marketBTTS.yes - actualBTTS, 2);
    sumBrierBTTS += brierBTTS;
    const pObservedBTTS = actualBTTS === 1 ? pred.marketBTTS.yes : pred.marketBTTS.no;
    sumLogLossBTTS += -Math.log(Math.max(eps, pObservedBTTS));
    if ((pred.marketBTTS.predictedOutcome === 'YES' && actualBTTS === 1) ||
        (pred.marketBTTS.predictedOutcome === 'NO' && actualBTTS === 0)) {
      hitsBTTS++;
    }

    // Over/Under 2.5 Brier & Log Loss
    const actualOU = (h + a >= 3) ? 1 : 0;
    const brierOU = Math.pow(pred.marketOverUnder25.over - actualOU, 2);
    sumBrierOU += brierOU;
    const pObservedOU = actualOU === 1 ? pred.marketOverUnder25.over : pred.marketOverUnder25.under;
    sumLogLossOU += -Math.log(Math.max(eps, pObservedOU));
    if ((pred.marketOverUnder25.predictedOutcome === 'OVER' && actualOU === 1) ||
        (pred.marketOverUnder25.predictedOutcome === 'UNDER' && actualOU === 0)) {
      hitsOU++;
    }

    // Double Chance
    const actualDC = 
      actual1X2 === '1' ? ['1X', '12'] :
      actual1X2 === 'X' ? ['1X', 'X2'] :
      ['X2', '12'];
    const dcHit = actualDC.includes(pred.marketDoubleChance.predictedOutcome);
    if (dcHit) hitsDC++;
    const dcProb = pred.marketDoubleChance[pred.marketDoubleChance.predictedOutcome];
    sumBrierDC += Math.pow(dcProb - (dcHit ? 1 : 0), 2);

    // Calibration Band Accumulation (tested on home win probability)
    const pCandidate = pred.market1X2.homeWin;
    const isSuccess = oH;
    for (const b of bands) {
      if (pCandidate >= b.min && (pCandidate < b.max || (b.max === 1.0 && pCandidate <= 1.0))) {
        b.predSum += pCandidate;
        b.actualSum += isSuccess;
        b.count++;
        break;
      }
    }
  });

  const n = settled.length;

  return {
    totalEvaluated: n,
    logLoss: {
      market1X2: Number((sumLogLoss1X2 / n).toFixed(4)),
      marketBTTS: Number((sumLogLossBTTS / n).toFixed(4)),
      marketOverUnder25: Number((sumLogLossOU / n).toFixed(4)),
    },
    brierScore: {
      market1X2: Number((sumBrier1X2 / n).toFixed(4)),
      marketBTTS: Number((sumBrierBTTS / n).toFixed(4)),
      marketOverUnder25: Number((sumBrierOU / n).toFixed(4)),
      marketDoubleChance: Number((sumBrierDC / n).toFixed(4)),
    },
    hitRate: {
      market1X2: Number((hits1X2 / n).toFixed(4)),
      marketBTTS: Number((hitsBTTS / n).toFixed(4)),
      marketOverUnder25: Number((hitsOU / n).toFixed(4)),
      marketDoubleChance: Number((hitsDC / n).toFixed(4)),
      overall: Number(((hits1X2 + hitsBTTS + hitsOU + hitsDC) / (n * 4)).toFixed(4)),
    },
    byCompetition: Object.entries(compStats).map(([compName, data]) => ({
      competitionName: compName,
      sampleSize: data.total,
      accuracy: Number((data.hits / data.total).toFixed(4)),
      brierScore: Number((data.brierSum / data.total).toFixed(4)),
    })),
    calibrationBands: bands.map(b => ({
      predictedRange: b.label,
      predictedAvg: b.count > 0 ? Number((b.predSum / b.count).toFixed(3)) : (b.min + b.max) / 2,
      actualObserved: b.count > 0 ? Number((b.actualSum / b.count).toFixed(3)) : 0,
      count: b.count,
    })),
  };
}

export type OutcomeDistributionMarketKey =
  | 'ALL'
  | '1X2'
  | 'BTTS'
  | 'OVER_UNDER_25'
  | 'HT_FT'
  | 'DOUBLE_CHANCE';

export interface OutcomeBreakdownItem {
  fixtureId: string;
  matchLabel: string;
  competition: string;
  market: Exclude<OutcomeDistributionMarketKey, 'ALL'>;
  predictedPick: string;
  actualResult: string;
  outcome: 'WON' | 'LOST' | 'PENDING' | 'VOID';
  probability: number;
  kickoffTimeUtc: string;
}

export interface MarketOutcomeCounts {
  won: number;
  lost: number;
  pending: number;
  voided: number;
  settledTotal: number;
  total: number;
  accuracyPct: number;
}

export interface OutcomeDistributionStats {
  won: number;
  lost: number;
  pending: number;
  voided: number;
  total: number;
  settledTotal: number;
  settledAccuracyPct: number;
  byMarket: Record<Exclude<OutcomeDistributionMarketKey, 'ALL'>, MarketOutcomeCounts>;
  items: OutcomeBreakdownItem[];
}

export function settleCompletedFixture(fixture: Fixture): Fixture {
  if (fixture.status !== 'FT' || !fixture.prediction) {
    return fixture;
  }

  const pred = fixture.prediction;
  const h = fixture.scores.currentHome;
  const a = fixture.scores.currentAway;
  const hasVerifiedHt =
    typeof fixture.scores.htHome === 'number' &&
    typeof fixture.scores.htAway === 'number';
  const htH = hasVerifiedHt ? (fixture.scores.htHome as number) : null;
  const htA = hasVerifiedHt ? (fixture.scores.htAway as number) : null;

  const expectedScoreLabel = `${h} - ${a}${
    hasVerifiedHt ? ` (HT: ${htH} - ${htA})` : ''
  }`;

  // If already settled with the exact same verified score & HT availability, keep idempotent
  if (
    pred.settlement &&
    pred.settlement.actualScore === expectedScoreLabel
  ) {
    return fixture;
  }

  const actual1X2 = h > a ? '1' : h === a ? 'X' : '2';
  const actualBTTS = h > 0 && a > 0 ? 'YES' : 'NO';
  const actualOU25 = h + a >= 3 ? 'OVER' : 'UNDER';
  const actualDoubleChance =
    actual1X2 === '1' ? ['1X', '12'] : actual1X2 === 'X' ? ['1X', 'X2'] : ['X2', '12'];

  const win1X2 = pred.market1X2.predictedOutcome === actual1X2;
  const winBTTS = pred.marketBTTS.predictedOutcome === actualBTTS;
  const winOU = pred.marketOverUnder25.predictedOutcome === actualOU25;
  const winDC = actualDoubleChance.includes(pred.marketDoubleChance.predictedOutcome);

  let marketHtFtResult: 'WON' | 'LOST' | 'VOID' = 'VOID';
  if (hasVerifiedHt && htH !== null && htA !== null) {
    const htOutcome = htH > htA ? 'H' : htH === htA ? 'D' : 'A';
    const ftOutcome = h > a ? 'H' : h === a ? 'D' : 'A';
    const actualHtFt = `${htOutcome}${ftOutcome}`;
    marketHtFtResult = pred.marketHtFt.predictedOutcome === actualHtFt ? 'WON' : 'LOST';
  }

  return {
    ...fixture,
    prediction: {
      ...pred,
      settlement: {
        status: win1X2 ? 'WON' : 'LOST',
        verifiedAt: fixture.lastUpdatedUtc,
        actualScore: expectedScoreLabel,
        settledMarkets: {
          market1X2: win1X2 ? 'WON' : 'LOST',
          marketBTTS: winBTTS ? 'WON' : 'LOST',
          marketOverUnder25: winOU ? 'WON' : 'LOST',
          marketHtFt: marketHtFtResult,
          marketDoubleChance: winDC ? 'WON' : 'LOST',
        },
      },
    },
  };
}

function emptyMarketCounts(): MarketOutcomeCounts {
  return { won: 0, lost: 0, pending: 0, voided: 0, settledTotal: 0, total: 0, accuracyPct: 0 };
}

export function computeOutcomeDistribution(
  fixtures: Fixture[],
  marketFilter: OutcomeDistributionMarketKey = 'ALL'
): OutcomeDistributionStats {
  const byMarket: Record<Exclude<OutcomeDistributionMarketKey, 'ALL'>, MarketOutcomeCounts> = {
    '1X2': emptyMarketCounts(),
    BTTS: emptyMarketCounts(),
    OVER_UNDER_25: emptyMarketCounts(),
    HT_FT: emptyMarketCounts(),
    DOUBLE_CHANCE: emptyMarketCounts(),
  };

  const items: OutcomeBreakdownItem[] = [];

  for (const rawFix of fixtures) {
    const f = settleCompletedFixture(rawFix);
    const pred = f.prediction;
    if (!pred || pred.isAbstained) continue;

    const matchLabel = `${f.homeTeam.name} vs ${f.awayTeam.name}`;
    const isCompleted = f.status === 'FT' && Boolean(pred.settlement);
    const isVoid = f.status === 'POSTP' || f.status === 'CANC';
    const actualScoreLabel = isCompleted
      ? pred.settlement?.actualScore || `${f.scores.currentHome} - ${f.scores.currentAway}`
      : f.status === 'LIVE' || f.status === 'HT'
      ? `Live ${f.scores.currentHome} - ${f.scores.currentAway}`
      : 'Scheduled';

    const marketEntries: {
      key: Exclude<OutcomeDistributionMarketKey, 'ALL'>;
      pick: string;
      prob: number;
      settled?: 'WON' | 'LOST' | 'VOID';
    }[] = [
      {
        key: '1X2',
        pick: pred.market1X2.predictedOutcome,
        prob:
          pred.market1X2.predictedOutcome === '1'
            ? pred.market1X2.homeWin
            : pred.market1X2.predictedOutcome === 'X'
            ? pred.market1X2.draw
            : pred.market1X2.awayWin,
        settled: pred.settlement?.settledMarkets.market1X2,
      },
      {
        key: 'BTTS',
        pick: pred.marketBTTS.predictedOutcome,
        prob: pred.marketBTTS.predictedOutcome === 'YES' ? pred.marketBTTS.yes : pred.marketBTTS.no,
        settled: pred.settlement?.settledMarkets.marketBTTS,
      },
      {
        key: 'OVER_UNDER_25',
        pick: pred.marketOverUnder25.predictedOutcome,
        prob:
          pred.marketOverUnder25.predictedOutcome === 'OVER'
            ? pred.marketOverUnder25.over
            : pred.marketOverUnder25.under,
        settled: pred.settlement?.settledMarkets.marketOverUnder25,
      },
      {
        key: 'DOUBLE_CHANCE',
        pick: pred.marketDoubleChance.predictedOutcome,
        prob: pred.marketDoubleChance[pred.marketDoubleChance.predictedOutcome],
        settled: pred.settlement?.settledMarkets.marketDoubleChance,
      },
      {
        key: 'HT_FT',
        pick: pred.marketHtFt.predictedOutcome,
        prob: pred.marketHtFt.probabilities[pred.marketHtFt.predictedOutcome],
        settled: pred.settlement?.settledMarkets.marketHtFt,
      },
    ];

    for (const entry of marketEntries) {
      const outcome: 'WON' | 'LOST' | 'PENDING' | 'VOID' = isVoid
        ? 'VOID'
        : isCompleted && entry.settled
        ? entry.settled
        : 'PENDING';

      const bucket = byMarket[entry.key];
      bucket.total++;
      if (outcome === 'WON') bucket.won++;
      else if (outcome === 'LOST') bucket.lost++;
      else if (outcome === 'VOID') bucket.voided++;
      else bucket.pending++;

      if (marketFilter === 'ALL' || marketFilter === entry.key) {
        items.push({
          fixtureId: f.id,
          matchLabel,
          competition: f.competition.name,
          market: entry.key,
          predictedPick: entry.pick,
          actualResult: actualScoreLabel,
          outcome,
          probability: entry.prob,
          kickoffTimeUtc: f.kickoffTimeUtc,
        });
      }
    }
  }

  for (const key of Object.keys(byMarket) as Exclude<OutcomeDistributionMarketKey, 'ALL'>[]) {
    const b = byMarket[key];
    b.settledTotal = b.won + b.lost;
    b.accuracyPct = b.settledTotal > 0 ? Number(((b.won / b.settledTotal) * 100).toFixed(1)) : 0;
  }

  let won = 0;
  let lost = 0;
  let pending = 0;
  let voided = 0;

  if (marketFilter === 'ALL') {
    for (const key of Object.keys(byMarket) as Exclude<OutcomeDistributionMarketKey, 'ALL'>[]) {
      won += byMarket[key].won;
      lost += byMarket[key].lost;
      pending += byMarket[key].pending;
      voided += byMarket[key].voided;
    }
  } else {
    const selected = byMarket[marketFilter];
    won = selected.won;
    lost = selected.lost;
    pending = selected.pending;
    voided = selected.voided;
  }

  const settledTotal = won + lost;
  const total = won + lost + pending + voided;
  const settledAccuracyPct =
    settledTotal > 0 ? Number(((won / settledTotal) * 100).toFixed(1)) : 0;

  return {
    won,
    lost,
    pending,
    voided,
    total,
    settledTotal,
    settledAccuracyPct,
    byMarket,
    items,
  };
}

