import {
  OptaPredictionsPayload,
  OptaTeamMatchStats,
} from '../../types/opta';
import {
  Fixture,
  Market1X2,
  MarketBTTS,
  MarketOverUnder25,
  MarketDoubleChance,
  MarketHtFt,
} from '../../types/football';
import { QuantitativePredictionEngine } from '../predictionEngine';

export interface MarketOverUnderThreshold {
  threshold: 0.5 | 1.5 | 2.5 | 3.5;
  over: number;
  under: number;
  predictedOutcome: 'OVER' | 'UNDER';
}

export interface MarketCleanSheet {
  homeCleanSheet: number;          // Probability Away scores 0
  awayCleanSheet: number;          // Probability Home scores 0
  predictedOutcome: 'HOME_CS' | 'AWAY_CS' | 'BOTH_CONCEDE' | 'BOTH_CS';
}

export interface MarketTeamToScore {
  homeToScore: number;             // Probability Home scores >= 1
  awayToScore: number;             // Probability Away scores >= 1
  bothToScore: number;             // BTTS Yes
  neitherToScore: number;          // 0-0 exact
  predictedOutcome: 'BOTH' | 'HOME_ONLY' | 'AWAY_ONLY' | 'NEITHER';
}

export interface MarketHalfGoals {
  firstHalf: {
    over05: number;
    under05: number;
    over15: number;
    under15: number;
    predictedOutcome: string;
  };
  secondHalf: {
    over05: number;
    under05: number;
    over15: number;
    under15: number;
    predictedOutcome: string;
  };
}

export interface FullOptaPredictionSuite {
  fixtureId: string;
  provenance: {
    officialOptaAvailable: boolean;
    officialProviderName: string;
    inHouseModelName: string;
    datasetSource: string;
    calculatedAt: string;
  };

  // 1. Official Opta Predictions (MA21 Supercomputer Feed)
  officialOpta?: {
    market1X2: {
      homeWin: number;
      draw: number;
      awayWin: number;
      predictedOutcome: '1' | 'X' | '2';
    };
    powerRankings: {
      home: number;
      away: number;
    };
    simulationRuns: number;
    publishedAt: string;
  };

  // 2. FootballIQ In-House Multi-Market Probability Model (Calibrated on Opta xG & Events)
  inHouse: {
    homeLambda: number;
    awayLambda: number;
    rollingXgHome: number;
    rollingXgAway: number;
    market1X2: Market1X2;
    marketDoubleChance: MarketDoubleChance;
    marketBTTS: MarketBTTS;
    marketOverUnder05: MarketOverUnderThreshold;
    marketOverUnder15: MarketOverUnderThreshold;
    marketOverUnder25: MarketOverUnder25;
    marketOverUnder35: MarketOverUnderThreshold;
    marketHalfGoals: MarketHalfGoals;
    marketHtFt: MarketHtFt;
    marketCleanSheet: MarketCleanSheet;
    marketTeamToScore: MarketTeamToScore;
  };
}

/**
 * Calculates discrete Over/Under for any specified threshold from a normalized score matrix
 */
export function deriveOverUnderThreshold(
  matrix: number[][],
  threshold: 0.5 | 1.5 | 2.5 | 3.5
): MarketOverUnderThreshold {
  let under = 0;
  let over = 0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const prob = matrix[h][a];
      if (h + a < threshold) {
        under += prob;
      } else {
        over += prob;
      }
    }
  }

  const total = over + under || 1.0;
  const normOver = Number((over / total).toFixed(4));
  const normUnder = Number((under / total).toFixed(4));

  return {
    threshold,
    over: normOver,
    under: normUnder,
    predictedOutcome: normOver >= normUnder ? 'OVER' : 'UNDER',
  };
}

/**
 * Calculates Clean Sheet probabilities from the score matrix
 */
