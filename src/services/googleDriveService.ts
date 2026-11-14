/**
 * Google Drive Cloud Storage & Intelligence Export Service
 * Enables storing and syncing match predictions, tactical reports,
 * model calibration audits, and chat histories to Google Drive.
 */

import { Fixture } from '../types/football';

export interface GoogleDriveSyncSummary {
  lastSyncAt: string | null;
  totalFilesSynced: number;
  folderName: string;
  syncedItems: {
    fixturesCount: number;
    predictionsCount: number;
    sessionsCount: number;
  };
}

const DRIVE_STORAGE_KEY = 'footballiq_gdrive_sync_meta_v1';

/**
 * Retrieves the current Google Drive sync metadata from local storage.
 */
export function getGoogleDriveSyncMeta(): GoogleDriveSyncSummary {
  try {
    const raw = localStorage.getItem(DRIVE_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore storage access issues
  }
  return {
    lastSyncAt: null,
    totalFilesSynced: 0,
    folderName: 'FootballIQ Cloud Storage',
    syncedItems: {
      fixturesCount: 0,
      predictionsCount: 0,
      sessionsCount: 0,
    },
  };
}

/**
 * Saves updated Google Drive sync metadata.
 */
export function saveGoogleDriveSyncMeta(meta: GoogleDriveSyncSummary): void {
  try {
    localStorage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

/**
 * Generates a full structured JSON backup of all fixtures and predictions.
 */
export function generateFixturesJsonBackup(fixtures: Fixture[]): string {
  const exportPayload = {
    platform: 'FootballIQ Predictive Intelligence',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    totalLeagues: 30,
    totalFixtures: fixtures.length,
    fixtures: fixtures.map((f) => {
      const pred = f.prediction;
      const m1x2 = pred?.market1X2;
      const m10 = pred?.market1X2Interval10;
      const btts = pred?.marketBTTS;
      const ou25 = pred?.marketOverUnder25;
      const dc = pred?.marketDoubleChance;
      const htft = pred?.marketHtFt;

      return {
        id: f.id,
        competition: {
          id: f.competition?.id || '',
          name: f.competition?.name || '',
          country: f.competition?.country || '',
        },
        homeTeam: {
          name: f.homeTeam.name,
          shortName: f.homeTeam.shortName,
          country: f.homeTeam.country,
          attackRating: f.homeTeam.attackRating,
          defenseRating: f.homeTeam.defenseRating,
          form: f.homeTeam.formLast5,
        },
        awayTeam: {
          name: f.awayTeam.name,
          shortName: f.awayTeam.shortName,
          country: f.awayTeam.country,
          attackRating: f.awayTeam.attackRating,
          defenseRating: f.awayTeam.defenseRating,
          form: f.awayTeam.formLast5,
        },
        kickoffTimeUtc: f.kickoffTimeUtc,
        status: f.status,
        scores: f.scores,
        probabilities: m1x2
          ? { homeWin: m1x2.homeWin, draw: m1x2.draw, awayWin: m1x2.awayWin }
          : { homeWin: 0.45, draw: 0.28, awayWin: 0.27 },
        odds: m1x2
          ? {
              homeWin: +(1 / m1x2.homeWin).toFixed(2),
              draw: +(1 / m1x2.draw).toFixed(2),
              awayWin: +(1 / m1x2.awayWin).toFixed(2),
            }
          : { homeWin: 2.22, draw: 3.57, awayWin: 3.7 },
        interval10Probabilities: m10 || null,
        bttsProbabilities: btts || null,
        overUnder25Probabilities: ou25 || null,
        doubleChanceProbabilities: dc || null,
        htFtProbabilities: htft || null,
        predictedOutcome: m1x2?.predictedOutcome || '1',
        confidenceScore: pred?.confidenceScore || 75,
        settlement: pred?.settlement || null,
      };
    }),
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Generates an executive Matchday Dossier formatted in Markdown for Google Docs.
 */
export function generateMatchdayDossierMarkdown(fixtures: Fixture[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let md = `# FootballIQ - Matchday Intelligence Dossier\n`;
  md += `**Date:** ${dateStr}  \n`;
  md += `**Coverage:** 30 World Leagues | ${fixtures.length} Active & Historical Fixtures  \n`;
  md += `**Quantitative Models:** Poisson PMF, Dixon-Coles Matrix, 10-Minute Opening Interval, Gemini 4 Grounding  \n\n`;
  md += `---\n\n`;

  md += `## 1. High-Confidence Intelligence Highlights\n\n`;
  const highConfFixtures = fixtures.filter((f) => (f.prediction?.confidenceScore || 0) >= 80);
  if (highConfFixtures.length > 0) {
    md += `| Match | League | Market | Pick | Model Prob | Confidence |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const f of highConfFixtures.slice(0, 15)) {
      const pred = f.prediction!;
      const outcome = pred.market1X2.predictedOutcome;
      const prob =
        outcome === '1'
          ? pred.market1X2.homeWin
          : outcome === 'X'
          ? pred.market1X2.draw
          : pred.market1X2.awayWin;
      md += `| **${f.homeTeam.name} vs ${f.awayTeam.name}** | ${f.competition.name} | 1X2 | \`${outcome}\` | ${(prob * 100).toFixed(1)}% | **${pred.confidenceScore.toFixed(0)}%** |\n`;
    }
    md += `\n`;
  } else {
    md += `*All fixtures currently evaluated within balanced statistical margins.*\n\n`;
  }

  md += `## 2. Comprehensive Matchday Fixtures & Probabilities\n\n`;
  for (const f of fixtures) {
    const pred = f.prediction;
    const m1x2 = pred?.market1X2;
    const homeProb = m1x2 ? (m1x2.homeWin * 100).toFixed(1) : '45.0';
    const drawProb = m1x2 ? (m1x2.draw * 100).toFixed(1) : '28.0';
    const awayProb = m1x2 ? (m1x2.awayWin * 100).toFixed(1) : '27.0';

    md += `### ${f.homeTeam.name} vs ${f.awayTeam.name} (${f.competition?.name || 'World League'})\n`;
    md += `- **Status / Score:** ${f.status} (${f.scores?.currentHome ?? 0} - ${f.scores?.currentAway ?? 0})\n`;
    md += `- **Kickoff (UTC):** ${f.kickoffTimeUtc}\n`;
    md += `- **1X2 Probabilities:** Home: **${homeProb}%** | Draw: **${drawProb}%** | Away: **${awayProb}%**\n`;

    if (pred?.market1X2Interval10) {
      const iDraw = (pred.market1X2Interval10.draw * 100).toFixed(1);
      const iEarly = (pred.market1X2Interval10.earlyGoalProbability * 100).toFixed(1);
      md += `- **10-Min Interval (00:01-09:59):** Draw: **${iDraw}%** | Early Goal Chance: **${iEarly}%**\n`;
    }

    if (pred?.marketBTTS && pred?.marketOverUnder25) {
      const bttsYes = (pred.marketBTTS.yes * 100).toFixed(1);
      const over25 = (pred.marketOverUnder25.over * 100).toFixed(1);
      md += `- **Goals Markets:** BTTS Yes: **${bttsYes}%** | Over 2.5: **${over25}%**\n`;
    }

    const pick = m1x2?.predictedOutcome || '1';
    const conf = pred?.confidenceScore ? pred.confidenceScore.toFixed(0) : '75';
    md += `- **Model Pick:** \`${pick}\` (Confidence: ${conf}%)\n\n`;
  }

  md += `---\n`;
  md += `*Generated automatically by FootballIQ for Google Drive cloud storage & analysis.*\n`;
  return md;
}

/**
 * Generates CSV data for Google Sheets calibration audits.
 */
export function generateCalibrationCsv(fixtures: Fixture[]): string {
  const headers = [
    'Fixture_ID',
    'Competition',
    'Home_Team',
    'Away_Team',
    'Status',
    'Score_Home',
    'Score_Away',
    '1X2_Pick',
    'Home_Prob',
    'Draw_Prob',
    'Away_Prob',
    'Interval_10_Pick',
    'Interval_10_Draw_Prob',
    'BTTS_Yes_Prob',
    'Over_25_Prob',
    'Outcome_Status',
  ];

  const rows = fixtures.map((f) => {
    const pred = f.prediction;
    const m1x2 = pred?.market1X2;
    const outcomeStatus = pred?.settlement?.status || (f.status === 'FT' ? 'SETTLED' : 'PENDING');

    return [
      `"${f.id}"`,
      `"${f.competition?.name || ''}"`,
      `"${f.homeTeam.name}"`,
      `"${f.awayTeam.name}"`,
      `"${f.status}"`,
      f.scores?.currentHome ?? 0,
      f.scores?.currentAway ?? 0,
      `"${m1x2?.predictedOutcome || '1'}"`,
      m1x2 ? (m1x2.homeWin * 100).toFixed(1) : '',
      m1x2 ? (m1x2.draw * 100).toFixed(1) : '',
      m1x2 ? (m1x2.awayWin * 100).toFixed(1) : '',
      `"${pred?.market1X2Interval10?.predictedOutcome || 'X'}"`,
      pred?.market1X2Interval10 ? (pred.market1X2Interval10.draw * 100).toFixed(1) : '',
      pred?.marketBTTS ? (pred.marketBTTS.yes * 100).toFixed(1) : '',
      pred?.marketOverUnder25 ? (pred.marketOverUnder25.over * 100).toFixed(1) : '',
      `"${outcomeStatus}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Triggers a browser download of any content payload.
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Uploads a file directly to Google Drive via the Google Drive REST API v3 multipart upload.
 * Requires an active Google OAuth access token with https://www.googleapis.com/auth/drive.file scope.
 */
export async function uploadToGoogleDriveWithToken(
  accessToken: string,
  fileName: string,
  mimeType: string,
  content: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const metadata = {
      name: fileName,
      mimeType,
      description: 'FootballIQ Autonomous Cloud Storage Archive',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Google Drive upload failed with status ${response.status}`);
    }

    const data = await response.json();
    return { success: true, fileId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to upload to Google Drive' };
  }
}
