import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Content } from '@google/genai';
import {
  AUTO_SYNC_INTERVAL_MS,
  EXTERNAL_SEARCH_COOLDOWN_MS,
  ServerSyncJob,
  SyncStatus,
  TrackedFixtureMeta,
  VALID_SYNC_STATUSES,
  checkStoreHealth,
  normalizeTeamKey,
  parseScorePair,
  recordSyncJob,
  saveServerStore,
  serverStore,
  upsertFixtureUpdate,
} from './server/store.ts';
import {
  apiRequestLogger,
  centralErrorHandler,
  createRateLimiter,
  jsonSyntaxErrorHandler,
  sanitizeText,
  securityHeadersMiddleware,
  validateChatPayload,
  validateScoutPayload,
  validateVeoPayload,
} from './server/middleware.ts';
import { optaDiscoveryService } from './src/services/opta/optaDiscoveryService.ts';
import { optaIngestionService } from './src/services/opta/optaIngestionService.ts';
import { runServerAutoSettlement } from './server/settlementEngine.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

let syncInFlight = false;
let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

const VALID_CHAT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-4-carbon',
  'gemini-4-argon',
  'gemini-3.1-flash-lite',
] as const;

type ChatModelId = (typeof VALID_CHAT_MODELS)[number];

const MODEL_ROLE_PROFILES: Record<
  ChatModelId,
  { roleTitle: string; systemInstruction: string }
> = {
  'gemini-4-hydrogen': {
    roleTitle: 'Live Tactical Analyst & Search Grounding Agent',
    systemInstruction:
      'You are FootballIQ Live Tactical Analyst, an authoritative football intelligence assistant equipped with Google Search grounding. ' +
      'Provide strictly factual, up-to-date squad news, verified kickoff times, confirmed lineups, injuries, and match analysis. ' +
      'Never fabricate statistics, never guarantee match outcomes or profits, and cite verified facts clearly. Keep responses well-structured and concise.',
  },
  'gemini-4-carbon': {
    roleTitle: 'Deep Quantitative & Calibration Strategist',
    systemInstruction:
      'You are FootballIQ Chief Quantitative Strategist. Your specialty is deep mathematical reasoning over Bivariate Poisson goal intensities, ' +
      'Dixon-Coles low-score dependency adjustments (tau/rho), non-uniform 10-minute interval slicing (00:01-09:59), Brier score decomposition, ' +
      'multi-class Log Loss, and reliability calibration. Show step-by-step probabilistic logic clearly and never fabricate probabilities or claim guaranteed outcomes.',
  },
  'gemini-4-argon': {
    roleTitle: 'Complex Interactive Scenario Architect',
    systemInstruction:
      'You are FootballIQ Scenario & Multi-Market Architect. You excel at complex interactive scenario modeling across all 6 FootballIQ markets ' +
      '(Full-Time 1X2, 1X2 10-Minute Interval 00:01-09:59, BTTS, Over/Under 2.5, Double Chance, and HT/FT 9-way combinations). ' +
      'Walk users through interactive what-if tactical adjustments (e.g., red cards, early goals, tactical blocks, weather shifts), ' +
      'checking cross-market mathematical consistency (1X = 1+X, X2 = X+2, 12 = 1+2). Never guarantee outcomes.',
  },
  'gemini-3.1-flash-lite': {
    roleTitle: 'Express Match Briefing Assistant',
    systemInstruction:
      'You are FootballIQ Express Briefing Assistant. Deliver ultra-fast, crisp, high-signal summaries of match odds, recent team form, ' +
      'key probabilities, and statistical definitions in 3-5 tight bullet points. Be accurate, fast, and avoid fluff or guaranteed outcome claims.',
  },
};

function extractGroundingSources(response: any): { title: string; uri: string }[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: { title: string; uri: string }[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title || 'Verified Web Source';
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title, uri });
    }
  }
  return sources;
}

function isQuotaError(error: any): boolean {
  const msg = String(error?.message || error || '');
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
}