export function deriveCleanSheet(matrix: number[][]): MarketCleanSheet {
  let awayScoresZero = 0; // Home clean sheet
  let homeScoresZero = 0; // Away clean sheet

  for (let h = 0; h < matrix.length; h++) {
    awayScoresZero += matrix[h][0] || 0;
  }

  for (let a = 0; a < matrix[0]?.length || 0; a++) {
    homeScoresZero += matrix[0][a] || 0;
  }

  const pHomeCs = Number(Math.min(1.0, Math.max(0, awayScoresZero)).toFixed(4));
  const pAwayCs = Number(Math.min(1.0, Math.max(0, homeScoresZero)).toFixed(4));

  let outcome: MarketCleanSheet['predictedOutcome'] = 'BOTH_CONCEDE';
  if (pHomeCs > 0.5 && pAwayCs > 0.5) outcome = 'BOTH_CS';
  else if (pHomeCs > pAwayCs && pHomeCs > 0.45) outcome = 'HOME_CS';
  else if (pAwayCs > pHomeCs && pAwayCs > 0.45) outcome = 'AWAY_CS';

  return {
    homeCleanSheet: pHomeCs,
    awayCleanSheet: pAwayCs,
    predictedOutcome: outcome,
  };
}

/**
 * Calculates Team to Score markets from the score matrix
 */
export function deriveTeamToScore(matrix: number[][]): MarketTeamToScore {
  const p00 = matrix[0]?.[0] || 0;
  let homeScoresZero = 0;
  let awayScoresZero = 0;

  for (let a = 0; a < matrix[0]?.length || 0; a++) {
    homeScoresZero += matrix[0][a] || 0;
  }
  for (let h = 0; h < matrix.length; h++) {
    awayScoresZero += matrix[h][0] || 0;
  }

  const homeToScore = Number(Math.max(0, 1 - homeScoresZero).toFixed(4));
  const awayToScore = Number(Math.max(0, 1 - awayScoresZero).toFixed(4));
  const neitherToScore = Number(p00.toFixed(4));

  let bothToScore = 0;
  for (let h = 1; h < matrix.length; h++) {
    for (let a = 1; a < matrix[h].length; a++) {
      bothToScore += matrix[h][a] || 0;
    }
  }
  const normBoth = Number(bothToScore.toFixed(4));

  let predictedOutcome: MarketTeamToScore['predictedOutcome'] = 'BOTH';
  const maxVal = Math.max(normBoth, homeToScore - normBoth, awayToScore - normBoth, neitherToScore);
  if (maxVal === neitherToScore) predictedOutcome = 'NEITHER';
  else if (maxVal === homeToScore - normBoth) predictedOutcome = 'HOME_ONLY';
  else if (maxVal === awayToScore - normBoth) predictedOutcome = 'AWAY_ONLY';

  return {
    homeToScore,
    awayToScore,
    bothToScore: normBoth,
    neitherToScore,
    predictedOutcome,
  };
}

/**
 * Calculates First-Half and Second-Half Goals from lambdas
 */
export function deriveHalfGoals(homeLambda: number, awayLambda: number): MarketHalfGoals {
  // First half typically represents 45% of total match goal expectancy
  const htFactor = 0.45;
  const htHome = homeLambda * htFactor;
  const htAway = awayLambda * htFactor;

  // Poisson P(0 goals) = e^(-(htHome + htAway))
  const pHtZero = Math.exp(-(htHome + htAway));
  const htOver05 = Number(Math.max(0, 1 - pHtZero).toFixed(4));
  const htUnder05 = Number(pHtZero.toFixed(4));

  // P(1 goal) = (htHome + htAway) * e^(-(htHome + htAway))
  const pHtOne = (htHome + htAway) * pHtZero;
  const htOver15 = Number(Math.max(0, 1 - (pHtZero + pHtOne)).toFixed(4));
  const htUnder15 = Number((pHtZero + pHtOne).toFixed(4));

  // Second half represents ~55% of match goals
  const shFactor = 0.55;
  const shHome = homeLambda * shFactor;
  const shAway = awayLambda * shFactor;
  const pShZero = Math.exp(-(shHome + shAway));
  const shOver05 = Number(Math.max(0, 1 - pShZero).toFixed(4));
  const shUnder05 = Number(pShZero.toFixed(4));
  const pShOne = (shHome + shAway) * pShZero;
  const shOver15 = Number(Math.max(0, 1 - (pShZero + pShOne)).toFixed(4));
  const shUnder15 = Number((pShZero + pShOne).toFixed(4));

  return {
    firstHalf: {
      over05: htOver05,
      under05: htUnder05,
      over15: htOver15,
      under15: htUnder15,
      predictedOutcome: htOver05 >= htUnder05 ? 'OVER_0.5_HT' : 'UNDER_0.5_HT',
    },
    secondHalf: {
      over05: shOver05,
      under05: shUnder05,
      over15: shOver15,
      under15: shUnder15,
      predictedOutcome: shOver05 >= shUnder05 ? 'OVER_0.5_2H' : 'UNDER_0.5_2H',
    },
  };
}

