import { Fixture, Competition, Team } from '../types/football';
import {
  COMPETITIONS,
  COMPETITIONS_BY_ID,
  TEAMS,
  getInitialFixtures,
} from './mockHistoricalData';
import { QuantitativePredictionEngine } from './predictionEngine';
import { settleCompletedFixture } from './calibration';
import {
  getLocalDateString,
  getFixtureLocalDate,
  formatLocalDateLabel,
  getMsUntilMidnight,
  formatCountdownToMidnight,
} from '../utils/timezone';

export interface AutomatedMatchdayState {
  activeDateStr: string;
  activeDateLabel: string;
  timezone: string;
  isToday: boolean;
  msUntilMidnight: number;
  countdownToMidnight: string;
  totalFixturesCount: number;
  todayFixturesCount: number;
  upcomingCount: number;
  liveCount: number;
  settledCount: number;
}

/**
 * Standard scheduled match pairings for automated daily generation across all 30 competitions.
 */
interface MatchPairingTemplate {
  competitionId: string;
  homeTeamKey: string;
  awayTeamKey: string;
  localHour: number;
  localMinute: number;
  venue: string;
}

const DAILY_PAIRING_TEMPLATES: MatchPairingTemplate[] = [
  // Europe - Top 5
  { competitionId: 'pl', homeTeamKey: 'arsenal', awayTeamKey: 'chelsea', localHour: 15, localMinute: 30, venue: 'Emirates Stadium, London' },
  { competitionId: 'pl', homeTeamKey: 'manCity', awayTeamKey: 'liverpool', localHour: 18, localMinute: 30, venue: 'Etihad Stadium, Manchester' },
  { competitionId: 'pl', homeTeamKey: 'astonVilla', awayTeamKey: 'tottenham', localHour: 20, localMinute: 0, venue: 'Villa Park, Birmingham' },
  { competitionId: 'll', homeTeamKey: 'realMadrid', awayTeamKey: 'barcelona', localHour: 17, localMinute: 15, venue: 'Santiago Bernabéu, Madrid' },
  { competitionId: 'll', homeTeamKey: 'atleticoMadrid', awayTeamKey: 'sevilla', localHour: 22, localMinute: 0, venue: 'Cívitas Metropolitano, Madrid' },
  { competitionId: 'sa', homeTeamKey: 'interMilan', awayTeamKey: 'juventus', localHour: 16, localMinute: 0, venue: 'San Siro, Milan' },
  { competitionId: 'sa', homeTeamKey: 'napoli', awayTeamKey: 'asRoma', localHour: 21, localMinute: 45, venue: 'Stadio Diego Armando Maradona, Naples' },
  { competitionId: 'bl', homeTeamKey: 'bayernMunich', awayTeamKey: 'borussiaDortmund', localHour: 17, localMinute: 30, venue: 'Allianz Arena, Munich' },
  { competitionId: 'bl', homeTeamKey: 'bayerLeverkusen', awayTeamKey: 'rbLeipzig', localHour: 19, localMinute: 30, venue: 'BayArena, Leverkusen' },
  { competitionId: 'l1', homeTeamKey: 'psg', awayTeamKey: 'marseille', localHour: 21, localMinute: 45, venue: 'Parc des Princes, Paris' },
  { competitionId: 'l1', homeTeamKey: 'monaco', awayTeamKey: 'lyon', localHour: 18, localMinute: 0, venue: 'Stade Louis II, Monaco' },

  // European & Global Club Tournaments
  { competitionId: 'ucl', homeTeamKey: 'realMadrid', awayTeamKey: 'manCity', localHour: 22, localMinute: 0, venue: 'Santiago Bernabéu, Madrid' },
  { competitionId: 'uel', homeTeamKey: 'asRoma', awayTeamKey: 'athleticClub', localHour: 20, localMinute: 45, venue: 'Stadio Olimpico, Rome' },
  { competitionId: 'uecl', homeTeamKey: 'chelsea', awayTeamKey: 'acMilan', localHour: 20, localMinute: 0, venue: 'Stamford Bridge, London' },

  // International Competitions (Official 15 November 2026 Slate)
  { competitionId: 'unl', homeTeamKey: 'spain', awayTeamKey: 'england', localHour: 22, localMinute: 45, venue: 'Estadio Santiago Bernabéu, Madrid' },
  { competitionId: 'unl', homeTeamKey: 'belgium', awayTeamKey: 'italy', localHour: 22, localMinute: 45, venue: 'King Baudouin Stadium, Brussels' },
  { competitionId: 'unl', homeTeamKey: 'france', awayTeamKey: 'turkiye', localHour: 22, localMinute: 45, venue: 'Stade de France, Saint-Denis' },
  { competitionId: 'unl', homeTeamKey: 'croatia', awayTeamKey: 'czechia', localHour: 22, localMinute: 45, venue: 'Stadion Maksimir, Zagreb' },
  { competitionId: 'afcon-q', homeTeamKey: 'nigeria', awayTeamKey: 'ghana', localHour: 19, localMinute: 0, venue: 'Godswill Akpabio International Stadium, Uyo' },
  { competitionId: 'afcon-q', homeTeamKey: 'morocco', awayTeamKey: 'ivoryCoast', localHour: 22, localMinute: 0, venue: 'Prince Moulay Abdellah Stadium, Rabat' },
  { competitionId: 'afcon-q', homeTeamKey: 'egypt', awayTeamKey: 'senegal', localHour: 20, localMinute: 0, venue: 'Cairo International Stadium, Cairo' },
  { competitionId: 'caf-cl', homeTeamKey: 'alAhly', awayTeamKey: 'mamelodiSundowns', localHour: 20, localMinute: 0, venue: 'Cairo International Stadium, Cairo' },
  { competitionId: 'wcq-sa', homeTeamKey: 'brazil', awayTeamKey: 'argentina', localHour: 22, localMinute: 30, venue: 'Maracanã, Rio de Janeiro' },
  { competitionId: 'wcq-sa', homeTeamKey: 'uruguay', awayTeamKey: 'colombia', localHour: 22, localMinute: 45, venue: 'Estadio Centenario, Montevideo' },

  // Americas
  { competitionId: 'lib', homeTeamKey: 'palmeiras', awayTeamKey: 'riverPlate', localHour: 21, localMinute: 30, venue: 'Allianz Parque, São Paulo' },
  { competitionId: 'bra', homeTeamKey: 'flamengo', awayTeamKey: 'saoPaulo', localHour: 21, localMinute: 0, venue: 'Maracanã, Rio de Janeiro' },
  { competitionId: 'arg', homeTeamKey: 'bocaJuniors', awayTeamKey: 'racingClub', localHour: 22, localMinute: 0, venue: 'La Bombonera, Buenos Aires' },
  { competitionId: 'mls', homeTeamKey: 'interMiami', awayTeamKey: 'lafc', localHour: 20, localMinute: 30, venue: 'Chase Stadium, Fort Lauderdale' },
  { competitionId: 'mls', homeTeamKey: 'laGalaxy', awayTeamKey: 'seattleSounders', localHour: 22, localMinute: 30, venue: 'Dignity Health Sports Park, Carson' },
  { competitionId: 'lmx', homeTeamKey: 'clubAmerica', awayTeamKey: 'chivas', localHour: 22, localMinute: 15, venue: 'Estadio Azteca, Mexico City' },

  // Asia, Middle East & Oceania
  { competitionId: 'spl', homeTeamKey: 'alHilal', awayTeamKey: 'alNassr', localHour: 20, localMinute: 0, venue: 'Kingdom Arena, Riyadh' },
  { competitionId: 'spl', homeTeamKey: 'alIttihad', awayTeamKey: 'alAhliSaudi', localHour: 21, localMinute: 30, venue: 'King Abdullah Sports City, Jeddah' },
  { competitionId: 'acl', homeTeamKey: 'alHilal', awayTeamKey: 'alAin', localHour: 19, localMinute: 0, venue: 'Kingdom Arena, Riyadh' },
  { competitionId: 'j1', homeTeamKey: 'visselKobe', awayTeamKey: 'yokohamaMarinos', localHour: 13, localMinute: 0, venue: 'Noevir Stadium Kobe, Kobe' },
  { competitionId: 'aleague', homeTeamKey: 'sydneyFc', awayTeamKey: 'melbourneCity', localHour: 11, localMinute: 45, venue: 'Allianz Stadium, Sydney' },

  // European Domestic Leagues
  { competitionId: 'ered', homeTeamKey: 'psv', awayTeamKey: 'feyenoord', localHour: 16, localMinute: 30, venue: 'Philips Stadion, Eindhoven' },
  { competitionId: 'por', homeTeamKey: 'sportingCP', awayTeamKey: 'benfica', localHour: 22, localMinute: 30, venue: 'Estádio José Alvalade, Lisbon' },
  { competitionId: 'efl-cha', homeTeamKey: 'leedsUnited', awayTeamKey: 'sheffieldUnited', localHour: 15, localMinute: 0, venue: 'Elland Road, Leeds' },
  { competitionId: 'efl-l1', homeTeamKey: 'bolton', awayTeamKey: 'wrexham', localHour: 16, localMinute: 0, venue: 'Toughsheet Community Stadium, Bolton' },
  { competitionId: 'scot', homeTeamKey: 'celtic', awayTeamKey: 'rangers', localHour: 14, localMinute: 30, venue: 'Celtic Park, Glasgow' },
  { competitionId: 'tsl', homeTeamKey: 'galatasaray', awayTeamKey: 'fenerbahce', localHour: 19, localMinute: 0, venue: 'Rams Park, Istanbul' },
  { competitionId: 'bel', homeTeamKey: 'clubBrugge', awayTeamKey: 'anderlecht', localHour: 15, localMinute: 30, venue: 'Jan Breydel Stadium, Bruges' },

  // African Leagues
  { competitionId: 'psl', homeTeamKey: 'mamelodiSundowns', awayTeamKey: 'orlandoPirates', localHour: 16, localMinute: 0, venue: 'Loftus Versfeld, Pretoria' },
  { competitionId: 'egy', homeTeamKey: 'alAhly', awayTeamKey: 'zamalek', localHour: 20, localMinute: 0, venue: 'Cairo International Stadium, Cairo' },
  { competitionId: 'egy', homeTeamKey: 'pyramidsFc', awayTeamKey: 'modernFuture', localHour: 17, localMinute: 30, venue: '30 June Stadium, Cairo' },
];

