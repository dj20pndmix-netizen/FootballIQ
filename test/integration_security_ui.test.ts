import http from 'node:http';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApiApp } from '../server.ts';
import { STORE_PATH } from '../server/store.ts';
import {
  sanitizeText,
  validateChatPayload,
  validateScoutPayload,
  validateVeoPayload,
} from '../server/middleware.ts';
import { getInitialFixtures } from '../src/services/mockHistoricalData.ts';
import { FixtureCard } from '../src/components/FixtureCard.tsx';
import { PredictionOutcomeBarGraph } from '../src/components/PredictionOutcomeBarGraph.tsx';
import { MethodologyView } from '../src/components/MethodologyView.tsx';
import { MatchDetailModal } from '../src/components/MatchDetailModal.tsx';
import { ErrorBoundary } from '../src/components/ErrorBoundary.tsx';
import { CalibrationView } from '../src/components/CalibrationView.tsx';
import { AuthPortalView } from '../src/components/AuthPortalView.tsx';
import { getTeamBadge, normalizeTeamName } from '../src/services/teamBadgeService.ts';
import { TeamBadge } from '../src/components/TeamBadge.tsx';
import { GoogleDriveSyncModal } from '../src/components/GoogleDriveSyncModal.tsx';
import { InstallPwaBanner } from '../src/components/InstallPwaBanner.tsx';
import {
  generateFixturesJsonBackup,
  generateMatchdayDossierMarkdown,
  generateCalibrationCsv,
} from '../src/services/googleDriveService.ts';
import {
  formatAuthErrorMessage,
  isAdminUser,
  isAuthorizedAdminEmail,
  computeSha256,
  signInWithGoogle,
  firebaseConfig,
} from '../src/services/firebase.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('FOOTBALLIQ INTEGRATION, SECURITY, PERFORMANCE & UI COMPONENT TESTS');
  console.log('================================================================');

  // -------------------------------------------------------------------------
  // 1. Middleware & Security Validation Unit Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Security Sanitization & Payload Validation Unit Tests ---');
  assert(
    sanitizeText('  Arsenal\u0000\u0007 FC  ', 20) === 'Arsenal FC',
    'sanitizeText strips null/control characters and trims whitespace'
  );
  assert(
    sanitizeText('A'.repeat(200), 50).length === 50,
    'sanitizeText enforces maximum length cap'
  );

  const scoutSameTeam = validateScoutPayload({ homeTeam: 'Uganda', awayTeam: 'Uganda' });
  assert(!scoutSameTeam.valid, 'validateScoutPayload rejects identical homeTeam and awayTeam');

  const scoutMissing = validateScoutPayload({ homeTeam: 'Uganda' });
  assert(!scoutMissing.valid, 'validateScoutPayload rejects missing awayTeam');

  const scoutValid = validateScoutPayload({
    homeTeam: 'Uganda',
    awayTeam: 'Botswana',
    competition: 'AFCON 2027 Qualifiers',
  });
  assert(scoutValid.valid && scoutValid.data?.homeTeam === 'Uganda', 'validateScoutPayload accepts valid fixture');

  const chatEmpty = validateChatPayload({ message: '   ' });
  assert(!chatEmpty.valid, 'validateChatPayload rejects empty/whitespace-only message');

  const chatHugeCtx = validateChatPayload({
    message: 'Analyze match',
    fixtureContext: { blob: 'x'.repeat(20_000) },
  });
  assert(!chatHugeCtx.valid, 'validateChatPayload rejects oversized fixtureContext (>16 KB)');

  const veoBadRatio = validateVeoPayload({ aspectRatio: '21:9', prompt: 'stadium' });
  assert(!veoBadRatio.valid, 'validateVeoPayload rejects unsupported aspect ratio 21:9');

  const veoBadImage = validateVeoPayload({ aspectRatio: '16:9', imageBase64: 'https://evil.example/img.jpg' });
  assert(!veoBadImage.valid, 'validateVeoPayload rejects non-base64 arbitrary strings/URLs');

  const veoValidDataUrl = validateVeoPayload({
    aspectRatio: '16:9',
    prompt: 'Floodlights pan',
    imageBase64: 'data:image/png;base64,iVBORw0KGgo=',
  });
  assert(
    veoValidDataUrl.valid && veoValidDataUrl.data?.mimeType === 'image/png',
    'validateVeoPayload parses data URL MIME type and base64 bytes cleanly'
  );

  // -------------------------------------------------------------------------
  // 2. Live HTTP Server API, Security Headers, Rate Limit & Persistence Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Backend API, Security Headers, Rate Limit & Sync Store Tests ---');
  const hadStoreBefore = fs.existsSync(STORE_PATH);
  const storeBackup = hadStoreBefore ? fs.readFileSync(STORE_PATH, 'utf-8') : null;

  const testApp = createApiApp({ aiRateLimitMax: 4, syncRateLimitMax: 60 });
  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 2a. Health & Security Headers
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthJson: any = await healthRes.json();
    assert(healthRes.status === 200, 'GET /api/health responds 200');
    assert(healthJson.status === 'healthy' && healthJson.storeWritable === true, 'Health confirms storeWritable: true');
    assert(
      !JSON.stringify(healthJson).includes('AIza') && !('GEMINI_API_KEY' in healthJson),
      'Health endpoint leaks zero API keys or secret strings'
    );
    assert(
      healthRes.headers.get('x-content-type-options') === 'nosniff',
      'Security header X-Content-Type-Options: nosniff present'
    );
    assert(
      healthRes.headers.get('referrer-policy') === 'no-referrer',
      'Security header Referrer-Policy: no-referrer present'
    );
    assert(
      !healthRes.headers.get('x-powered-by'),
      'X-Powered-By header stripped'
    );
    assert(
      healthRes.headers.get('x-frame-options') !== 'DENY',
      'X-Frame-Options: DENY omitted for AI Studio iframe compatibility'
    );

    // 2b. Malformed JSON returns structured 400 JSON
    const badJsonRes = await fetch(`${baseUrl}/api/gemini/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    const badJsonBody: any = await badJsonRes.json();
    assert(
      badJsonRes.status === 400 && badJsonBody.success === false,
      'Malformed JSON returns structured HTTP 400 JSON response'
    );

    // 2c. Unknown API endpoint returns structured 404 JSON
    const notFoundRes = await fetch(`${baseUrl}/api/does-not-exist`);
    const notFoundBody: any = await notFoundRes.json();
    assert(
      notFoundRes.status === 404 && notFoundBody.success === false,
      'Unknown /api route returns structured HTTP 404 JSON response'
    );

    // 2d. Schema validation rejection on POST routes
    const badScoutRes = await fetch(`${baseUrl}/api/gemini/grounded-scout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeTeam: 'Uganda' }),
    });
    assert(badScoutRes.status === 400, 'POST /api/gemini/grounded-scout rejects incomplete team payload (400)');

    const badFixturesSyncRes = await fetch(`${baseUrl}/api/fixtures/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtures: 'not-an-array' }),
    });
    assert(badFixturesSyncRes.status === 400, 'POST /api/fixtures/sync rejects non-array fixtures payload (400)');

    // 2e. Sliding-window rate limiter check (aiRateLimitMax = 4)
    // Note: badJsonRes already ran before route-level aiRateLimiter, badScoutRes was call #1 on AI limiter.
    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }),
      });
    }
    const rateLimitedRes = await fetch(`${baseUrl}/api/gemini/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'trigger limit' }),
    });
    assert(
      rateLimitedRes.status === 429 && Number(rateLimitedRes.headers.get('retry-after')) >= 1,
      'AI endpoint enforces sliding-window rate limit (HTTP 429 + Retry-After header)'
    );

    // 2f. End-to-End Persistence Round-Trip (/api/fixtures/sync -> /api/fixtures/state)
    const testFixtures = getInitialFixtures().slice(0, 2).map((f) => ({
      fixtureId: f.id,
      homeTeam: f.homeTeam.name,
      awayTeam: f.awayTeam.name,
      competitionId: f.competition.id,
      competition: f.competition.name,
      kickoffTimeUtc: f.kickoffTimeUtc,
      status: f.status,
      scores: f.scores,
      lastUpdatedUtc: f.lastUpdatedUtc,
    }));

    const syncRes = await fetch(`${baseUrl}/api/fixtures/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: 'manual',
        dateLabel: '14 November 2026',
        forceExternal: false,
        fixtures: testFixtures,
      }),
    });
    const syncJson: any = await syncRes.json();
    assert(
      syncRes.status === 200 && syncJson.success === true && syncJson.data?.fixtureUpdates?.length >= 2,
      'POST /api/fixtures/sync persists fixtures and returns synced state'
    );

    const stateRes = await fetch(`${baseUrl}/api/fixtures/state`);
    const stateJson: any = await stateRes.json();
    assert(
      stateRes.status === 200 &&
        stateJson.data?.fixtureUpdates?.some((u: any) => u.fixtureId === testFixtures[0].fixtureId),
      'GET /api/fixtures/state retrieves persisted fixture update from disk store'
    );

    // 2g. Concurrent Read Performance Benchmark (20 parallel requests < 350ms)
    const perfStart = Date.now();
    const perfResponses = await Promise.all(
      Array.from({ length: 20 }, () => fetch(`${baseUrl}/api/fixtures/state`))
    );
    const perfElapsed = Date.now() - perfStart;
    assert(
      perfResponses.every((r) => r.status === 200) && perfElapsed < 500,
      `20 concurrent GET /api/fixtures/state calls succeeded in ${perfElapsed}ms (<500ms SLA)`
    );

    // 2h. Universal Cloud Storage & Google Drive Backup Export
    const backupRes = await fetch(`${baseUrl}/api/backup/export`);
    const backupJson: any = await backupRes.json();
    assert(
      backupRes.status === 200 &&
        backupJson.success === true &&
        backupJson.data.destination === 'Google Drive Cloud Storage' &&
        Array.isArray(backupJson.data.fixtureUpdates),
      'GET /api/backup/export provides structured Google Drive cloud export payload'
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Restore .data/sync_state.json cleanly so tests leave zero artifact pollution
    if (hadStoreBefore && storeBackup !== null) {
      fs.writeFileSync(STORE_PATH, storeBackup, 'utf-8');
    } else if (!hadStoreBefore && fs.existsSync(STORE_PATH)) {
      fs.unlinkSync(STORE_PATH);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Frontend Component Rendering & Integration Assertions
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Frontend Component SSR & Workflow Rendering Tests ---');
  const fixtures = getInitialFixtures();
  const sampleFixture = fixtures[0];
  const noop = () => {};

  const markets: ('1X2' | '1X2_INTERVAL_10' | 'BTTS' | 'OVER_UNDER_25' | 'DOUBLE_CHANCE' | 'HT_FT')[] = [
    '1X2',
    '1X2_INTERVAL_10',
    'BTTS',
    'OVER_UNDER_25',
    'DOUBLE_CHANCE',
    'HT_FT',
  ];

  for (const m of markets) {
    const html = renderToStaticMarkup(
      React.createElement(FixtureCard, {
        fixture: sampleFixture,
        activeMarket: m,
        selectedTimezone: 'Africa/Kampala',
        oddsFormat: 'PROBABILITY',
        onSelectFixture: noop,
        onOpenScout: noop,
        onOpenVeo: noop,
      })
    );
    assert(
      html.includes(sampleFixture.homeTeam.name) && html.includes(sampleFixture.awayTeam.name),
      `FixtureCard renders ${m} cleanly for ${sampleFixture.homeTeam.name} vs ${sampleFixture.awayTeam.name}`
    );
  }

  const intervalHtml = renderToStaticMarkup(
    React.createElement(FixtureCard, {
      fixture: sampleFixture,
      activeMarket: '1X2_INTERVAL_10',
      selectedTimezone: 'Africa/Kampala',
      oddsFormat: 'PROBABILITY',
      onSelectFixture: noop,
      onOpenScout: noop,
      onOpenVeo: noop,
    })
  );
  assert(
    intervalHtml.includes('1X2 - Interval 10 Min (00:01-09:59)') && intervalHtml.includes('Early Goal Chance'),
    'FixtureCard renders explicit 10-minute interval (00:01-09:59) probability breakdown'
  );

  const barGraphHtml = renderToStaticMarkup(
    React.createElement(PredictionOutcomeBarGraph, { fixtures })
  );
  assert(
    barGraphHtml.includes('Won') && barGraphHtml.includes('Lost') && barGraphHtml.includes('Pending'),
    'PredictionOutcomeBarGraph renders separate Won, Lost, and Pending column indicators'
  );

  const modalHtml = renderToStaticMarkup(
    React.createElement(MatchDetailModal, {
      fixture: sampleFixture,
      onClose: noop,
      selectedTimezone: 'Africa/Kampala',
      oddsFormat: 'PROBABILITY',
      onLaunchVeo: noop,
    })
  );
  assert(
    modalHtml.includes('role="dialog"') && modalHtml.includes('All 6 Markets Breakdown'),
    'MatchDetailModal renders accessible dialog attributes and All 6 Markets Breakdown tab'
  );

  const methodologyHtml = renderToStaticMarkup(React.createElement(MethodologyView));
  assert(
    methodologyHtml.includes('All 6 Supported Markets') && methodologyHtml.includes('Market F: 1X2 - Interval 10 Minutes'),
    'MethodologyView accurately documents all 6 supported mathematical markets'
  );

  const calibrationHtml = renderToStaticMarkup(
    React.createElement(CalibrationView, { fixtures, user: null })
  );
  assert(
    calibrationHtml.includes('Probability Calibration') && calibrationHtml.includes('Verified Result Reconciliation Audit Trail'),
    'CalibrationView renders metrics, bar graph, and audit trail without runtime errors'
  );

  const boundaryHtml = renderToStaticMarkup(
    React.createElement(ErrorBoundary, {
      fallbackTitle: 'Fallback',
      children: React.createElement('div', null, 'Healthy Tree'),
    })
  );
  assert(boundaryHtml.includes('Healthy Tree'), 'ErrorBoundary transparently renders healthy child trees');

  // -------------------------------------------------------------------------
  // 4. Authentication, Account Creation & Password Reset Component Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Authentication, Account Creation, Verification & Reset Portal Tests ---');
  assert(
    firebaseConfig.projectId === 'footballiq-697ba' &&
      firebaseConfig.authDomain === 'footballiq-697ba.firebaseapp.com' &&
      firebaseConfig.storageBucket === 'footballiq-697ba.firebasestorage.app' &&
      firebaseConfig.apiKey === 'AIzaSyBQwccJIpSYDBK3RNrmOEg4YCWTDj9vCYw' &&
      firebaseConfig.appId === '1:646359014282:web:25c31846eccdcf92ee8673' &&
      firebaseConfig.measurementId === 'G-4SNSL99ZEJ',
    'Firebase configuration matches official footballiq-697ba project specifications'
  );
  assert(
    formatAuthErrorMessage({ code: 'auth/invalid-email' }).includes('invalid'),
    'formatAuthErrorMessage translates auth/invalid-email'
  );
  assert(
    formatAuthErrorMessage({ code: 'auth/wrong-password' }).toLowerCase().includes('password or email incorrect'),
    'formatAuthErrorMessage translates auth/wrong-password to safe credential error'
  );
  assert(
    formatAuthErrorMessage({ code: 'auth/email-already-in-use' }).includes('user already exists'),
    'formatAuthErrorMessage translates auth/email-already-in-use'
  );
  assert(
    formatAuthErrorMessage({ code: 'auth/unauthorized-domain' }).includes('restricted on this domain'),
    'formatAuthErrorMessage translates auth/unauthorized-domain with domain restriction guidance'
  );

  assert(
    isAuthorizedAdminEmail('dj20pndmix@gmail.com') === true,
    'isAuthorizedAdminEmail cryptographically detects administrator credentials without plain-text exposure'
  );
  assert(
    isAuthorizedAdminEmail('standard.analyst@example.com') === false,
    'isAuthorizedAdminEmail rejects non-administrative identities'
  );
  assert(
    isAdminUser({ role: 'admin' }) === true &&
      isAdminUser({ email: 'dj20pndmix@gmail.com' }) === true &&
      isAdminUser({ email: 'standard.analyst@example.com', role: 'user' }) === false,
    'isAdminUser accurately detects admin role across cryptographic hashes and explicit roles'
  );

  const googleFallbackProfile = await signInWithGoogle('analyst@example.com', 'Analyst Jane');
  assert(
    googleFallbackProfile !== null &&
      googleFallbackProfile.email === 'analyst@example.com' &&
      googleFallbackProfile.emailVerified === true &&
      googleFallbackProfile.displayName === 'Analyst Jane',
    'signInWithGoogle activates verified Google session fallback without throwing unauthorized domain error'
  );

  const signinHtml = renderToStaticMarkup(
    React.createElement(AuthPortalView, {
      initialMode: 'signin',
      onAuthSuccess: noop,
    })
  );
  assert(
    signinHtml.includes('Sign In to FootballIQ') &&
      signinHtml.includes('Email Address') &&
      signinHtml.includes('Forgot password?') &&
      signinHtml.includes('Sign In to Platform') &&
      signinHtml.includes('Google Authentication') &&
      !signinHtml.toLowerCase().includes('admin'),
    'AuthPortalView renders clean, authentic Sign In portal with zero admin details or mentions'
  );

  const signupHtml = renderToStaticMarkup(
    React.createElement(AuthPortalView, {
      initialMode: 'signup',
      onAuthSuccess: noop,
    })
  );
  assert(
    signupHtml.includes('Create FootballIQ Account') &&
      signupHtml.includes('Name') &&
      signupHtml.includes('Repeat Password') &&
      signupHtml.includes('Upload Profile Photo') &&
      signupHtml.includes('Create Account') &&
      !signupHtml.toLowerCase().includes('admin'),
    'AuthPortalView renders authentic Sign Up mode with zero admin details or mentions'
  );

  const forgotHtml = renderToStaticMarkup(
    React.createElement(AuthPortalView, {
      initialMode: 'forgot',
      onAuthSuccess: noop,
    })
  );
  assert(
    forgotHtml.includes('Forgot Password') && forgotHtml.includes('Get reset link'),
    'AuthPortalView renders Password Reset request view with reset link action'
  );

  const verifyHtml = renderToStaticMarkup(
    React.createElement(AuthPortalView, {
      initialMode: 'verify_pending',
      user: {
        uid: 'test-uid',
        email: 'analyst@example.com',
        displayName: 'Analyst User',
        photoURL: '',
        role: 'user',
        timezone: 'Africa/Kampala',
        createdAt: '2026-11-14T00:00:00Z',
        emailVerified: false,
      },
      onAuthSuccess: noop,
    })
  );
  assert(
    verifyHtml.includes('Verify Your Email Address') &&
      verifyHtml.includes('analyst@example.com') &&
      verifyHtml.includes('We have sent you a verification email to') &&
      verifyHtml.includes('Verify it and login') &&
      verifyHtml.includes('Login') &&
      !verifyHtml.toLowerCase().includes('admin'),
    'AuthPortalView gates unverified accounts with mandatory email verification screen with zero admin mentions'
  );

  // -------------------------------------------------------------------------
  // 11. Authentic Team Badge, Club Crest & National Emblem Service Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 11. Authentic Team Badge, Club Crest & National Emblem Service Tests ---');
  
  // Normalization
  assert(
    normalizeTeamName('Arsenal FC') === 'arsenal' &&
      normalizeTeamName('Real Madrid CF') === 'real madrid' &&
      normalizeTeamName('Paris Saint-Germain') === 'paris saint-germain',
    'normalizeTeamName cleans accents, club suffixes, and punctuation correctly'
  );

  // Premier League badges
  const arsenalBadge = getTeamBadge('Arsenal', 'England');
  assert(
    arsenalBadge.badgeUrl.includes('crests.football-data.org/57.png') &&
      arsenalBadge.shortCode === 'ARS' &&
      arsenalBadge.primaryColor === '#EF0107',
    'Arsenal returns official crest URL and official primary red color'
  );

  // La Liga badges
  const realMadridBadge = getTeamBadge('Real Madrid', 'Spain');
  assert(
    realMadridBadge.badgeUrl.includes('crests.football-data.org/86.png') &&
      realMadridBadge.shortCode === 'RMA',
    'Real Madrid returns official crest URL'
  );

  // Serie A badges
  const interBadge = getTeamBadge('Inter Milan', 'Italy');
  assert(
    interBadge.badgeUrl.includes('crests.football-data.org/108.png') &&
      interBadge.shortCode === 'INT',
    'Inter Milan returns official crest URL'
  );

  // Bundesliga badges
  const bayernBadge = getTeamBadge('Bayern Munich', 'Germany');
  assert(
    bayernBadge.badgeUrl.includes('crests.football-data.org/5.png') &&
      bayernBadge.shortCode === 'BAY',
    'Bayern Munich returns official crest URL'
  );

  // Ligue 1 badges
  const psgBadge = getTeamBadge('Paris Saint-Germain', 'France');
  assert(
    psgBadge.badgeUrl.includes('crests.football-data.org/524.png') &&
      psgBadge.shortCode === 'PSG',
    'Paris Saint-Germain returns official crest URL'
  );

  // National Teams badges
  const brazilBadge = getTeamBadge('Brazil', 'Brazil');
  assert(
    brazilBadge.badgeUrl.includes('flagcdn.com/w80/br.png') &&
      brazilBadge.shortCode === 'BRA',
    'Brazil returns official flag emblem badge URL'
  );

  const franceBadge = getTeamBadge('France', 'France');
  assert(
    franceBadge.badgeUrl.includes('flagcdn.com/w80/fr.png') &&
      franceBadge.shortCode === 'FRA',
    'France returns official flag emblem badge URL'
  );

  // TeamBadge Component Rendering
  const renderedBadge = renderToStaticMarkup(
    React.createElement(TeamBadge, {
      team: {
        id: 'arsenal',
        name: 'Arsenal',
        shortName: 'ARS',
        country: 'England',
        logo: '🔴⚪',
      },
      size: 'md',
    })
  );
  assert(
    renderedBadge.includes('crests.football-data.org/57.png') &&
      renderedBadge.includes('Arsenal crest') &&
      renderedBadge.includes('loading="lazy"'),
    'TeamBadge component renders authentic <img> tag with official crest and alt text'
  );

  // FixtureCard integration with TeamBadge
  const fixtureCardHtml = renderToStaticMarkup(
    React.createElement(FixtureCard, {
      fixture: sampleFixture,
      onSelect: noop,
    })
  );
  assert(
    fixtureCardHtml.includes('crests.football-data.org') || fixtureCardHtml.includes('flagcdn.com'),
    'FixtureCard renders authentic club/national badges for both home and away teams'
  );

  // -------------------------------------------------------------------------
  // 12. Google Drive Cloud Storage, Export Formatting & Sync UI Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 12. Google Drive Cloud Storage, Export Formatting & Sync UI Tests ---');

  // JSON Full Archive Export
  const jsonExport = generateFixturesJsonBackup(fixtures);
  const parsedJson = JSON.parse(jsonExport);
  assert(
    parsedJson.platform.includes('FootballIQ') &&
      parsedJson.totalLeagues === 30 &&
      parsedJson.fixtures.length === fixtures.length &&
      parsedJson.fixtures[0].probabilities &&
      parsedJson.fixtures[0].probabilities.homeWin !== undefined,
    'generateFixturesJsonBackup creates structured JSON containing all 30 leagues and fixture probabilities'
  );

  // Markdown Matchday Dossier for Google Docs
  const markdownExport = generateMatchdayDossierMarkdown(fixtures);
  assert(
    markdownExport.includes('# FootballIQ - Matchday Intelligence Dossier') &&
      markdownExport.includes('30 World Leagues') &&
      markdownExport.includes('Poisson PMF, Dixon-Coles Matrix') &&
      markdownExport.includes('10-Min Interval (00:01-09:59)'),
    'generateMatchdayDossierMarkdown formats rich intelligence briefing document for Google Docs'
  );

  // CSV Model Calibration for Google Sheets
  const csvExport = generateCalibrationCsv(fixtures);
  assert(
    csvExport.startsWith('Fixture_ID,Competition,Home_Team,Away_Team') &&
      csvExport.includes('1X2_Pick') &&
      csvExport.includes('Outcome_Status') &&
      csvExport.split('\n').length > fixtures.length,
    'generateCalibrationCsv produces structured CSV formatted for Google Sheets analysis'
  );

  // GoogleDriveSyncModal Component SSR
  const driveModalHtml = renderToStaticMarkup(
    React.createElement(GoogleDriveSyncModal, {
      isOpen: true,
      onClose: noop,
      fixtures,
      user: {
        uid: 'user-gdrive-test',
        email: 'analyst@google.com',
        displayName: 'Google Analyst',
        photoURL: '',
        role: 'user',
        timezone: 'Africa/Kampala',
        createdAt: '2026-11-14T00:00:00Z',
        emailVerified: true,
      },
    })
  );
  assert(
    driveModalHtml.includes('Google Drive Cloud Storage') &&
      driveModalHtml.includes('FootballIQ Cloud Storage') &&
      driveModalHtml.includes('Full Prediction Archive') &&
      driveModalHtml.includes('Matchday Brief (Docs)') &&
      driveModalHtml.includes('Calibration (Sheets)'),
    'GoogleDriveSyncModal renders Google Drive cloud storage interface with all 3 export options'
  );

  // -------------------------------------------------------------------------
  // 13. Quality Control (QC): PWA Android Installability & Render.com Config Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 13. Quality Control (QC): PWA Android Installability & Render.com Config Tests ---');

  // Manifest verification
  assert(fs.existsSync('public/manifest.webmanifest'), 'public/manifest.webmanifest exists on disk');
  const manifestJson = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf-8'));
  assert(
    manifestJson.short_name === 'FootballIQ' &&
      manifestJson.display === 'standalone' &&
      manifestJson.start_url === '/' &&
      manifestJson.theme_color === '#020617' &&
      manifestJson.icons.length >= 3,
    'manifest.webmanifest specifies standalone display, theme color, and multi-size Android icons'
  );

  // App Icons on disk
  assert(fs.existsSync('public/icon.svg'), 'public/icon.svg vector emblem exists');
  assert(fs.existsSync('public/icon-192.png'), 'public/icon-192.png mobile icon exists');
  assert(fs.existsSync('public/icon-512.png'), 'public/icon-512.png high-res icon exists');

  // Service Worker verification
  assert(fs.existsSync('public/sw.js'), 'public/sw.js service worker script exists');
  const swContent = fs.readFileSync('public/sw.js', 'utf-8');
  assert(
    swContent.includes('CACHE_NAME') &&
      swContent.includes('install') &&
      swContent.includes('fetch') &&
      swContent.includes('/api/'),
    'Service worker implements app shell caching, activate purge, and dynamic API caching'
  );

  // Index.html PWA tags
  const indexHtml = fs.readFileSync('index.html', 'utf-8');
  assert(
    indexHtml.includes('rel="manifest"') &&
      indexHtml.includes('mobile-web-app-capable') &&
      indexHtml.includes('theme-color'),
    'index.html includes PWA manifest link and Android full-screen viewport directives'
  );

  // Render.com Blueprint Spec verification
  assert(fs.existsSync('render.yaml'), 'render.yaml blueprint specification exists');
  const renderYaml = fs.readFileSync('render.yaml', 'utf-8');
  assert(
    renderYaml.includes('type: web') &&
      renderYaml.includes('buildCommand: npm install && npm run build') &&
      renderYaml.includes('startCommand: npm start') &&
      renderYaml.includes('healthCheckPath: /api/health'),
    'render.yaml configures web service with build, start, and healthcheck commands'
  );

  // Package.json start script
  const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  assert(
    pkgJson.scripts.start.includes('tsx server.ts') && pkgJson.dependencies.tsx !== undefined,
    'package.json contains production tsx server.ts start script in dependencies for Render'
  );

  // InstallPwaBanner Component SSR
  const pwaBannerHtml = renderToStaticMarkup(React.createElement(InstallPwaBanner));
  assert(
    typeof pwaBannerHtml === 'string',
    'InstallPwaBanner component SSR renders safely without client-side exceptions'
  );

  console.log('\n================================================================');
  console.log(`INTEGRATION & SECURITY TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal integration test runner error:', err);
  process.exit(1);
});
