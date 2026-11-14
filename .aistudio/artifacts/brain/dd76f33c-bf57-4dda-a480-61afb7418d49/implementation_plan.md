# FootballIQ Bar Graph & Workspace Navigation Overhaul

A focused UX and data-visualization upgrade replacing the pie chart with an interactive separate-column **Won / Lost / Pending** vertical bar graph and reorganizing FootballIQ around a collapsible left sidebar, slim top bar, compact filter toolbar, and clean 2-column match layout.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The architecture and layout below reflect all choices confirmed during design clarification. Review and click **Proceed** to begin implementation.

- **Confirmed Decision 1 (Chart Replacement)**: Remove the pie/donut chart across both the main dashboard and Calibration workspace, replacing it with an interactive **Bar Graph**.
- **Confirmed Decision 2 (Bar Layout)**: Render **separate vertical columns** for **Won (Accurate)**, **Lost (Missed)**, and **Pending (In-Play / Upcoming)** predictions, with an interactive view mode to inspect overall totals or market-by-market columns (`1X2`, `BTTS`, `O/U 2.5`, `Double Chance`, `HT/FT`).
- **Confirmed Decision 3 (Navigation Shell)**: Replace the multi-item top header bar with a **clean collapsible left sidebar** (`240px` expanded / `68px` collapsed on desktop, slide-out drawer on mobile) paired with a **slim top bar** containing contextual page breadcrumbs, timezone/odds display controls, and account sign-in.
- **Confirmed Decision 4 (Main Predictions Layout)**: Streamline the Predictions workspace into a **compact single-row filter bar** above a **clean 2-column match card grid**, eliminating vertical clutter and stacked badge sandwiches.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Interactive Performance Bar Graph**: Visualizes settled prediction wins, settled prediction losses, and active/upcoming pending picks as distinct vertical columns with exact numeric labels, percentage share of total, and an honest **Settled Accuracy** calculation (`Won / (Won + Lost)`) that excludes pending matches.
  2. **Organized Workspace Navigation**: Groups all capabilities cleanly inside a collapsible sidebar under logical sections—**Matchday** (`Predictions`, `Live & Search Sync`), **AI Intelligence** (`Tactical Scout`, `AI Analyst Chat`, `Veo Match Studio`), and **Analytics & System** (`Calibration & Graphs`, `Methodology`, `Admin Console` when authorized)—keeping the slim top bar dedicated to location context and user preferences.
  3. **Streamlined 2-Column Match Workspace**: Consolidates search, league selection, status filtering, and prediction market switching (`1X2`, `1X2 10-Minute Interval`, `BTTS`, `O/U 2.5`, `Double Chance`, `HT/FT`) into a compact control bar directly above spacious 2-column fixture cards.
- **Target Audience**: Quantitative football analysts, matchday researchers, and platform administrators evaluating fixture probabilities across Africa/Kampala (`EAT`, UTC+3) and international timezones.
- **Key Value**: Cuts visual clutter, prevents horizontal top-nav crowding, makes every tool reachable in one click, and lets users verify model performance at a glance with clear vertical comparison columns.

---

## 2. User Experience & Visual Design

### Layout Architecture