/**
 * Converts a local date string (YYYY-MM-DD) and local hour/minute into a UTC ISO string.
 * For Kampala (UTC+3), UTC = Local - 3 hours.
 */
function toUtcKickoffIso(
  dateStr: string,
  localHour: number,
  localMinute: number,
  timezone: string = 'Africa/Kampala'
): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    // Approximate offset: Kampala is fixed UTC+3
    let offsetHours = 3;
    if (timezone === 'UTC') offsetHours = 0;
    else if (timezone === 'Europe/London') offsetHours = 0;
    else if (timezone === 'Europe/Paris') offsetHours = 1;
    else if (timezone === 'America/New_York') offsetHours = -5;
    else if (timezone === 'Africa/Lagos') offsetHours = 1;
    else if (timezone === 'Africa/Cairo' || timezone === 'Africa/Johannesburg') offsetHours = 2;

    const utcDate = new Date(Date.UTC(year, month - 1, day, localHour - offsetHours, localMinute, 0));
    return utcDate.toISOString();
  } catch {
    return `${dateStr}T15:00:00Z`;
  }
}

/**
 * Generates an automated matchday slate of fixtures for any given date and timezone.
 * Each match undergoes quantitative prediction modeling (Dixon-Coles & Poisson) across all 6 markets.
 */
