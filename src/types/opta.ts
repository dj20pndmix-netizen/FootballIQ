/**
 * Official Opta / Stats Perform Data Types & Schemas
 * Compliant with Stats Perform Sports Data API (SDAPI v1 / v4)
 */

export type OptaCoverageTier = 'TIER_1_GRANULAR' | 'TIER_2_EVENTS' | 'TIER_3_CORE' | 'TIER_4_SCORES_ONLY';

export type OptaCoverageCompleteness = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';

export type OptaConfederation = 'UEFA' | 'CAF' | 'CONMEBOL' | 'CONCACAF' | 'AFC' | 'OFC' | 'FIFA';

export type OptaGender = 'MEN' | 'WOMEN' | 'YOUTH';

export type OptaCompetitionType =
  | 'DOMESTIC_LEAGUE'
  | 'DOMESTIC_CUP'
  | 'CONTINENTAL_CLUB'
  | 'INTERNATIONAL'
  | 'REGIONAL'
  | 'LOWER_DIVISION'
  | 'YOUTH_TOURNAMENT';

export interface OptaCompetition {
  optaCompetitionId: string;       // e.g., 'opta:comp:8' (Premier League)
  name: string;
  code: string;                    // e.g., 'EN_PL'
  country: string;
  countryCode: string;             // ISO-3166-1 alpha-2, e.g., 'GB-ENG'
  confederation: OptaConfederation;
  gender: OptaGender;
  competitionType: OptaCompetitionType;
  tier: OptaCoverageTier;
  logo: string;
  currentSeasonId: string;
  availableSeasons: string[];
  statsAvailable: {
    lineups: boolean;
    eventsF24: boolean;
    expectedGoalsXg: boolean;
    playerTrackingVision: boolean;
    optaPredictionsMA21: boolean;
    historicalData: boolean;
  };
  lastSyncedAt?: string;
  coverageStatus: OptaCoverageCompleteness;
}

export interface OptaSeason {
  optaSeasonId: string;            // e.g., 'opta:season:2026-2027'
  optaCompetitionId: string;
  name: string;                    // e.g., '2026/2027'
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  totalMatchdays: number;
  completedMatchdays: number;
}

export interface OptaPlayer {
  optaPlayerId: string;            // e.g., 'opta:player:p123456'
  teamId: string;
  firstName: string;
  lastName: string;
  knownName?: string;
  position: 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Attacker';
  shirtNumber: number;
  nationality: string;
  nationalityCode: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
  preferredFoot?: 'Left' | 'Right' | 'Both';
  isCaptain?: boolean;
  photoUrl?: string;
  status: 'ACTIVE' | 'INJURED' | 'SUSPENDED' | 'DOUBTFUL';
}

export interface OptaTeam {
  optaTeamId: string;              // e.g., 'opta:team:t3' (Arsenal)
  name: string;
  officialName: string;
  shortName: string;
  code: string;
  country: string;
  countryCode: string;
  venueName: string;
  venueCapacity: number;
  badgeUrl: string;
  primaryColor: string;
  secondaryColor: string;
  rollingXgScored: number;         // 10-match rolling xG
  rollingXgConceded: number;       // 10-match rolling xGA
  optaPowerRanking?: number;       // 1 - 100 global rating
}

export type OptaMatchStatus = 
  | 'Fixture'         // Scheduled
  | 'Playing'         // Live in-play
  | 'HalfTime'        // HT
  | 'FullTime'        // Settled FT
  | 'ExtraTime'       // In ET
  | 'PenaltyShootout' // Live penalties
  | 'Postponed'       // Postponed
  | 'Cancelled'       // Cancelled
  | 'Suspended';      // Suspended

export interface OptaLineupPlayer {
  optaPlayerId: string;
  name: string;
  shirtNumber: number;
  position: string;
  formationSlot: string;           // e.g. 'GK', 'CB', 'LB', 'CM', 'CF'
  pitchCoordinateX: number;        // 0 - 100 relative formation coordinate
  pitchCoordinateY: number;        // 0 - 100 relative formation coordinate
  isStarting: boolean;
  isSubstituted: boolean;
  substitutionMinute?: number;
}

export interface OptaLineup {
  fixtureId: string;
  homeTeamFormation: string;       // e.g., '4-3-3'
  awayTeamFormation: string;       // e.g., '4-2-3-1'
  homeStartingXI: OptaLineupPlayer[];
  homeSubstitutes: OptaLineupPlayer[];
  awayStartingXI: OptaLineupPlayer[];
  awaySubstitutes: OptaLineupPlayer[];
  homeCoachName?: string;
  awayCoachName?: string;
  confirmedAt?: string;
}