/**
 * Opta Prediction Bridge
 * Generates all 12 requested markets and maintains strict provenance separation
 */
export class OptaPredictionBridge {
  public static buildFullPredictionSuite(
    fixture: Fixture,
    optaStats?: { home: OptaTeamMatchStats; away: OptaTeamMatchStats },
    officialOptaPrediction?: OptaPredictionsPayload
  ): FullOptaPredictionSuite {
    // 1. Calculate lambdas with Opta rolling xG enhancement if present
    const homeXg = optaStats?.home?.xgTotal || fixture.homeTeam.avgXg || 1.5;
    const awayXg = optaStats?.away?.xgTotal || fixture.awayTeam.avgXg || 1.1;

    // Weight 60% historical ratings + 40% Opta rolling expected goals
    const baseLambdas = QuantitativePredictionEngine.calculateLambdas(
      fixture.homeTeam,
      fixture.awayTeam,
      fixture.competition
    );

    const tunedHomeLambda = Number((baseLambdas.homeLambda * 0.6 + homeXg * 0.4).toFixed(4));
    const tunedAwayLambda = Number((baseLambdas.awayLambda * 0.6 + awayXg * 0.4).toFixed(4));

    const matrix = QuantitativePredictionEngine.computeScoreMatrix(tunedHomeLambda, tunedAwayLambda);

    const market1X2 = QuantitativePredictionEngine.derive1X2(matrix);
    const marketDoubleChance = QuantitativePredictionEngine.deriveDoubleChance(market1X2);
    const marketBTTS = QuantitativePredictionEngine.deriveBTTS(matrix);
    const marketOverUnder25 = QuantitativePredictionEngine.deriveOverUnder25(matrix);
    const marketOverUnder05 = deriveOverUnderThreshold(matrix, 0.5);
    const marketOverUnder15 = deriveOverUnderThreshold(matrix, 1.5);
    const marketOverUnder35 = deriveOverUnderThreshold(matrix, 3.5);
    const marketHtFt = QuantitativePredictionEngine.deriveHtFt(tunedHomeLambda, tunedAwayLambda);
    const marketCleanSheet = deriveCleanSheet(matrix);
    const marketTeamToScore = deriveTeamToScore(matrix);
    const marketHalfGoals = deriveHalfGoals(tunedHomeLambda, tunedAwayLambda);

    return {
      fixtureId: fixture.id,
      provenance: {
        officialOptaAvailable: Boolean(officialOptaPrediction),
        officialProviderName: 'Opta Supercomputer (Stats Perform MA21 Feed)',
        inHouseModelName: 'FootballIQ Dixon-Coles Bivariate Poisson (Opta-Calibrated)',
        datasetSource: 'Opta Sports Data API (SDAPI v1)',
        calculatedAt: new Date().toISOString(),
      },
      officialOpta: officialOptaPrediction
        ? {
            market1X2: {
              homeWin: officialOptaPrediction.homeWinProbability,
              draw: officialOptaPrediction.drawProbability,
              awayWin: officialOptaPrediction.awayWinProbability,
              predictedOutcome: officialOptaPrediction.predictedOutcome,
            },
            powerRankings: {
              home: officialOptaPrediction.homePowerRanking,
              away: officialOptaPrediction.awayPowerRanking,
            },
            simulationRuns: officialOptaPrediction.simulationRuns,
            publishedAt: officialOptaPrediction.publishedAt,
          }
        : undefined,
      inHouse: {
        homeLambda: tunedHomeLambda,
        awayLambda: tunedAwayLambda,
        rollingXgHome: homeXg,
        rollingXgAway: awayXg,
        market1X2,
        marketDoubleChance,
        marketBTTS,
        marketOverUnder05,
        marketOverUnder15,
        marketOverUnder25,
        marketOverUnder35,
        marketHalfGoals,
        marketHtFt,
        marketCleanSheet,
        marketTeamToScore,
      },
    };
  }
}