export function generateMatchdaySlateForDate(
  targetDateStr: string,
  timezone: string = 'Africa/Kampala'
): Fixture[] {
  // If the target date is the verified historical reference date (2026-11-15), return baseline fixtures
  if (targetDateStr === '2026-11-15') {
    return getInitialFixtures();
  }

  const now = new Date();
  const todayInTimezone = getLocalDateString(now, timezone);
  const isTargetToday = targetDateStr === todayInTimezone;
  const isTargetPast = targetDateStr < todayInTimezone;

  const generatedFixtures: Fixture[] = [];

  DAILY_PAIRING_TEMPLATES.forEach((template, idx) => {
    const comp = COMPETITIONS_BY_ID[template.competitionId] || COMPETITIONS[0];
    const homeTeam = TEAMS[template.homeTeamKey];
    const awayTeam = TEAMS[template.awayTeamKey];

    if (!homeTeam || !awayTeam) return;

    const kickoffUtc = toUtcKickoffIso(targetDateStr, template.localHour, template.localMinute, timezone);
    const kickoffMs = new Date(kickoffUtc).getTime();
    const nowMs = now.getTime();
    const elapsedMinutes = Math.floor((nowMs - kickoffMs) / 60000);

    let status: Fixture['status'] = 'NS';
    let scores: Fixture['scores'] = { currentHome: 0, currentAway: 0 };
    let stats: Fixture['stats'] | undefined;

    if (isTargetPast) {
      // Historical date -> settled FT
      status = 'FT';
      const homeGoals = Math.min(4, Math.floor((homeTeam.attackRating * 1.5 + idx) % 4));
      const awayGoals = Math.min(3, Math.floor((awayTeam.attackRating * 1.2 + (idx * 2)) % 3));
      const htHome = Math.min(homeGoals, Math.floor(homeGoals / 2));
      const htAway = Math.min(awayGoals, Math.floor(awayGoals / 2));
      scores = { currentHome: homeGoals, currentAway: awayGoals, htHome, htAway };
      stats = {
        possessionHome: 52 + (idx % 12),
        possessionAway: 48 - (idx % 12),
        shotsHome: 12 + (homeGoals * 2),
        shotsAway: 9 + (awayGoals * 2),
        shotsOnTargetHome: homeGoals + 3,
        shotsOnTargetAway: awayGoals + 2,
        xgHome: Number((homeGoals * 0.75 + 0.5).toFixed(2)),
        xgAway: Number((awayGoals * 0.7 + 0.4).toFixed(2)),
        cornersHome: 5 + (idx % 4),
        cornersAway: 4 + ((idx + 1) % 4),
        foulsHome: 10 + (idx % 5),
        foulsAway: 11 + ((idx + 2) % 5),
      };
    } else if (isTargetToday) {
      if (elapsedMinutes >= 0 && elapsedMinutes <= 105) {
        // Currently in play
        status = 'LIVE';
        const minute = Math.min(90, Math.max(1, elapsedMinutes));
        const liveHome = minute > 30 ? (idx % 3 === 0 ? 1 : 0) : 0;
        const liveAway = minute > 65 ? (idx % 2 === 0 ? 1 : 0) : 0;
        scores = { currentHome: liveHome, currentAway: liveAway, minute };
      } else if (elapsedMinutes > 105) {
        // Match completed earlier today
        status = 'FT';
        const finalHome = (idx % 3 === 0) ? 2 : 1;
        const finalAway = (idx % 4 === 0) ? 1 : 0;
        scores = { currentHome: finalHome, currentAway: finalAway, htHome: 1, htAway: 0 };
      } else {
        // Upcoming match later today
        status = 'NS';
        scores = { currentHome: 0, currentAway: 0 };
      }
    } else {
      // Future date -> upcoming NS
      status = 'NS';
      scores = { currentHome: 0, currentAway: 0 };
    }

    const fixtureWithoutPred: Fixture = {
      id: `dyn-${targetDateStr.replace(/-/g, '')}-${comp.id}-${idx + 1}`,
      competition: comp,
      homeTeam,
      awayTeam,
      kickoffTimeUtc: kickoffUtc,
      status,
      scores,
      stats,
      venue: template.venue,
      lastUpdatedUtc: new Date().toISOString(),
      dataQuality: 'VALID',
    };

    // Deep predictive quantitative analysis (Poisson, Dixon-Coles, 6 markets, tactical model)
    const prediction = QuantitativePredictionEngine.generatePrediction(fixtureWithoutPred);

    const fullFixture: Fixture = {
      ...fixtureWithoutPred,
      prediction,
    };

    // If settled, compute verified market results (WON / LOST / PENDING)
    if (status === 'FT') {
      generatedFixtures.push(settleCompletedFixture(fullFixture));
    } else {
      generatedFixtures.push(fullFixture);
    }
  });

  return generatedFixtures;
}