```text
┌───────────────────┬──────────────────────────────────────────────────────┐
│ COLLAPSIBLE       │ SLIM TOP BAR (56px)                                  │
│ LEFT SIDEBAR      │ [≡] Breadcrumb: FootballIQ / Predictions             │
│ (240px / 68px)    │ Right: [Africa/Kampala] [% / Dec] [Account]          │
│                   ├──────────────────────────────────────────────────────┤
│ MATCHDAY          │ MAIN CONTENT VIEWPORT (Max 1280px centered)          │
│  • Predictions    │                                                      │
│                   │ ┌──────────────────────────────────────────────────┐ │
│ AI INTELLIGENCE   │ │ Matchday Header + Live Search Sync CTA           │ │
│  • Tactical Scout │ └──────────────────────────────────────────────────┘ │
│  • Analyst Chat   │ ┌──────────────────────────────────────────────────┐ │
│  • Veo Studio     │ │ PERFORMANCE BAR GRAPH (Won | Lost | Pending)     │ │
│                   │ │ Interactive columns + Market scope switcher      │ │
│ ANALYTICS         │ └──────────────────────────────────────────────────┘ │
│  • Calibration    │ ┌──────────────────────────────────────────────────┐ │
│  • Methodology    │ │ COMPACT FILTER & MARKET TOOLBAR                  │ │
│  • Admin (Auth)   │ │ [Search] [League ▾] [Status] | [1X2|10m|BTTS...] │ │
│                   │ └──────────────────────────────────────────────────┘ │
│ [« Collapse]      │ ┌────────────────────────┐ ┌───────────────────────┐ │
│ [Disclaimer Note] │ │ Match Card 1 (Clean)   │ │ Match Card 2 (Clean)  │ │
│                   │ └────────────────────────┘ └───────────────────────┘ │
└───────────────────┴──────────────────────────────────────────────────────┘
```

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian Quantitative Sports Terminal—crisp dark surfaces, clear typographic hierarchy, disciplined restraint, and functional interactive controls.
- **Color Palette (60-30-10 Discipline)**:
  - *Canvas (60%)*: Deep slate background (`#020617`) for uninterrupted focus.
  - *Structural Surfaces (30%)*: Flat elevated dark panels (`#0F172A`) bounded by subtle 1px hairline borders (`#1E293B`), avoiding nested card-within-card shadows.
  - *Semantic Accents (10%)*: Emerald (`#10B981`) for **Won** columns, picked outcomes, and primary actions; Rose (`#F43F5E`) for **Lost** columns and live indicators; Amber (`#F59E0B`) for **Pending** columns and the 10-minute early interval market. Every state color is always paired with an explicit text label and count.
- **Typography & Tabular Numerals**:
  - *Display & UI*: `Plus Jakarta Sans` for crisp headings, sidebar labels, and match titles with balanced headline wrapping (`text-wrap: balance`).
  - *Quantitative Telemetry*: `JetBrains Mono` with `tabular-nums` on all probabilities, bar column counts, kickoff times, Brier scores, and Log Loss metrics so numbers align cleanly across columns and tables.
- **Anti-Clutter Cleanup**:
  - Replace stacked pill badge clusters on headers and cards with clean unboxed inline metadata separated by middots (`UEFA Nations League · Braga · 22:45 EAT`).
  - Replace static disclaimer banner noise at the top of every screen with a concise, single-line analytical notice anchored cleanly in the workspace footer and methodology view.
- **Interactive Feedback & Motion**:
  - Smooth `180ms` transitions for sidebar collapse/expand, bar column hover highlights, and click-to-filter pick drilldowns.
  - Dedicated empty, loading, and error states for Live Search Sync, Scout Grounding, Multi-Turn Chat, and Chart filters.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Separate Vertical Columns Bar Graph (SVG)**
  - *Chosen Approach*: Build a responsive custom SVG vertical column bar graph displaying three distinct vertical columns (**Won**, **Lost**, **Pending**) with a mode switch to compare **Summary Columns** against **Per-Market Grouped Vertical Columns** (`1X2`, `BTTS`, `O/U 2.5`, `Double Chance`, `HT/FT`).
  - *Why*: Separate vertical bars make small differences between Won, Lost, and Pending immediately measurable by height without angle estimation errors, while avoiding React 19 peer-dependency conflicts from third-party chart wrappers.
  - *Alternatives Considered*: Retaining a pie/donut toggle or using horizontal stacked bars alone; declined per user preference for clearer vertical column comparison.