export interface OptaMatchEvent {
  optaEventId: string;             // e.g., 'opta:event:e987654'
  fixtureId: string;
  period: '1H' | '2H' | 'ET1' | 'ET2' | 'PEN';
  minute: number;
  second: number;
  teamId: string;
  playerId?: string;
  playerName?: string;
  type: 
    | 'Goal' 
    | 'OwnGoal' 
    | 'PenaltyGoal' 
    | 'PenaltyMissed' 
    | 'ShotOnTarget' 
    | 'ShotOffTarget' 
    | 'ShotBlocked' 
    | 'ShotWoodwork' 
    | 'Pass' 
    | 'KeyPass' 
    | 'Assist' 
    | 'Tackle' 
    | 'Interception' 
    | 'Foul' 
    | 'YellowCard' 
    | 'RedCard' 
    | 'Substitution' 
    | 'Corner' 
    | 'Offside' 
    | 'Save';
  pitchX: number;                  // 0 (home goal line) to 100 (away goal line)
  pitchY: number;                  // 0 (left sideline) to 100 (right sideline)
  endPitchX?: number;
  endPitchY?: number;
  outcome: 'SUCCESS' | 'FAIL';
  qualifiers?: {
    bodyPart?: 'Head' | 'RightFoot' | 'LeftFoot' | 'Other';
    isBigChance?: boolean;
    isCounterAttack?: boolean;
    xgValue?: number;
    distanceMeters?: number;
  };
}

export interface OptaExpectedGoalsRecord {
  shotId: string;
  fixtureId: string;
  teamId: string;
  playerId: string;
  minute: number;
  pitchX: number;
  pitchY: number;
  xgValue: number;                 // 0.0001 - 0.9999
  outcome: 'Goal' | 'Saved' | 'Missed' | 'Blocked';
  bodyPart: 'LeftFoot' | 'RightFoot' | 'Head' | 'Other';
  shotType: 'OpenPlay' | 'SetPiece' | 'Penalty' | 'FastBreak';
}

export interface OptaTeamMatchStats {
  fixtureId: string;
  teamId: string;
  possessionPct: number;
  totalShots: number;
  shotsOnTarget: number;
  shotsOffTarget: number;
  blockedShots: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  passesTotal: number;
  passesCompleted: number;
  passAccuracyPct: number;
  xg: number;
  xga: number;
  xgTotal: number;
  xgaTotal: number;
  ppda: number;                    // Passes allowed per defensive action
  fieldTiltPct: number;            // Share of final third passes
  highTurnovers: number;
}

export interface OptaPredictionsPayload {
  fixtureId: string;
  provider: 'OPTA_SUPERCOMPUTER_MA21';
  homeWinProbability: number;      // e.g. 0.5214
  drawProbability: number;         // e.g. 0.2450
  awayWinProbability: number;      // e.g. 0.2336
  predictedOutcome: '1' | 'X' | '2';
  homePowerRanking: number;        // 1 - 100
  awayPowerRanking: number;
  simulationRuns: number;          // e.g. 10000
  publishedAt: string;
}

export interface OptaFixtureRecord {
  optaFixtureId: string;           // e.g. 'opta:match:m456789'
  competition: OptaCompetition;
  seasonId: string;
  roundName: string;               // e.g. 'Regular Season - Matchday 12'
  homeTeam: OptaTeam;
  awayTeam: OptaTeam;
  kickoffTimeUtc: string;
  status: OptaMatchStatus;
  scores: {
    currentHome: number;
    currentAway: number;
    htHome?: number;
    htAway?: number;
    ftHome?: number;
    ftAway?: number;
    etHome?: number;
    etAway?: number;
    penHome?: number;
    penAway?: number;
    minute?: number;
  };
  venue: string;
  referee?: string;
  attendance?: number;
  stats?: {
    home: OptaTeamMatchStats;
    away: OptaTeamMatchStats;
  };
  lineup?: OptaLineup;
  events?: OptaMatchEvent[];
  xgShots?: OptaExpectedGoalsRecord[];
  optaPredictions?: OptaPredictionsPayload;
  lastUpdatedUtc: string;
  coverageTier: OptaCoverageTier;
  dataProvenance: 'OPTA_SDAPI_V1' | 'OFFLINE_VERIFIED_SAMPLE';
}