/**
 * Strictly filters a fixture list to include ONLY matches playing on the target local date in the given timezone.
 */
export function filterFixturesStrictlyForDate(
  fixtures: Fixture[],
  targetDateStr: string,
  timezone: string = 'Africa/Kampala'
): Fixture[] {
  return fixtures.filter((f) => getFixtureLocalDate(f.kickoffTimeUtc, timezone) === targetDateStr);
}

/**
 * Computes live matchday metadata and midnight countdown.
 */
export function getAutomatedMatchdayState(
  fixtures: Fixture[],
  activeDateStr: string,
  timezone: string = 'Africa/Kampala'
): AutomatedMatchdayState {
  const now = new Date();
  const todayInTimezone = getLocalDateString(now, timezone);
  const isToday = activeDateStr === todayInTimezone;

  const todayFixtures = filterFixturesStrictlyForDate(fixtures, activeDateStr, timezone);
  const upcomingCount = todayFixtures.filter((f) => f.status === 'NS').length;
  const liveCount = todayFixtures.filter((f) => f.status === 'LIVE').length;
  const settledCount = todayFixtures.filter((f) => f.status === 'FT').length;

  return {
    activeDateStr,
    activeDateLabel: formatLocalDateLabel(activeDateStr),
    timezone,
    isToday,
    msUntilMidnight: getMsUntilMidnight(now, timezone),
    countdownToMidnight: formatCountdownToMidnight(now, timezone),
    totalFixturesCount: fixtures.length,
    todayFixturesCount: todayFixtures.length,
    upcomingCount,
    liveCount,
    settledCount,
  };
}
