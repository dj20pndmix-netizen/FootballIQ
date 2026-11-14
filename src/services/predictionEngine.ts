import {
  Fixture,
  FixturePrediction,
  Market1X2,
  MarketBTTS,
  MarketOverUnder25,
  MarketHtFt,
  MarketDoubleChance,
  Market1X2Interval10,
  HtFtOutcome,
  DataQualityStatus,
  PoissonDistribution,
  Team,
  Competition,
} from '../types/football';

/**
 * Football Quantitative Probability Engine
 * Implements Bivariate Poisson & Dixon-Coles Goal Distributions
 */

// Factorial helper with lookup memoization
const FACTORIAL_CACHE: number[] = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
function factorial(n: number): number {
  if (n < 0) return 1;
  if (n < FACTORIAL_CACHE.length) return FACTORIAL_CACHE[n];
  let res = FACTORIAL_CACHE[FACTORIAL_CACHE.length - 1];
  for (let i = FACTORIAL_CACHE.length; i <= n; i++) {
    res *= i;
  }
  return res;
}

/**
 * Standard Poisson Probability Mass Function: P(k; λ) = (λ^k * e^(-λ)) / k!
 */
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Dixon-Coles Tau Adjustment factor for low-scoring dependencies:
 * Adjusts joint probabilities for (0,0), (1,0), (0,1), and (1,1) scorelines.
 */
function dixonColesTau(x: number, y: number, lambda: number, mu: number, rho: number = -0.11): number {
  if (x === 0 && y === 0) {
    return 1 - lambda * mu * rho;
  } else if (x === 0 && y === 1) {
    return 1 + lambda * rho;
  } else if (x === 1 && y === 0) {
    return 1 + mu * rho;
  } else if (x === 1 && y === 1) {
    return 1 - rho;
  }
  return 1.0;
}

export interface EngineInput {
  homeTeam: Team;
  awayTeam: Team;
  competition: Competition;
  homeAdvantageFactor?: number;
  dixonColesRho?: number;
}

export class QuantitativePredictionEngine {
  public static readonly MODEL_VERSION = 'v2.4-dixon-coles-poisson';

  /**
   * Evaluates the data-quality gate before generating predictions.
   */
  public static assessDataQuality(homeTeam: Team, awayTeam: Team): {
    status: DataQualityStatus;
    reason?: string;
  } {
    if (!homeTeam || !awayTeam) {
      return { status: 'INVALID', reason: 'Missing participant definitions.' };
    }
    if (homeTeam.id === awayTeam.id) {
      return { status: 'INVALID', reason: 'Identical home and away participant.' };
    }
    if (homeTeam.formLast5.length === 0 || awayTeam.formLast5.length === 0) {
      return { status: 'LIMITED_DATA', reason: 'Insufficient recent match history.' };
    }
    if (homeTeam.attackRating <= 0 || awayTeam.defenseRating <= 0) {
      return { status: 'INVALID', reason: 'Negative or non-computable ratings.' };
    }
    return { status: 'VALID' };
  }

  /**
   * Computes expected goal rates (lambdas) for home and away teams.
   */
  public static calculateLambdas(
    homeTeam: Team, 
    awayTeam: Team, 
    competition: Competition,
    homeAdvantage = 1.12
  ): { homeLambda: number; awayLambda: number } {
    const baseHomeGoals = competition.leagueAvgHomeGoals || 1.48;
    const baseAwayGoals = competition.leagueAvgAwayGoals || 1.18;

    // Home Expected Goals: Home Attack * Away Defense * League Base * Home Advantage
    const homeLambda = Math.max(0.2, homeTeam.attackRating * awayTeam.defenseRating * baseHomeGoals * homeAdvantage);

    // Away Expected Goals: Away Attack * Home Defense * League Base
    const awayLambda = Math.max(0.2, awayTeam.attackRating * homeTeam.defenseRating * baseAwayGoals);

    return {
      homeLambda: Number(homeLambda.toFixed(4)),
      awayLambda: Number(awayLambda.toFixed(4)),
    };
  }