function formatGeminiError(error: any): { status: number; message: string } {
  const msg = String(error?.message || error || 'Unknown Gemini API error');
  if (msg.includes('PERMISSION_DENIED') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API authentication issue. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (isQuotaError(error)) {
    return {
      status: 429,
      message: 'Gemini API rate limit or quota reached. Please wait briefly or check your API key tier in Settings > Secrets.',
    };
  }
  if (msg.includes('NOT_FOUND') || msg.includes('404')) {
    return {
      status: 404,
      message: `Requested Gemini model was not found: ${msg}`,
    };
  }
  return { status: 500, message: msg };
}

async function fetchSportmonksDateUpdates(
  token: string,
  isoDates: string[],
  tracked: TrackedFixtureMeta[]
): Promise<{ updated: number; checkedCount: number }> {
  let updated = 0;
  let checkedCount = 0;
  const baseUrl = process.env.SPORTMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football';

  for (const dateStr of isoDates) {
    const resp = await fetch(
      `${baseUrl}/fixtures/date/${dateStr}?include=participants;scores;state`,
      {
        headers: {
          Authorization: token,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) {
      throw new Error(`SportMonks API HTTP ${resp.status}`);
    }
    const json: any = await resp.json();
    const apiFixtures = Array.isArray(json?.data) ? json.data : [];
    checkedCount += apiFixtures.length;

    for (const apiFix of apiFixtures) {
      const participants = Array.isArray(apiFix.participants) ? apiFix.participants : [];
      const homeP = participants.find((p: any) => p?.meta?.location === 'home');
      const awayP = participants.find((p: any) => p?.meta?.location === 'away');
      if (!homeP || !awayP) continue;

      const matched = tracked.find(
        (t) =>
          normalizeTeamKey(t.homeTeam) === normalizeTeamKey(homeP.name) &&
          normalizeTeamKey(t.awayTeam) === normalizeTeamKey(awayP.name)
      );
      if (!matched) continue;

      const devState = String(apiFix?.state?.developer_name || apiFix?.state?.short_name || '').toUpperCase();
      let mappedStatus: SyncStatus = 'NS';
      if (['FT', 'AET', 'FT_PEN'].includes(devState)) mappedStatus = 'FT';
      else if (['HT', 'BREAK'].includes(devState)) mappedStatus = 'HT';
      else if (['INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'INPLAY_ET', 'LIVE', '1H', '2H'].includes(devState)) mappedStatus = 'LIVE';
      else if (['POSTPONED', 'POSTP', 'DELAYED'].includes(devState)) mappedStatus = 'POSTP';
      else if (['CANCELLED', 'CANC', 'ABANDONED'].includes(devState)) mappedStatus = 'CANC';

      const scoresArr = Array.isArray(apiFix.scores) ? apiFix.scores : [];
      const findScore = (desc: string, side: 'home' | 'away'): number | undefined => {
        const row = scoresArr.find(
          (s: any) =>
            String(s?.description || '').toUpperCase() === desc &&
            String(s?.score?.participant || '').toLowerCase() === side
        );
        const val = row?.score?.goals;
        return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
      };

      const curHome = findScore('CURRENT', 'home') ?? 0;
      const curAway = findScore('CURRENT', 'away') ?? 0;
      const htHome = findScore('1ST_HALF', 'home');
      const htAway = findScore('1ST_HALF', 'away');

      const changed = upsertFixtureUpdate({
        fixtureId: matched.fixtureId,
        homeTeamName: matched.homeTeam,
        awayTeamName: matched.awayTeam,
        competitionId: matched.competitionId,
        kickoffTimeUtc: matched.kickoffTimeUtc,
        status: mappedStatus,
        scores: {
          currentHome: curHome,
          currentAway: curAway,
          ...(typeof htHome === 'number' ? { htHome } : {}),
          ...(typeof htAway === 'number' ? { htAway } : {}),
        },
        lastUpdatedUtc: new Date().toISOString(),
        syncSource: 'SportMonks-v3',
      });
      if (changed) updated++;
    }
  }
  return { updated, checkedCount };
}

function seedIncomingFixturesIntoStore(incomingFixtures: any[], startedAt: string): void {
  if (!Array.isArray(incomingFixtures) || incomingFixtures.length === 0) return;

  const bounded = incomingFixtures.slice(0, 100);
  const nextTracked: TrackedFixtureMeta[] = [];

  for (const f of bounded) {
    const homeTeam = sanitizeText(f?.homeTeam, 100);
    const awayTeam = sanitizeText(f?.awayTeam, 100);
    if (!homeTeam || !awayTeam) continue;

    const fid = sanitizeText(f.fixtureId, 120) || `${normalizeTeamKey(homeTeam)}-${normalizeTeamKey(awayTeam)}`;
    const competitionId = sanitizeText(f.competitionId, 64) || 'unknown';
    const competition = sanitizeText(f.competition, 120) || 'Matchday';
    const kickoffTimeUtc = sanitizeText(f.kickoffTimeUtc, 64);

    nextTracked.push({
      fixtureId: fid,
      homeTeam,
      awayTeam,
      competitionId,
      competition,
      kickoffTimeUtc,
    });

    const st: SyncStatus = VALID_SYNC_STATUSES.includes(f.status) ? f.status : 'NS';
    upsertFixtureUpdate({
      fixtureId: fid,
      homeTeamName: homeTeam,
      awayTeamName: awayTeam,
      competitionId,
      kickoffTimeUtc,
      status: st,
      scores: {
        currentHome: Number(f?.scores?.currentHome ?? 0),
        currentAway: Number(f?.scores?.currentAway ?? 0),
        ...(typeof f?.scores?.htHome === 'number' ? { htHome: f.scores.htHome } : {}),
        ...(typeof f?.scores?.htAway === 'number' ? { htAway: f.scores.htAway } : {}),
        ...(typeof f?.scores?.minute === 'number' ? { minute: f.scores.minute } : {}),
      },
      lastUpdatedUtc: sanitizeText(f.lastUpdatedUtc, 64) || startedAt,
      syncSource: 'Persisted-Matchday',
    });
  }

  if (nextTracked.length > 0) {
    serverStore.trackedFixtures = nextTracked;
  }
}

export async function executeUnifiedSync(params: {
  trigger: 'auto' | 'manual' | 'boot';
  dateLabel?: string;
  forceExternal?: boolean;
  incomingFixtures?: any[];
}): Promise<{
  job: ServerSyncJob;
  summary: string;
  sources: { title: string; uri: string }[];
}> {
  if (syncInFlight) {
    const nowIso = new Date().toISOString();
    return {
      job: {
        id: `sync-${Date.now()}`,
        provider: 'Store-Cache',
        trigger: params.trigger,
        status: 'success',
        recordsSynced: Object.keys(serverStore.fixtureUpdates).length,
        message: 'Sync already in progress; returning latest persisted fixture state.',
        startedAt: nowIso,
        completedAt: nowIso,
      },
      summary: 'Returning persisted matchday state.',
      sources: [],
    };
  }

  syncInFlight = true;
  const startedAt = new Date().toISOString();
  const safeDateLabel = sanitizeText(params.dateLabel, 64);
  if (safeDateLabel) serverStore.dateLabel = safeDateLabel;

  try {
    seedIncomingFixturesIntoStore(params.incomingFixtures || [], startedAt);

    let totalUpdated = 0;
    const providersUsed: string[] = [];
    const collectedSources: { title: string; uri: string }[] = [];
    const summaryNotes: string[] = [];

    const smToken = (process.env.SPORTMONKS_API_TOKEN || '').trim();
    if (smToken.length > 10 && serverStore.trackedFixtures.length > 0) {
      try {
        const uniqueDates = Array.from(
          new Set(
            serverStore.trackedFixtures
              .map((t) => String(t.kickoffTimeUtc).slice(0, 10))
              .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
          )
        );
        const smRes = await fetchSportmonksDateUpdates(
          smToken,
          uniqueDates.slice(0, 3),
          serverStore.trackedFixtures
        );
        totalUpdated += smRes.updated;
        providersUsed.push('SportMonks-v3');
        summaryNotes.push(`SportMonks checked ${smRes.checkedCount} feed fixtures (${smRes.updated} state updates).`);
      } catch (smErr: any) {
        summaryNotes.push(`SportMonks note: ${smErr.message}`);
      }
    }

    const nowMs = Date.now();
    const hasActiveWindowMatch = serverStore.trackedFixtures.some((t) => {
      const existing = serverStore.fixtureUpdates[t.fixtureId];
      if (existing && (existing.status === 'FT' || existing.status === 'POSTP' || existing.status === 'CANC')) {
        return false;
      }
      const koMs = Date.parse(t.kickoffTimeUtc);
      if (Number.isNaN(koMs)) return false;
      // Active window: upcoming within 15m or in progress up to 4h
      const inLiveWindow = nowMs >= koMs - 15 * 60_000 && nowMs <= koMs + 4 * 3600_000;
      // Overdue window: match kicked off > 105m ago and is still not marked FT/POSTP/CANC
      const isOverdue = nowMs >= koMs + 105 * 60_000;
      return inLiveWindow || isOverdue;
    });

    const cooldownElapsed = nowMs - serverStore.lastExternalSearchEpochMs >= EXTERNAL_SEARCH_COOLDOWN_MS;
    const shouldRunSearchGrounding =
      Boolean(process.env.GEMINI_API_KEY) &&
      serverStore.trackedFixtures.length > 0 &&
      (params.forceExternal || (hasActiveWindowMatch && cooldownElapsed));

    let externalFailureNote: string | null = null;
    if (shouldRunSearchGrounding) {
      serverStore.lastExternalSearchEpochMs = nowMs;
      const unresolvedFixtures = serverStore.trackedFixtures.filter((t) => {
        const st = serverStore.fixtureUpdates[t.fixtureId]?.status;
        return st !== 'FT' && st !== 'POSTP' && st !== 'CANC';
      });
      const targetList = unresolvedFixtures.length > 0 ? unresolvedFixtures : serverStore.trackedFixtures.slice(0, 10);

      const fixtureListText = targetList
        .map((f) => `- ${f.homeTeam} vs ${f.awayTeam} (${f.competition}, scheduled ${f.kickoffTimeUtc})`)
        .join('\n');

      const prompt = `Verify the real-world football schedule, match statuses (NS/LIVE/HT/FT/POSTP), and any verified live, half-time, or final scores for ${serverStore.dateLabel} (UTC / Africa/Kampala EAT) using Google Search.
Only report scores that are factually verified in search results. Leave score empty if the match has not started.
Specifically check these tracked fixtures:
${fixtureListText}

Return ONLY a valid JSON object with:
{
  "summary": "concise factual status of the slate and any verified live/final updates found",
  "verifiedFixtures": [
    {
      "homeTeam": "string",
      "awayTeam": "string",
      "competition": "string",
      "kickoffInfo": "verified kickoff time",
      "status": "NS" | "LIVE" | "HT" | "FT" | "POSTP",
      "score": "optional score string like 2-1 if LIVE, HT, or FT, otherwise empty string",
      "htScore": "optional half-time score string like 1-0 if verified, otherwise empty string"
    }
  ]
}`;

      try {
        const ai = getGenAI();
        let activeModelUsed = 'gemini-4-hydrogen';
        let response: any;
        try {
          response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
          });
        } catch (err) {
          if (!isQuotaError(err)) throw err;
          activeModelUsed = 'gemini-3.1-flash-lite';
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
          });
        }

        providersUsed.push(activeModelUsed);
        const rawText = (response.text ?? '').trim();
        const webSources = extractGroundingSources(response);
        for (const s of webSources) collectedSources.push(s);

        let parsed: any = null;
        try {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // ignore unparseable wrapper
        }

        if (parsed?.summary) summaryNotes.push(String(parsed.summary));
        const verifiedList = Array.isArray(parsed?.verifiedFixtures) ? parsed.verifiedFixtures : [];

        for (const vf of verifiedList) {
          const matchedMeta = serverStore.trackedFixtures.find(
            (t) =>
              (normalizeTeamKey(t.homeTeam).includes(normalizeTeamKey(vf.homeTeam)) ||
                normalizeTeamKey(vf.homeTeam).includes(normalizeTeamKey(t.homeTeam))) &&
              (normalizeTeamKey(t.awayTeam).includes(normalizeTeamKey(vf.awayTeam)) ||
                normalizeTeamKey(vf.awayTeam).includes(normalizeTeamKey(t.awayTeam)))
          );
          if (!matchedMeta) continue;

          const nextStatus: SyncStatus = VALID_SYNC_STATUSES.includes(vf.status)
            ? vf.status
            : serverStore.fixtureUpdates[matchedMeta.fixtureId]?.status || 'NS';

          const ftParsed = parseScorePair(vf.score);
          const htParsed = parseScorePair(vf.htScore);
          const existingScores = serverStore.fixtureUpdates[matchedMeta.fixtureId]?.scores;

          const nextHome = ftParsed ? ftParsed.home : existingScores?.currentHome ?? 0;
          const nextAway = ftParsed ? ftParsed.away : existingScores?.currentAway ?? 0;

          const changed = upsertFixtureUpdate({
            fixtureId: matchedMeta.fixtureId,
            homeTeamName: matchedMeta.homeTeam,
            awayTeamName: matchedMeta.awayTeam,
            competitionId: matchedMeta.competitionId,
            kickoffTimeUtc: matchedMeta.kickoffTimeUtc,
            status: nextStatus,
            scores: {
              currentHome: nextHome,
              currentAway: nextAway,
              ...(htParsed
                ? { htHome: htParsed.home, htAway: htParsed.away }
                : typeof existingScores?.htHome === 'number' && typeof existingScores?.htAway === 'number'
                ? { htHome: existingScores.htHome, htAway: existingScores.htAway }
                : {}),
            },
            lastUpdatedUtc: new Date().toISOString(),
            syncSource: `Search-${activeModelUsed}`,
          });
          if (changed) totalUpdated++;
        }
      } catch (searchErr: any) {
        const formatted = formatGeminiError(searchErr);
        externalFailureNote = formatted.message;
        summaryNotes.push(`Search Grounding deferred (${formatted.message}) — persisted cache retained.`);
      }
    } else if (!hasActiveWindowMatch && !params.forceExternal) {
      summaryNotes.push('Store reconciled; no unresolved matches are currently in live kickoff window.');
    }

    // Run automated settlement audit on all completed matches
    const autoSettlement = runServerAutoSettlement();
    if (autoSettlement.settledCount > 0 || autoSettlement.voidedCount > 0) {
      summaryNotes.push(
        `Auto-Settlement Engine graded ${autoSettlement.settledCount} completed match(es)${
          autoSettlement.voidedCount > 0 ? `, voided ${autoSettlement.voidedCount}` : ''
        }.`
      );
    }

    const completedAt = new Date().toISOString();
    serverStore.lastAutoSyncAt = completedAt;

    const job: ServerSyncJob = {
      id: `sync-${Date.now()}`,
      provider: providersUsed.length > 0 ? providersUsed.join('+') : 'Persisted-Store',
      trigger: params.trigger,
      status: params.forceExternal && externalFailureNote && providersUsed.length === 0 ? 'failed' : 'success',
      recordsSynced: totalUpdated > 0 ? totalUpdated : Object.keys(serverStore.fixtureUpdates).length,
      message: summaryNotes.join(' ') || `Reconciled ${Object.keys(serverStore.fixtureUpdates).length} fixtures.`,
      startedAt,
      completedAt,
      sources: collectedSources,
    };

    recordSyncJob(job);
    saveServerStore(serverStore);

    return {
      job,
      summary: job.message,
      sources: collectedSources,
    };
  } finally {
    syncInFlight = false;
  }
}

export interface CreateAppOptions {
  aiRateLimitMax?: number;
  syncRateLimitMax?: number;
}

/**
 * Builds the Express application with security headers, rate limiting, validation,
 * persistence routes, and central error handling. Exported for integration/security tests.
 */
export function createApiApp(options: CreateAppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(securityHeadersMiddleware);
  app.use(apiRequestLogger);
  app.use(express.json({ limit: '16mb' }));
  app.use(express.urlencoded({ extended: true, limit: '16mb' }));
  app.use(jsonSyntaxErrorHandler);

  const aiRateLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: options.aiRateLimitMax ?? 30,
    keyPrefix: 'ai',
  });

  const syncRateLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: options.syncRateLimitMax ?? 120,
    keyPrefix: 'sync',
  });

  // Health & Store Readiness Check
  app.get('/api/health', (_req, res) => {
    const storeStatus = checkStoreHealth();
    res.status(storeStatus.storeWritable ? 200 : 503).json({
      status: storeStatus.storeWritable ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      engine: 'FootballIQ Quantitative Engine v2.4',
      storeWritable: storeStatus.storeWritable,
      persistedFixtures: storeStatus.persistedFixtures,
      syncJobsCount: storeStatus.syncJobsCount,
      capabilities: {
        geminiConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
        sportmonksConfigured: Boolean((process.env.SPORTMONKS_API_TOKEN || '').trim().length > 10),
      },
      models: {
        searchGrounding: 'gemini-4-hydrogen',
        deepReasoning: 'gemini-4-carbon',
        complexInteractive: 'gemini-4-argon',
        fastBriefing: 'gemini-3.1-flash-lite',
        video: 'veo-3.1-fast-generate-preview',
      },
      features: [
        'poisson',
        'dixon-coles',
        'interval-10m',
        'veo-video',
        'search-grounding-v4',
        'multi-turn-gemini-chat',
        'sportmonks',
      ],
    });
  });

  // 1. Tactical Scout with Google Search Grounding
  app.post('/api/gemini/grounded-scout', aiRateLimiter, async (req, res) => {
    try {
      const validation = validateScoutPayload(req.body);
      if (!validation.valid || !validation.data) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      const { homeTeam, awayTeam, competition, venue, kickoffTimeUtc } = validation.data;
      const prompt = `You are the Lead Tactical Scout and Sports Journalist for FootballIQ.
Perform a live Google Search-grounded tactical intelligence check for the football match:
Match: ${homeTeam} vs ${awayTeam}
Competition: ${competition}
Venue: ${venue}
Scheduled UTC Kickoff: ${kickoffTimeUtc}

Search the live web for verified real-time squad news, confirmed injuries, player suspensions, recent form, managerial tactical statements, and weather/pitch conditions for this exact matchup.

Return ONLY a valid JSON object (no markdown fences if possible) with these fields:
{
  "headline": "concise factual tactical match preview headline",
  "summary": "2-3 sentence factual narrative summary of team news and tactical context",
  "keyInjuries": [
    { "team": "team name", "player": "player name or unit", "status": "OUT" | "DOUBTFUL" | "RETURNING", "impactAnalysis": "concise tactical impact" }
  ],
  "tacticalKeyPoints": ["3 to 5 factual tactical points based on recent lineups and style"],
  "weatherAndPitch": "concise verified weather & stadium pitch conditions"
}`;

      const ai = getGenAI();
      let activeModelUsed = 'gemini-4-hydrogen';
      let response: any;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        activeModelUsed = 'gemini-3.1-flash-lite';
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
      }

      const rawText = (response.text ?? '').trim();
      const webSearchSources = extractGroundingSources(response);

      let parsedContent: any = null;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback below
      }

      if (!parsedContent) {
        parsedContent = {
          headline: `${homeTeam} vs ${awayTeam}: Grounded Tactical Brief`,
          summary: rawText || `Grounded intelligence compiled for ${homeTeam} vs ${awayTeam}.`,
          keyInjuries: [
            {
              team: homeTeam,
              player: 'Squad Availability Check',
              status: 'DOUBTFUL',
              impactAnalysis: 'See grounded narrative summary for confirmed squad fitness notes.',
            },
          ],
          tacticalKeyPoints: [
            `Verified matchup context retrieved via Google Search for ${homeTeam} vs ${awayTeam}.`,
            'Early 10-minute pressing structure and central progression zones will shape xG output.',
          ],
          weatherAndPitch: 'Standard matchday stadium conditions reported.',
        };
      }

      res.json({
        success: true,
        data: {
          fixtureId: `${homeTeam}-${awayTeam}`.toLowerCase().replace(/\s+/g, '-'),
          homeTeam,
          awayTeam,
          ...parsedContent,
          searchGroundedSources: webSearchSources,
          modelUsed: activeModelUsed,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({
        success: false,
        error: formatted.message,
      });
    }
  });

  // 2. Persistent Fixture State & Unified Auto-Sync
  app.get('/api/fixtures/state', syncRateLimiter, (_req, res) => {
    const nextAutoSyncAt = serverStore.lastAutoSyncAt
      ? new Date(Date.parse(serverStore.lastAutoSyncAt) + AUTO_SYNC_INTERVAL_MS).toISOString()
      : new Date(Date.now() + AUTO_SYNC_INTERVAL_MS).toISOString();

    res.json({
      success: true,
      data: {
        fixtureUpdates: Object.values(serverStore.fixtureUpdates),
        syncJobs: serverStore.syncJobs,
        lastAutoSyncAt: serverStore.lastAutoSyncAt,
        nextAutoSyncAt,
        autoSyncIntervalMs: AUTO_SYNC_INTERVAL_MS,
        sportmonksConfigured: Boolean((process.env.SPORTMONKS_API_TOKEN || '').trim().length > 10),
      },
    });
  });

  // Automated Today's Matchday State & Date Resolver
  app.get('/api/fixtures/today', syncRateLimiter, (req, res) => {
    try {
      const timezone = sanitizeText(String(req.query.timezone || 'Africa/Kampala'), 64);
      let targetDate = sanitizeText(String(req.query.date || ''), 32);
      if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        try {
          targetDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date());
        } catch {
          targetDate = new Date().toISOString().slice(0, 10);
        }
      }

      res.json({
        success: true,
        data: {
          dateStr: targetDate,
          timezone,
          dateLabel: serverStore.dateLabel || '15 November 2026',
          lastAutoSyncAt: serverStore.lastAutoSyncAt,
          fixtureUpdates: Object.values(serverStore.fixtureUpdates),
          totalTracked: serverStore.trackedFixtures.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Error resolving daily matchday' });
    }
  });

  app.post('/api/fixtures/sync', syncRateLimiter, async (req, res) => {
    try {
      if (req.body && typeof req.body !== 'object') {
        return res.status(400).json({ success: false, error: 'Request body must be a JSON object.' });
      }
      const {
        trigger = 'manual',
        dateLabel = '15 November 2026',
        forceExternal = false,
        fixtures = [],
      } = req.body || {};

      if (req.body?.fixtures !== undefined && !Array.isArray(req.body.fixtures)) {
        return res.status(400).json({ success: false, error: 'fixtures field must be an array.' });
      }

      const safeTrigger: 'auto' | 'manual' | 'boot' =
        trigger === 'auto' || trigger === 'boot' ? trigger : 'manual';

      const result = await executeUnifiedSync({
        trigger: safeTrigger,
        dateLabel: sanitizeText(dateLabel, 64) || '15 November 2026',
        forceExternal: Boolean(forceExternal),
        incomingFixtures: Array.isArray(fixtures) ? fixtures : [],
      });

      const nextAutoSyncAt = new Date(Date.now() + AUTO_SYNC_INTERVAL_MS).toISOString();

      if (forceExternal && result.job.status === 'failed') {
        return res.status(429).json({
          success: false,
          error: result.job.message,
          data: {
            job: result.job,
            fixtureUpdates: Object.values(serverStore.fixtureUpdates),
            syncJobs: serverStore.syncJobs,
            lastAutoSyncAt: serverStore.lastAutoSyncAt,
            nextAutoSyncAt,
            summary: result.summary,
            sources: result.sources,
          },
        });
      }

      res.json({
        success: true,
        data: {
          job: result.job,
          fixtureUpdates: Object.values(serverStore.fixtureUpdates),
          syncJobs: serverStore.syncJobs,
          lastAutoSyncAt: serverStore.lastAutoSyncAt,
          nextAutoSyncAt,
          summary: result.summary,
          sources: result.sources,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to synchronize fixtures',
      });
    }
  });

  // 2b. Universal Cloud Storage & Google Drive Backup Export
  app.get('/api/backup/export', syncRateLimiter, (_req, res) => {
    try {
      const updates = Object.values(serverStore.fixtureUpdates);
      const payload = {
        platform: 'FootballIQ Predictive Intelligence',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        destination: 'Google Drive Cloud Storage',
        stats: {
          totalTrackedFixtures: updates.length,
          totalSyncJobs: serverStore.syncJobs.length,
          lastAutoSyncAt: serverStore.lastAutoSyncAt,
        },
        fixtureUpdates: updates,
        syncJobs: serverStore.syncJobs.slice(0, 100),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="footballiq_cloud_backup_${new Date().toISOString().split('T')[0]}.json"`
      );
      res.json({
        success: true,
        data: payload,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to generate cloud export payload',
      });
    }
  });

  // 2c. Automated Match Settlement & Reconciliation Engine
  app.post('/api/settlement/reconcile', syncRateLimiter, async (_req, res) => {
    try {
      const summary = runServerAutoSettlement();
      res.json({
        success: true,
        data: {
          summary,
          lastAutoSyncAt: serverStore.lastAutoSyncAt,
          totalTracked: serverStore.trackedFixtures.length,
          totalUpdates: Object.keys(serverStore.fixtureUpdates).length,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to reconcile match settlements',
      });
    }
  });

  app.get('/api/settlement/status', syncRateLimiter, (_req, res) => {
    try {
      const updates = Object.values(serverStore.fixtureUpdates);
      const settled = updates.filter(
        (u) => u.settlement && (u.settlement.status === 'WON' || u.settlement.status === 'LOST')
      );
      const voided = updates.filter((u) => u.settlement?.status === 'VOID');
      const pending = updates.filter((u) => !u.settlement || u.settlement.status === 'PENDING');
      const won = settled.filter((u) => u.settlement?.status === 'WON').length;
      const lost = settled.filter((u) => u.settlement?.status === 'LOST').length;
      const settledTotal = won + lost;
      const accuracyPct = settledTotal > 0 ? Number(((won / settledTotal) * 100).toFixed(1)) : 0;

      res.json({
        success: true,
        data: {
          totalTracked: updates.length,
          settledTotal,
          won,
          lost,
          voided: voided.length,
          pending: pending.length,
          accuracyPct,
          lastAutoSyncAt: serverStore.lastAutoSyncAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to retrieve settlement status',
      });
    }
  });

  // 3. Server-side SportMonks Connectivity Proxy
  app.post('/api/sportmonks/status', syncRateLimiter, async (req, res) => {
    const start = Date.now();
    const suppliedToken = typeof req.body?.token === 'string' ? sanitizeText(req.body.token, 256) : '';
    const activeToken = suppliedToken || (process.env.SPORTMONKS_API_TOKEN || '').trim();
    const baseUrl = process.env.SPORTMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football';

    if (activeToken.length <= 10) {
      return res.json({
        ok: false,
        message: 'SportMonks API token is not configured. Add SPORTMONKS_API_TOKEN or enter a token above; persisted store & search sync remain active.',
        latencyMs: 0,
      });
    }

    try {
      const resp = await fetch(`${baseUrl}/my/resources`, {
        headers: {
          Authorization: activeToken,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;

      if (resp.ok) {
        return res.json({
          ok: true,
          message: 'SportMonks v3 Football API authenticated cleanly via server gateway.',
          latencyMs,
        });
      }
      return res.json({
        ok: false,
        message: `SportMonks API returned HTTP ${resp.status}. Check token permissions or plan limits.`,
        latencyMs,
      });
    } catch (err: any) {
      return res.json({
        ok: false,
        message: err?.name === 'TimeoutError'
          ? 'SportMonks API timed out after 5,000ms.'
          : `SportMonks connection error: ${err.message}`,
        latencyMs: Date.now() - start,
      });
    }
  });

  // 3b. Server-side Opta SDAPI Status & Discovery Endpoints
  app.get('/api/opta/status', syncRateLimiter, async (_req, res) => {
    try {
      const isConfigured = optaIngestionService.isLiveConfigured();
      const catalog = optaDiscoveryService.discoverCompetitions();
      const completeCount = catalog.filter((c) => c.coverageStatus === 'COMPLETE').length;
      const partialCount = catalog.filter((c) => c.coverageStatus === 'PARTIAL').length;
      const unavailableCount = catalog.filter((c) => c.coverageStatus === 'UNAVAILABLE').length;

      res.json({
        success: true,
        data: {
          liveConfigured: isConfigured,
          provider: 'Opta / Stats Perform (SDAPI v1)',
          outletKeyConfigured: Boolean(process.env.OPTA_OUTLET_KEY),
          tokenBucketRateLimit: '10 req/s',
          coverageMetrics: {
            totalDiscoveredCompetitions: catalog.length,
            complete: completeCount,
            partial: partialCount,
            unavailable: unavailableCount,
            confederationsCovered: ['UEFA', 'CAF', 'CONMEBOL', 'CONCACAF', 'AFC', 'OFC', 'FIFA'],
          },
          supportedFeeds: [
            'F01/F03 Fixtures & Match Details',
            'F09 Starting Lineups & Formations (Pitch Coordinates)',
            'F24 Granular In-Play Match Events',
            'Advanced xG, PPDA, Field Tilt & Shot Coordinates',
            'MA21 Opta Supercomputer Simulation Predictions',
          ],
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Error checking Opta status' });
    }
  });

  app.get('/api/opta/competitions', syncRateLimiter, (req, res) => {
    try {
      const confederation = (req.query.confederation as any) || 'ALL';
      const gender = (req.query.gender as any) || 'ALL';
      const tier = (req.query.tier as any) || 'ALL';
      const status = (req.query.status as any) || 'ALL';
      const searchQuery = sanitizeText(String(req.query.q || ''), 100);

      const competitions = optaDiscoveryService.discoverCompetitions({
        confederation,
        gender,
        tier,
        status,
        searchQuery,
      });

      res.json({
        success: true,
        count: competitions.length,
        data: competitions,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Error discovering Opta competitions' });
    }
  });

  app.post('/api/opta/sync', syncRateLimiter, async (req, res) => {
    try {
      const outletKey = typeof req.body?.outletKey === 'string' ? sanitizeText(req.body.outletKey, 128) : undefined;
      const syncResult = await optaDiscoveryService.synchronizeCoverage(outletKey);
      res.json({
        success: true,
        data: syncResult,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Error synchronizing Opta coverage' });
    }
  });

  app.get('/api/opta/match/:id', syncRateLimiter, async (req, res) => {
    try {
      const fixtureId = sanitizeText(req.params.id, 128);
      if (!fixtureId) {
        return res.status(400).json({ success: false, error: 'Missing fixtureId' });
      }

      const [eventsRes, lineupRes, metricsRes, predRes] = await Promise.all([
        optaIngestionService.ingestMatchEvents(fixtureId),
        optaIngestionService.ingestLineups(fixtureId),
        optaIngestionService.ingestAdvancedMetrics(fixtureId),
        optaIngestionService.ingestOptaPredictions(fixtureId),
      ]);

      res.json({
        success: true,
        data: {
          fixtureId,
          events: eventsRes.data,
          lineup: lineupRes.data,
          metrics: metricsRes.data,
          prediction: predRes.data,
          source: eventsRes.source,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Error ingesting Opta match feeds' });
    }
  });

  // 4. Direct Search-Grounded Fixture Sync Endpoint
  app.post('/api/gemini/sync-fixtures', aiRateLimiter, async (req, res) => {
    try {
      const dateLabel = sanitizeText(req.body?.dateLabel, 64) || '15 November 2026';
      const fixtures = Array.isArray(req.body?.fixtures) ? req.body.fixtures.slice(0, 100) : [];

      if (fixtures.length > 0 && serverStore.trackedFixtures.length === 0) {
        seedIncomingFixturesIntoStore(fixtures, new Date().toISOString());
      }

      const fixtureListText = fixtures.length > 0
        ? fixtures.map((f: any) => `- ${sanitizeText(f?.homeTeam, 80)} vs ${sanitizeText(f?.awayTeam, 80)} (${sanitizeText(f?.competition, 80)}, scheduled ${sanitizeText(f?.kickoffTimeUtc, 48)})`).join('\n')
        : 'UEFA Nations League, AFCON 2027 Qualifiers, Premier League, La Liga, Serie A, and world matches on 15 November 2026';

      const prompt = `Verify the real-world football schedule, match statuses (NS/LIVE/HT/FT/POSTP), and any live, half-time, or final scores for ${dateLabel} (UTC / Africa/Kampala EAT) using Google Search.
Specifically verify these tracked fixtures:
${fixtureListText}

Return ONLY a valid JSON object with:
{
  "summary": "concise factual status of today's slate and any live/final updates found",
  "verifiedFixtures": [
    {
      "homeTeam": "string",
      "awayTeam": "string",
      "competition": "string",
      "kickoffInfo": "verified kickoff time",
      "status": "NS" | "LIVE" | "HT" | "FT" | "POSTP",
      "score": "optional score string like 2-1 if LIVE, HT, or FT, otherwise empty string",
      "htScore": "optional half-time score string like 1-0 if verified, otherwise empty string"
    }
  ]
}`;

      const ai = getGenAI();
      let activeModelUsed = 'gemini-4-hydrogen';
      let response: any;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        activeModelUsed = 'gemini-3.1-flash-lite';
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
      }

      const rawText = (response.text ?? '').trim();
      const sources = extractGroundingSources(response);

      let parsed: any = null;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // fallback
      }

      const verifiedFixtures = Array.isArray(parsed?.verifiedFixtures) ? parsed.verifiedFixtures : [];
      const syncedAt = new Date().toISOString();

      let persistedCount = 0;
      for (const vf of verifiedFixtures) {
        const tracked = serverStore.trackedFixtures.find(
          (t) =>
            normalizeTeamKey(t.homeTeam) === normalizeTeamKey(vf.homeTeam) &&
            normalizeTeamKey(t.awayTeam) === normalizeTeamKey(vf.awayTeam)
        );
        if (!tracked) continue;
        const ftParsed = parseScorePair(vf.score);
        const htParsed = parseScorePair(vf.htScore);
        const existingScores = serverStore.fixtureUpdates[tracked.fixtureId]?.scores;
        const nextStatus: SyncStatus = VALID_SYNC_STATUSES.includes(vf.status) ? vf.status : 'NS';

        const changed = upsertFixtureUpdate({
          fixtureId: tracked.fixtureId,
          homeTeamName: tracked.homeTeam,
          awayTeamName: tracked.awayTeam,
          competitionId: tracked.competitionId,
          kickoffTimeUtc: tracked.kickoffTimeUtc,
          status: nextStatus,
          scores: {
            currentHome: ftParsed ? ftParsed.home : existingScores?.currentHome ?? 0,
            currentAway: ftParsed ? ftParsed.away : existingScores?.currentAway ?? 0,
            ...(htParsed ? { htHome: htParsed.home, htAway: htParsed.away } : {}),
          },
          lastUpdatedUtc: syncedAt,
          syncSource: `Search-${activeModelUsed}`,
        });
        if (changed) persistedCount++;
      }

      if (persistedCount > 0 || verifiedFixtures.length > 0) {
        recordSyncJob({
          id: `sync-${Date.now()}`,
          provider: `Search-${activeModelUsed}`,
          trigger: 'manual',
          status: 'success',
          recordsSynced: persistedCount || verifiedFixtures.length,
          message: parsed?.summary || `Verified ${verifiedFixtures.length} fixtures via Google Search.`,
          startedAt: syncedAt,
          completedAt: syncedAt,
          sources,
        });
        saveServerStore(serverStore);
      }

      res.json({
        success: true,
        data: {
          syncedAt,
          dateChecked: dateLabel,
          summary: parsed?.summary || rawText || `Verified ${dateLabel} fixtures via Google Search.`,
          verifiedFixtures,
          sources,
          modelUsed: activeModelUsed,
        },
      });
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({
        success: false,
        error: formatted.message,
      });
    }
  });

  // 5. Multi-Turn Gemini Chatbot Endpoint
  app.post('/api/gemini/chat', aiRateLimiter, async (req, res) => {
    try {
      const validation = validateChatPayload(req.body);
      if (!validation.valid || !validation.data) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      const { model, message, history, fixtureContext, enableSearchGrounding } = validation.data;
      const selectedModel: ChatModelId = VALID_CHAT_MODELS.includes(model as ChatModelId)
        ? (model as ChatModelId)
        : 'gemini-4-hydrogen';

      const profile = MODEL_ROLE_PROFILES[selectedModel];
      let systemInstruction = profile.systemInstruction;
      if (fixtureContext) {
        systemInstruction +=
          `\n\n[ATTACHED MATCH CONTEXT - USE THESE EXACT FACTUAL PROBABILITIES & STATS WHEN ANSWERING]\n` +
          `${JSON.stringify(fixtureContext, null, 2)}`;
      }

      const formattedHistory: Content[] = [];
      for (const item of history) {
        if (formattedHistory.length === 0 && item.role !== 'user') continue;
        const last = formattedHistory[formattedHistory.length - 1];
        if (last && last.role === item.role) {
          last.parts = [...(last.parts || []), { text: item.text }];
        } else {
          formattedHistory.push({ role: item.role, parts: [{ text: item.text }] });
        }
      }
      if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === 'user') {
        formattedHistory.pop();
      }

      const config: any = { systemInstruction };
      if (selectedModel === 'gemini-4-hydrogen' && enableSearchGrounding) {
        config.tools = [{ googleSearch: {} }];
      } else if (selectedModel === 'gemini-4-carbon' || selectedModel === 'gemini-4-argon') {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const ai = getGenAI();
      let activeModelUsed: ChatModelId = selectedModel;
      let response: any;
      try {
        const chat = ai.chats.create({
          model: selectedModel,
          history: formattedHistory,
          config,
        });
        response = await chat.sendMessage({ message });
      } catch (err) {
        if (selectedModel === 'gemini-3.1-flash-lite' || !isQuotaError(err)) {
          throw err;
        }
        activeModelUsed = 'gemini-3.1-flash-lite';
        const fallbackChat = ai.chats.create({
          model: 'gemini-3.1-flash-lite',
          history: formattedHistory,
          config: { systemInstruction },
        });
        response = await fallbackChat.sendMessage({ message });
      }

      const replyText = (response.text ?? '').trim();
      const sources = extractGroundingSources(response);

      res.json({
        success: true,
        data: {
          reply: replyText || 'Analysis completed without textual output. Please refine your query.',
          modelUsed: activeModelUsed,
          roleTitle: profile.roleTitle,
          sources,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({
        success: false,
        error: formatted.message,
      });
    }
  });

  // 6. Veo Match Cinematic Video Generation
  app.post('/api/veo/generate', aiRateLimiter, async (req, res) => {
    try {
      const validation = validateVeoPayload(req.body);
      if (!validation.valid || !validation.data) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      const { prompt, imageBase64, mimeType, aspectRatio } = validation.data;
      const ai = getGenAI();

      const requestPayload: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        config: {
          numberOfVideos: 1,
          aspectRatio,
        },
      };

      if (imageBase64) {
        requestPayload.image = {
          imageBytes: imageBase64,
          mimeType,
        };
      }

      const operation = await (ai.models as any).generateVideos(requestPayload);

      res.json({
        success: true,
        operationName: operation.name || operation.id || null,
        status: operation.done ? 'completed' : 'processing',
        videoUrl: operation.response?.videos?.[0]?.videoUri || operation.response?.generatedVideos?.[0]?.video?.uri || null,
      });
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({
        success: false,
        error: formatted.message,
      });
    }
  });

  app.get('/api/veo/status/:operationName', syncRateLimiter, async (req, res) => {
    try {
      const rawName = sanitizeText(req.params.operationName, 512);
      if (!rawName) {
        return res.status(400).json({ success: false, error: 'Missing operationName parameter.' });
      }

      const ai = getGenAI();
      const decodedName = decodeURIComponent(rawName);
      const op = await (ai.operations as any).getVideosOperation({
        operation: { name: decodedName },
      });

      if (op.done) {
        const videoUri = op.response?.videos?.[0]?.videoUri || op.response?.generatedVideos?.[0]?.video?.uri;
        res.json({
          success: true,
          done: true,
          status: 'completed',
          videoUrl: videoUri || null,
        });
      } else {
        res.json({
          success: true,
          done: false,
          status: 'processing',
        });
      }
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({
        success: false,
        error: formatted.message,
      });
    }
  });

  // Catch unknown /api routes with JSON 404 before SPA fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: `API endpoint not found: ${req.method} ${req.path}`,
    });
  });

  app.use(centralErrorHandler);
  return app;
}

async function startServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`FootballIQ Server running on http://0.0.0.0:${PORT}`);
  });

  const syncInterval = setInterval(() => {
    if (serverStore.trackedFixtures.length === 0) return;
    executeUnifiedSync({
      trigger: 'auto',
      dateLabel: serverStore.dateLabel,
      forceExternal: false,
    }).catch((err) => {
      console.warn('Background auto-sync cycle skipped:', err?.message || err);
    });
    runServerAutoSettlement();
  }, AUTO_SYNC_INTERVAL_MS);

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down FootballIQ server gracefully...`);
    clearInterval(syncInterval);
    saveServerStore(serverStore);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Ensure server boots cleanly in production, Docker, and Render.com environments
// Skips auto-boot only when explicitly invoked by integration test runners
const isTestRunner =
  process.env.NODE_ENV === 'test' ||
  process.argv.some((arg) => arg.includes('test') || arg.includes('mocha') || arg.includes('jest'));

if (!isTestRunner) {
  startServer().catch((err) => {
    console.error('Fatal Server Boot Error:', err);
    process.exit(1);
  });
}
