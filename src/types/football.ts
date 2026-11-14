export type FixtureStatus = 'NS' | 'LIVE' | 'HT' | 'FT' | 'POSTP' | 'CANC';

export type DataQualityStatus = 
  | 'VALID' 
  | 'LIMITED_DATA' 
  | 'STALE' 
  | 'INVALID' 
  | 'WITHHELD';

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  badgeUrl?: string;
  colors?: { primary: string; secondary: string };
  country: string;
  attackRating: number;   // Poisson lambda coefficient relative to league avg
  defenseRating: number;  // Poisson defense suppression coefficient
  formLast5: ('W' | 'D' | 'L')[];
  avgGoalsScored: number;
  avgGoalsConceded: number;
  avgXg: number;
  cleanSheetPct: number;
}

export interface Competition {
  id: string;
  name: string;
  country: string;
  season: string;
  logo: string;
  leagueAvgHomeGoals: number;
  leagueAvgAwayGoals: number;
  region?: 'Europe' | 'Americas' | 'Africa' | 'Asia & Oceania' | 'International';
}

export interface MatchScores {
  currentHome: number;
  currentAway: number;
  htHome?: number;
  htAway?: number;
  minute?: number;
}

export interface MatchStats {
  possessionHome: number;
  possessionAway: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  xgHome: number;
  xgAway: number;
  cornersHome: number;
  cornersAway: number;
  foulsHome: number;
  foulsAway: number;
}

export interface Market1X2 {
  homeWin: number;
  draw: number;
  awayWin: number;
  predictedOutcome: '1' | 'X' | '2';
  valueEdge?: {
    market: '1' | 'X' | '2';
    edgePct: number;
    bookmakerImplied: number;
  };
}

export interface MarketBTTS {
  yes: number;
  no: number;
  predictedOutcome: 'YES' | 'NO';
}

export interface MarketOverUnder25 {
  over: number;
  under: number;
  predictedOutcome: 'OVER' | 'UNDER';
}

export type HtFtOutcome = 
  | 'HH' | 'HD' | 'HA'
  | 'DH' | 'DD' | 'DA'
  | 'AH' | 'AD' | 'AA';

export interface MarketHtFt {
  probabilities: Record<HtFtOutcome, number>;
  predictedOutcome: HtFtOutcome;
}

export interface MarketDoubleChance {
  '1X': number; // home win + draw
  'X2': number; // draw + away win
  '12': number; // home win + away win
  predictedOutcome: '1X' | 'X2' | '12';
}

export interface Market1X2Interval10 {
  homeWin: number;           // Probability Home leads at 09:59
  draw: number;              // Probability Tied/Draw at 09:59 (0-0, 1-1)
  awayWin: number;           // Probability Away leads at 09:59
  predictedOutcome: '1' | 'X' | '2';
  earlyGoalProbability: number; // Probability of >= 1 goal scored in 00:01-09:59
  mostLikelyScore: string;   // e.g. "0 - 0"
}

export interface PoissonDistribution {
  homeLambda: number;
  awayLambda: number;
  scoreMatrix: number[][]; // 7x7 score probabilities
  mostLikelyScore: { home: number; away: number; probability: number };
}

export interface FixturePrediction {
  id: string;
  fixtureId: string;
  modelVersion: string;
  calculatedAt: string;
  dataQuality: DataQualityStatus;
  qualityReason?: string;
  isAbstained: boolean;
  market1X2: Market1X2;
  marketBTTS: MarketBTTS;
  marketOverUnder25: MarketOverUnder25;
  marketHtFt: MarketHtFt;
  marketDoubleChance: MarketDoubleChance;
  market1X2Interval10: Market1X2Interval10;
  poisson: PoissonDistribution;
  confidenceScore: number; // 0 - 100 based on data completeness and sample size
  settlement?: {
    status: 'WON' | 'LOST' | 'VOID' | 'PENDING';
    verifiedAt?: string;
    actualScore?: string;
    settledMarkets: {
      market1X2: 'WON' | 'LOST' | 'VOID';
      marketBTTS: 'WON' | 'LOST' | 'VOID';
      marketOverUnder25: 'WON' | 'LOST' | 'VOID';
      marketHtFt: 'WON' | 'LOST' | 'VOID';
      marketDoubleChance: 'WON' | 'LOST' | 'VOID';
      market1X2Interval10?: 'WON' | 'LOST' | 'VOID';
    };
  };
}

export interface Fixture {
  id: string;
  competition: Competition;
  homeTeam: Team;
  awayTeam: Team;
  kickoffTimeUtc: string; // ISO 8601 UTC
  status: FixtureStatus;
  scores: MatchScores;
  stats?: MatchStats;
  venue: string;
  referee?: string;
  lastUpdatedUtc: string;
  dataQuality: DataQualityStatus;
  syncSource?: string;
  prediction?: FixturePrediction;
}

export interface HistoricalEvaluationMetrics {
  totalEvaluated: number;
  logLoss: {
    market1X2: number;
    marketBTTS: number;
    marketOverUnder25: number;
  };
  brierScore: {
    market1X2: number;
    marketBTTS: number;
    marketOverUnder25: number;
    marketDoubleChance: number;
  };
  hitRate: {
    market1X2: number;
    marketBTTS: number;
    marketOverUnder25: number;
    marketDoubleChance: number;
    overall: number;
  };
  byCompetition: {
    competitionName: string;
    sampleSize: number;
    accuracy: number;
    brierScore: number;
  }[];
  calibrationBands: {
    predictedRange: string;
    predictedAvg: number;
    actualObserved: number;
    count: number;
  }[];
}

export interface TacticalScoutReport {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  headline: string;
  summary?: string;
  keyInjuries: {
    team: string;
    player: string;
    status: 'OUT' | 'DOUBTFUL' | 'RETURNING';
    impactAnalysis: string;
  }[];
  tacticalKeyPoints: string[];
  weatherAndPitch: string;
  searchGroundedSources: {
    title: string;
    uri: string;
  }[];
  generatedAt: string;
}

export interface VideoGenerationJob {
  id: string;
  userId: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  previewImageUrl?: string;
  error?: string;
  createdAt: string;
}

export type GeminiModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-4-carbon'
  | 'gemini-4-argon'
  | 'gemini-3.1-flash-lite';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelId?: GeminiModelId;
  roleTitle?: string;
  sources?: GroundingSource[];
  attachedFixtureLabel?: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  activeModel: GeminiModelId;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface GroundedSyncResult {
  syncedAt: string;
  dateChecked: string;
  summary: string;
  verifiedFixtures: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
    kickoffInfo: string;
    status: string;
    score?: string;
    htScore?: string;
  }[];
  sources: GroundingSource[];
}

export interface PersistedFixtureUpdate {
  fixtureId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionId: string;
  kickoffTimeUtc: string;
  status: FixtureStatus;
  scores: MatchScores;
  lastUpdatedUtc: string;
  syncSource: string;
}

export interface SyncJobRecord {
  id: string;
  provider: string;
  trigger: 'auto' | 'manual' | 'boot';
  status: 'success' | 'failed' | 'running';
  recordsSynced: number;
  message: string;
  startedAt: string;
  completedAt: string;
  sources?: GroundingSource[];
}