  /**
   * Generates a 7x7 scoreline probability matrix using Dixon-Coles adjusted Poisson.
   */
  public static computeScoreMatrix(
    homeLambda: number, 
    awayLambda: number, 
    rho = -0.09,
    maxGoals = 6
  ): number[][] {
    const matrix: number[][] = [];
    let sumTotal = 0;

    for (let h = 0; h <= maxGoals; h++) {
      matrix[h] = [];
      const pHome = poissonPmf(h, homeLambda);
      for (let a = 0; a <= maxGoals; a++) {
        const pAway = poissonPmf(a, awayLambda);
        const tau = dixonColesTau(h, a, homeLambda, awayLambda, rho);
        const jointProb = Math.max(0, pHome * pAway * tau);
        matrix[h][a] = jointProb;
        sumTotal += jointProb;
      }
    }

    // Normalize matrix so probabilities sum exactly to 1.0
    if (sumTotal > 0) {
      for (let h = 0; h <= maxGoals; h++) {
        for (let a = 0; a <= maxGoals; a++) {
          matrix[h][a] = matrix[h][a] / sumTotal;
        }
      }
    }

    return matrix;
  }

  /**
   * Calculates 1X2 market probabilities from the score matrix.
   */
  public static derive1X2(matrix: number[][]): Market1X2 {
    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;

    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        const prob = matrix[h][a];
        if (h > a) homeWin += prob;
        else if (h === a) draw += prob;
        else awayWin += prob;
      }
    }

    const total = homeWin + draw + awayWin;
    const normHome = homeWin / total;
    const normDraw = draw / total;
    const normAway = awayWin / total;

    // Highest probability outcome is strictly selected
    let predictedOutcome: '1' | 'X' | '2' = '1';
    const maxVal = Math.max(normHome, normDraw, normAway);
    if (maxVal === normAway) predictedOutcome = '2';
    else if (maxVal === normDraw) predictedOutcome = 'X';

    return {
      homeWin: Number(normHome.toFixed(4)),
      draw: Number(normDraw.toFixed(4)),
      awayWin: Number(normAway.toFixed(4)),
      predictedOutcome,
    };
  }

  /**
   * Calculates Both Teams To Score (BTTS) from the score matrix.
   */
  public static deriveBTTS(matrix: number[][]): MarketBTTS {
    let yes = 0;
    let no = 0;

    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        const prob = matrix[h][a];
        if (h > 0 && a > 0) {
          yes += prob;
        } else {
          no += prob;
        }
      }
    }

    const total = yes + no;
    const normYes = yes / total;
    const normNo = no / total;

    return {
      yes: Number(normYes.toFixed(4)),
      no: Number(normNo.toFixed(4)),
      predictedOutcome: normYes >= normNo ? 'YES' : 'NO',
    };
  }

  /**
   * Calculates Over / Under 2.5 Total Goals from the score matrix.
   */
  public static deriveOverUnder25(matrix: number[][]): MarketOverUnder25 {
    let under = 0;
    let over = 0;

    for (let h = 0; h < matrix.length; h++) {
      for (let a = 0; a < matrix[h].length; a++) {
        const prob = matrix[h][a];
        if (h + a <= 2) {
          under += prob;
        } else {
          over += prob;
        }
      }
    }

    const total = over + under;
    const normOver = over / total;
    const normUnder = under / total;

    return {
      over: Number(normOver.toFixed(4)),
      under: Number(normUnder.toFixed(4)),
      predictedOutcome: normOver >= normUnder ? 'OVER' : 'UNDER',
    };
  }

  /**
   * Calculates Double Chance directly and mathematically from 1X2 probabilities.
   * 1X = Home + Draw
   * X2 = Draw + Away
   * 12 = Home + Away
   */
  public static deriveDoubleChance(market1X2: Market1X2): MarketDoubleChance {
    const dc1X = market1X2.homeWin + market1X2.draw;
    const dcX2 = market1X2.draw + market1X2.awayWin;
    const dc12 = market1X2.homeWin + market1X2.awayWin;

    let predictedOutcome: '1X' | 'X2' | '12' = '1X';
    const maxVal = Math.max(dc1X, dcX2, dc12);
    if (maxVal === dcX2) predictedOutcome = 'X2';
    else if (maxVal === dc12) predictedOutcome = '12';

    return {
      '1X': Number(dc1X.toFixed(4)),
      'X2': Number(dcX2.toFixed(4)),
      '12': Number(dc12.toFixed(4)),
      predictedOutcome,
    };
  }

  /**
   * Calculates Half-Time / Full-Time (HT/FT) 9 joint outcomes.
   * Uses independent time-slice bivariate goal models for 1st half vs 2nd half.
   */
  public static deriveHtFt(homeLambda: number, awayLambda: number): MarketHtFt {
    // ~44% of goals in 1st half, ~56% in 2nd half
    const htHomeLambda = homeLambda * 0.44;
    const htAwayLambda = awayLambda * 0.44;
    const shHomeLambda = homeLambda * 0.56;
    const shAwayLambda = awayLambda * 0.56;

    const htMatrix = this.computeScoreMatrix(htHomeLambda, htAwayLambda, 0, 4);
    const shMatrix = this.computeScoreMatrix(shHomeLambda, shAwayLambda, 0, 4);

    const outcomes: Record<HtFtOutcome, number> = {
      HH: 0, HD: 0, HA: 0,
      DH: 0, DD: 0, DA: 0,
      AH: 0, AD: 0, AA: 0,
    };

    // Iterate through all 1st half scores and 2nd half increments
    for (let h1 = 0; h1 < htMatrix.length; h1++) {
      for (let a1 = 0; a1 < htMatrix[h1].length; a1++) {
        const p1 = htMatrix[h1][a1];
        const htState = h1 > a1 ? 'H' : h1 === a1 ? 'D' : 'A';

        for (let h2 = 0; h2 < shMatrix.length; h2++) {
          for (let a2 = 0; a2 < shMatrix[h2].length; a2++) {
            const p2 = shMatrix[h2][a2];
            const ftH = h1 + h2;
            const ftA = a1 + a2;
            const ftState = ftH > ftA ? 'H' : ftH === ftA ? 'D' : 'A';

            const key = `${htState}${ftState}` as HtFtOutcome;
            outcomes[key] += p1 * p2;
          }
        }
      }
    }

    // Normalize outcomes to sum strictly to 1.0
    const sumHtFt = Object.values(outcomes).reduce((acc, v) => acc + v, 0);
    let maxOutcome: HtFtOutcome = 'HH';
    let maxProb = -1;

    for (const key of Object.keys(outcomes) as HtFtOutcome[]) {
      outcomes[key] = Number((outcomes[key] / sumHtFt).toFixed(4));
      if (outcomes[key] > maxProb) {
        maxProb = outcomes[key];
        maxOutcome = key;
      }
    }

    return {
      probabilities: outcomes,
      predictedOutcome: maxOutcome,
    };
  }

  /**
   * Calculates 1X2 - Interval 10 minutes (00:01 - 09:59).
   * Models the joint probability distribution at minute 09:59 using time-slice Poisson arrival rates.
   * 1 = Home leads at 09:59 (e.g. 1-0)
   * X = Score tied at 09:59 (0-0, 1-1)
   * 2 = Away leads at 09:59 (e.g. 0-1)
   */
  public static derive1X2Interval10(homeLambda: number, awayLambda: number): Market1X2Interval10 {
    // Opening 10 minutes exhibits lower scoring tempo (~8.8% of 90-minute goal arrivals)
    const intHomeLambda = Math.max(0.02, homeLambda * 0.088);
    const intAwayLambda = Math.max(0.02, awayLambda * 0.088);
    const intervalMatrix = this.computeScoreMatrix(intHomeLambda, intAwayLambda, -0.05, 3);

    let homeLead = 0;
    let draw = 0;
    let awayLead = 0;

    for (let h = 0; h < intervalMatrix.length; h++) {
      for (let a = 0; a < intervalMatrix[h].length; a++) {
        const prob = intervalMatrix[h][a];
        if (h > a) homeLead += prob;
        else if (h === a) draw += prob;
        else awayLead += prob;
      }
    }

    const total = homeLead + draw + awayLead;
    const normHome = homeLead / total;
    const normDraw = draw / total;
    const normAway = awayLead / total;

    // Highest probability outcome is selected (in early intervals, typically X due to 0-0 predominance)
    let predictedOutcome: '1' | 'X' | '2' = 'X';
    const maxVal = Math.max(normHome, normDraw, normAway);
    if (maxVal === normHome) predictedOutcome = '1';
    else if (maxVal === normAway) predictedOutcome = '2';

    const prob00 = intervalMatrix[0]?.[0] || 0.85;

    return {
      homeWin: Number(normHome.toFixed(4)),
      draw: Number(normDraw.toFixed(4)),
      awayWin: Number(normAway.toFixed(4)),
      predictedOutcome,
      earlyGoalProbability: Number(Math.max(0, 1 - prob00).toFixed(4)),
      mostLikelyScore: '0 - 0',
    };
  }

  /**
   * Main calculation pipeline: produces a full fixture prediction across all markets.
   */
  public static generatePrediction(fixture: Fixture): FixturePrediction {
    const quality = this.assessDataQuality(fixture.homeTeam, fixture.awayTeam);
    
    // Check abstention threshold
    if (quality.status === 'INVALID' || quality.status === 'WITHHELD') {
      return {
        id: `pred-${fixture.id}`,
        fixtureId: fixture.id,
        modelVersion: this.MODEL_VERSION,
        calculatedAt: new Date().toISOString(),
        dataQuality: quality.status,
        qualityReason: quality.reason,
        isAbstained: true,
        market1X2: { homeWin: 0, draw: 0, awayWin: 0, predictedOutcome: '1' },
        marketBTTS: { yes: 0, no: 0, predictedOutcome: 'YES' },
        marketOverUnder25: { over: 0, under: 0, predictedOutcome: 'UNDER' },
        marketHtFt: { probabilities: { HH: 0, HD: 0, HA: 0, DH: 0, DD: 0, DA: 0, AH: 0, AD: 0, AA: 0 }, predictedOutcome: 'HH' },
        marketDoubleChance: { '1X': 0, 'X2': 0, '12': 0, predictedOutcome: '1X' },
        market1X2Interval10: { homeWin: 0, draw: 0, awayWin: 0, predictedOutcome: 'X', earlyGoalProbability: 0, mostLikelyScore: '0 - 0' },
        poisson: { homeLambda: 0, awayLambda: 0, scoreMatrix: [], mostLikelyScore: { home: 0, away: 0, probability: 0 } },
        confidenceScore: 0,
      };
    }

    const { homeLambda, awayLambda } = this.calculateLambdas(
      fixture.homeTeam,
      fixture.awayTeam,
      fixture.competition
    );

    const scoreMatrix = this.computeScoreMatrix(homeLambda, awayLambda);

    // Find most likely exact score
    let highestScoreProb = -1;
    let mostLikelyScore = { home: 1, away: 0, probability: 0 };
    for (let h = 0; h < scoreMatrix.length; h++) {
      for (let a = 0; a < scoreMatrix[h].length; a++) {
        if (scoreMatrix[h][a] > highestScoreProb) {
          highestScoreProb = scoreMatrix[h][a];
          mostLikelyScore = { home: h, away: a, probability: Number(highestScoreProb.toFixed(4)) };
        }
      }
    }

    const market1X2 = this.derive1X2(scoreMatrix);
    const marketBTTS = this.deriveBTTS(scoreMatrix);
    const marketOverUnder25 = this.deriveOverUnder25(scoreMatrix);
    const marketDoubleChance = this.deriveDoubleChance(market1X2);
    const marketHtFt = this.deriveHtFt(homeLambda, awayLambda);
    const market1X2Interval10 = this.derive1X2Interval10(homeLambda, awayLambda);

    // Confidence metric (completeness of inputs, sample size)
    const formSample = (fixture.homeTeam.formLast5.length + fixture.awayTeam.formLast5.length) / 10;
    const confidenceScore = Math.round(Math.min(95, 60 + formSample * 30));

    return {
      id: `pred-${fixture.id}`,
      fixtureId: fixture.id,
      modelVersion: this.MODEL_VERSION,
      calculatedAt: new Date().toISOString(),
      dataQuality: quality.status,
      qualityReason: quality.reason,
      isAbstained: false,
      market1X2,
      marketBTTS,
      marketOverUnder25,
      marketHtFt,
      marketDoubleChance,
      market1X2Interval10,
      poisson: {
        homeLambda,
        awayLambda,
        scoreMatrix,
        mostLikelyScore,
      },
      confidenceScore,
    };
  }
}