- **Decision 2: Collapsible Left Sidebar + Slim Contextual Top Bar**
  - *Chosen Approach*: Consolidate navigation into a left sidebar grouped into three clear functional domains (`Matchday`, `AI Intelligence`, `Analytics`), collapsible to an icon rail on desktop and sliding drawer on mobile, paired with a single-row slim top bar (`56px`).
  - *Why*: Eliminates crowded top-bar wrapping when switching between Predictions, AI Search Scout, Multi-Turn Gemini Chat, Veo Studio, Calibration, and Admin Console, while keeping timezone and probability/odds toggles persistently one click away.
  - *Alternatives Considered*: Two-row top header or bottom-only tab dock; declined because top-row wrapping hurts desktop scanability and bottom docks hide desktop discoverability.

- **Decision 3: Compact Single-Toolbar Filter Bar + 2-Column Match Grid**
  - *Chosen Approach*: Merge search input, competition selector, status filter (`All`, `Live`, `Upcoming`, `Settled`), and active prediction market selector into one organized filter bar above a 2-column match grid (`xl:grid-cols-2`).
  - *Why*: A 2-column card width gives team names, recent form indicators, 10-minute interval probabilities, and action triggers generous horizontal breathing room without truncation or cramped 3-column wrapping.
  - *Alternatives Considered*: Retaining the 3-column grid with stacked filter boxes; declined due to high vertical scroll overhead before reaching the first match.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Component & State Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ App Root State                                                          │
│  • activeTab · sidebarCollapsed · mobileMenuOpen                        │
│  • fixtures[] (auto-settled on FT) · activeMarket · filters             │
│  • timezone (Africa/Kampala) · oddsFormat · Firebase user               │
└───────────────┬─────────────────────────────┬───────────────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────┐
│ Workspace Shell               │ │ Active Workspace View                 │
│  ├─ Collapsible Sidebar       │ │  ├─ Predictions View                  │
│  │   (Grouped Nav + Collapse) │ │  │   ├─ Compact Bar Graph Card        │
│  └─ Slim Top Bar              │ │  │   ├─ Unified Filter & Market Bar   │
│      (Breadcrumb + Tz + Auth) │ │  │   └─ 2-Column Clean Match Grid     │
└───────────────────────────────┘ │  ├─ Calibration & Graphs View         │
                                  │  │   ├─ KPI Strip + Firestore Sync    │
                                  │  │   ├─ Interactive Vertical Bar Graph│
                                  │  │   └─ SVG Reliability Curve + Audit │
                                  │  └─ AI Analyst Chat / Scout / Veo     │
                                  └───────────────────────────────────────┘
```

### Data Model & Interactive State Mapping

- **Bar Graph Metrics Calculation**:
  - `computeOutcomeDistribution(fixtures, marketFilter)` aggregates verified settled market outcomes (`WON`, `LOST`) alongside active/scheduled picks (`PENDING`) and voided fixtures (`VOID`), computing both total slate shares and `Settled Accuracy = Won / (Won + Lost)`.
  - Selecting a market filter (`All 5 Markets`, `1X2`, `BTTS`, `O/U 2.5`, `Double Chance`, `HT/FT`) updates column heights, exact counts, and the drill-down pick table synchronously.
  - Clicking any vertical bar (`Won`, `Lost`, or `Pending`) toggles a filtered pick list showing exact fixtures, predicted picks, model probabilities, and verified final scores.
- **Navigation & Workspace Persistence**:
  - Sidebar collapse state persists cleanly in browser `localStorage` so the user's preferred workspace density is remembered across sessions.
  - Selecting **Ask AI** or **Scout Intel** on any match card transitions smoothly into the corresponding sidebar section with the match pre-attached and updates the top bar breadcrumb trail.
- **Firebase & API Integration Integrity**:
  - Preserves all existing Firebase Auth, Firestore rules (`/users`, `/chat_sessions`, `/predictions`, `/video_generations`), `Live Search Sync` (`gemini-4-hydrogen`), and multi-turn `Gemini Chat` integrations without altering backend data contracts.
