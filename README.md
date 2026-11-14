# FootballIQ - Predictive Football Intelligence Platform

A modern, secure, full-stack quantitative football analytics and prediction platform powered by Bivariate Poisson and Dixon-Coles goal intensity models, Google Search Grounding for live squad intelligence, Veo 3.1 cinematic match animations, and Firebase Firestore authentication & data persistence.

---

## 1. Supported Prediction Markets

All markets are computed using explicit joint probability matrices rather than hardcoded heuristics:
1. **1X2 (Match Winner)**: Home win, Draw, Away win ($P_{Home} + P_{Draw} + P_{Away} = 1.0$). The highest probability outcome is strictly picked.
2. **BTTS (Both Teams To Score)**: Yes vs No derived from bivariate score distribution ($P_{Yes} + P_{No} = 1.0$).
3. **Over / Under 2.5 Total Goals**: Over (3+ goals) vs Under (0, 1, 2 goals) ($P_{Over} + P_{Under} = 1.0$).
4. **HT/FT (Half-Time / Full-Time)**: All 9 exhaustive combinations (HH, HD, HA, DH, DD, DA, AH, AD, AA) derived via independent time-slice bivariate Poisson modeling (sum to 1.0).
5. **Double Chance**: Calculated directly from 1X2:
   - $1X = P_{Home} + P_{Draw}$
   - $X2 = P_{Draw} + P_{Away}$
   - $12 = P_{Home} + P_{Away}$
6. **1X2 - Interval 10 Minutes (00:01 - 09:59)**: Opening 10-minute leader probability via non-uniform early-tempo Poisson time slicing.

---

## 2. Key Features

- **Mathematical Engine**: Exact Poisson PMF ($P(k; \lambda) = \frac{\lambda^k e^{-\lambda}}{k!}$) with Dixon-Coles low-score tau adjustment ($\tau$) for $(0,0), (1,0), (0,1), (1,1)$ scorelines.
- **Google Search Grounding**: Powered by `gemini-4-hydrogen` with `{ googleSearch: {} }` for real-time squad news, live matchday schedule/score verification (`/api/gemini/sync-fixtures`), confirmed injury bulletins, player suspensions, and live web source citations.
- **Multi-Turn Gemini Analyst Chatbot**: Context-aware conversational intelligence routing across `gemini-4-hydrogen` (live grounded search), `gemini-4-carbon` (deep quantitative reasoning), `gemini-4-argon` (complex interactive scenarios), and `gemini-3.1-flash-lite` (fast match briefings), with Firestore persistence.
- **Veo Cinematic Match Studio**: Generates animated broadcast-quality match motion reels from uploaded photos using `veo-3.1-fast-generate-preview` in `16:9` (landscape) or `9:16` (portrait).
- **Timezone Architecture**: All timestamps stored in ISO-8601 UTC; localized to **Africa/Kampala** (EAT, UTC+3) by default.
- **Firebase Auth & Firestore**: Google Sign-In with Attribute-Based Access Control (ABAC) and 8-pillar hardened security rules. Root administrator: `dj20pndmix@gmail.com`.
- **SportMonks Football API v3 Gateway**: Resilient provider adapter with connection testing, token masking, exponential backoff, and graceful fallback to verified datasets when tokens are absent.
- **Calibration & Historical Evaluation**: Rigorous tracking of multi-class Log Loss, Brier scores, hit rates by competition, and reliability diagrams.
- **Zero Temporal Leakage**: Pre-kickoff feature freeze ensures no post-match event or future result ever enters model inputs.

---

## 3. Getting Started

### Prerequisites
- Node.js >= 18
- npm or yarn

### Installation
```bash
npm install
```

### Environment Variables
Copy `.env.example` to `.env` and configure:
```env
# Gemini API Key (automatically injected in Google AI Studio)
GEMINI_API_KEY="your-api-key"

# SportMonks Football API v3 Token (Optional)
SPORTMONKS_API_TOKEN=""
SPORTMONKS_BASE_URL="https://api.sportmonks.com/v3/football"

# Application Settings
DEFAULT_TIMEZONE="Africa/Kampala"
LOG_LEVEL="INFO"
```

### Running the Application
Development server (full-stack with Vite & Express):
```bash
npm run dev
```

Build for production:
```bash
npm run build
npm start
```

Run Quantitative Test Suite:
```bash
npm test
```

---

## 4. Test Verification Summary

The platform includes automated mathematical and statistical tests covering:
- Poisson PMF analytical convergence
- 7x7 score matrix normalization ($\sum P = 1.0$)
- 1X2, BTTS, O/U 2.5 sum-to-one constraints
- Double Chance mathematical coherence ($1X = H + D$)
- HT/FT 9-way combination exhaustiveness
- Africa/Kampala UTC+3 timezone localization
- Brier Score and Log Loss calculation validity

---

## 5. Security & Transparency Disclaimer
FootballIQ is a quantitative analytics and probabilistic research platform. No sporting outcome is ever guaranteed. The platform abstains when data coverage is insufficient rather than fabricating synthetic probabilities.
