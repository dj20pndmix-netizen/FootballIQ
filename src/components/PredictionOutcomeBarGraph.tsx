import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { Fixture } from '../types/football';
import {
  computeOutcomeDistribution,
  OutcomeDistributionMarketKey,
} from '../services/calibration';

interface PredictionOutcomeBarGraphProps {
  fixtures: Fixture[];
  compact?: boolean;
  onNavigateToFullCalibration?: () => void;
}

type OutcomeBucket = 'WON' | 'LOST' | 'PENDING';

interface VerticalColumnData {
  key: OutcomeBucket;
  label: string;
  shortLabel: string;
  count: number;
  pct: number;
  fill: string;
  textClass: string;
  surfaceClass: string;
}

const MARKET_FILTERS: { id: OutcomeDistributionMarketKey; label: string }[] = [
  { id: 'ALL', label: 'All 5 Settled Markets' },
  { id: '1X2', label: '1X2' },
  { id: 'BTTS', label: 'BTTS' },
  { id: 'OVER_UNDER_25', label: 'O/U 2.5' },
  { id: 'DOUBLE_CHANCE', label: 'Double Chance' },
  { id: 'HT_FT', label: 'HT/FT' },
];

const MARKET_GROUP_ROWS: {
  key: Exclude<OutcomeDistributionMarketKey, 'ALL'>;
  shortName: string;
  fullName: string;
}[] = [
  { key: '1X2', shortName: '1X2', fullName: '1X2 Match Winner' },
  { key: 'BTTS', shortName: 'BTTS', fullName: 'Both Teams To Score' },
  { key: 'OVER_UNDER_25', shortName: 'O/U 2.5', fullName: 'Over / Under 2.5' },
  { key: 'DOUBLE_CHANCE', shortName: 'DC', fullName: 'Double Chance' },
  { key: 'HT_FT', shortName: 'HT/FT', fullName: 'HT / FT 9-Way' },
];

export const PredictionOutcomeBarGraph: React.FC<PredictionOutcomeBarGraphProps> = ({
  fixtures,
  compact = false,
  onNavigateToFullCalibration,
}) => {
  const [selectedMarket, setSelectedMarket] = useState<OutcomeDistributionMarketKey>('ALL');
  const [graphMode, setGraphMode] = useState<'SUMMARY' | 'BY_MARKET'>('SUMMARY');
  const [activeBucket, setActiveBucket] = useState<OutcomeBucket | null>(null);

  const stats = useMemo(
    () => computeOutcomeDistribution(fixtures, selectedMarket),
    [fixtures, selectedMarket]
  );

  const totalPicks = Math.max(1, stats.won + stats.lost + stats.pending);
  const maxSummaryCount = Math.max(1, stats.won, stats.lost, stats.pending);

  const columns: VerticalColumnData[] = [
    {
      key: 'WON',
      label: 'Won (Accurate)',
      shortLabel: 'Won',
      count: stats.won,
      pct: Number(((stats.won / totalPicks) * 100).toFixed(1)),
      fill: '#10b981',
      textClass: 'text-emerald-400',
      surfaceClass: 'bg-emerald-950/50 border-emerald-700/70',
    },
    {
      key: 'LOST',
      label: 'Lost (Missed)',
      shortLabel: 'Lost',
      count: stats.lost,
      pct: Number(((stats.lost / totalPicks) * 100).toFixed(1)),
      fill: '#f43f5e',
      textClass: 'text-rose-400',
      surfaceClass: 'bg-rose-950/50 border-rose-700/70',
    },
    {
      key: 'PENDING',
      label: 'Pending (In-Play / Upcoming)',
      shortLabel: 'Pending',
      count: stats.pending,
      pct: Number(((stats.pending / totalPicks) * 100).toFixed(1)),
      fill: '#f59e0b',
      textClass: 'text-amber-400',
      surfaceClass: 'bg-amber-950/50 border-amber-700/70',
    },
  ];

  const filteredItems = useMemo(() => {
    const base = activeBucket
      ? stats.items.filter((it) => it.outcome === activeBucket)
      : stats.items;
    return base.slice(0, compact ? 4 : 12);
  }, [stats.items, activeBucket, compact]);

  // SVG Layout metrics for Summary Separate Vertical Columns
  const summarySvgW = 460;
  const summarySvgH = compact ? 185 : 230;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 26;
  const padBottom = 36;
  const plotH = summarySvgH - padTop - padBottom;
  const plotW = summarySvgW - padLeft - padRight;

  // Max value for grouped market vertical bars
  const maxMarketGroupVal = useMemo(() => {
    let m = 1;
    for (const row of MARKET_GROUP_ROWS) {
      const b = stats.byMarket[row.key];
      m = Math.max(m, b.won, b.lost, b.pending);
    }
    return m;
  }, [stats.byMarket]);

  return (
    <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Prediction Performance · Won, Lost &amp; Pending Bar Graph
            </h3>
          </div>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            Settled Accuracy:{' '}
            <span className="text-emerald-400 font-bold">{stats.settledAccuracyPct}%</span>{' '}
            ({stats.won} won / {stats.settledTotal} settled) ·{' '}
            <span className="text-rose-400">{stats.lost} lost</span> ·{' '}
            <span className="text-amber-400">{stats.pending} pending</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Graph View Toggle: Summary Columns vs Per-Market Columns */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setGraphMode('SUMMARY')}
              className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                graphMode === 'SUMMARY'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Summary Columns
            </button>
            <button
              onClick={() => setGraphMode('BY_MARKET')}
              className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                graphMode === 'BY_MARKET'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              By Market
            </button>
          </div>

          {onNavigateToFullCalibration && (
            <button
              onClick={onNavigateToFullCalibration}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <span>Full Calibration</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Market Scope Selector (only applies to Summary Columns or highlights market) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {MARKET_FILTERS.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setSelectedMarket(m.id);
              if (m.id !== 'ALL' && graphMode === 'BY_MARKET') {
                setGraphMode('SUMMARY');
              }
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
              selectedMarket === m.id
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Main Bar Graph Viewport + Interactive Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left/Main: Vertical Column SVG Bar Graph */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-950 border border-slate-800 rounded-xl p-4">
          {graphMode === 'SUMMARY' ? (
            <svg
              viewBox={`0 0 ${summarySvgW} ${summarySvgH}`}
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="Separate vertical bar graph of Won, Lost, and Pending predictions"
            >
              {/* Horizontal Y-Axis Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = padTop + plotH * (1 - t);
                const tickVal = Math.round(maxSummaryCount * t);
                return (
                  <g key={t}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={summarySvgW - padRight}
                      y2={y}
                      stroke={t === 0 ? '#334155' : '#1e293b'}
                      strokeWidth={1}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                      fill="#64748b"
                    >
                      {tickVal}
                    </text>
                  </g>
                );
              })}

              {/* 3 Separate Vertical Columns: WON | LOST | PENDING */}
              {columns.map((col, idx) => {
                const slotW = plotW / 3;
                const barW = Math.min(72, slotW * 0.54);
                const cx = padLeft + slotW * idx + slotW / 2;
                const x = cx - barW / 2;
                const ratio = maxSummaryCount > 0 ? col.count / maxSummaryCount : 0;
                const rawH = Math.max(col.count > 0 ? 6 : 2, plotH * ratio);
                const y = padTop + plotH - rawH;
                const isSelected = activeBucket === col.key;
                const isDimmed = activeBucket !== null && !isSelected;

                return (
                  <g
                    key={col.key}
                    className="cursor-pointer transition-opacity duration-150"
                    style={{ opacity: isDimmed ? 0.35 : 1 }}
                    onMouseEnter={() => setActiveBucket(col.key)}
                    onMouseLeave={() => setActiveBucket(null)}
                    onClick={() =>
                      setActiveBucket((prev) => (prev === col.key ? null : col.key))
                    }
                  >
                    {/* Subtle column background track */}
                    <rect
                      x={x}
                      y={padTop}
                      width={barW}
                      height={plotH}
                      rx={6}
                      fill="#0f172a"
                      opacity={0.55}
                    />

                    {/* Actual Vertical Bar */}
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={rawH}
                      rx={6}
                      fill={col.fill}
                      stroke={isSelected ? '#ffffff' : 'none'}
                      strokeWidth={isSelected ? 1.5 : 0}
                    >
                      <title>{`${col.label}: ${col.count} picks (${col.pct}%)`}</title>
                    </rect>

                    {/* Value + Percentage Label above Column */}
                    <text
                      x={cx}
                      y={y - 8}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                      fill="#f8fafc"
                    >
                      {col.count} ({col.pct}%)
                    </text>

                    {/* X-Axis Label */}
                    <text
                      x={cx}
                      y={summarySvgH - 12}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill="#cbd5e1"
                    >
                      {col.shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            /* BY_MARKET: Grouped Separate Vertical Bars (Won | Lost | Pending) for all 5 markets */
            <svg
              viewBox={`0 0 ${summarySvgW} ${summarySvgH}`}
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="Vertical bar graph comparing Won, Lost, and Pending picks per market"
            >
              {[0, 0.5, 1].map((t) => {
                const y = padTop + plotH * (1 - t);
                const tickVal = Math.round(maxMarketGroupVal * t);
                return (
                  <g key={t}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={summarySvgW - padRight}
                      y2={y}
                      stroke={t === 0 ? '#334155' : '#1e293b'}
                      strokeWidth={1}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                      fill="#64748b"
                    >
                      {tickVal}
                    </text>
                  </g>
                );
              })}

              {MARKET_GROUP_ROWS.map((row, groupIdx) => {
                const m = stats.byMarket[row.key];
                const groupW = plotW / MARKET_GROUP_ROWS.length;
                const groupStart = padLeft + groupW * groupIdx;
                const groupCenter = groupStart + groupW / 2;
                const barW = 14;
                const gap = 4;
                const totalBarsW = barW * 3 + gap * 2;
                const startX = groupCenter - totalBarsW / 2;

                const bars: { key: OutcomeBucket; val: number; fill: string }[] = [
                  { key: 'WON', val: m.won, fill: '#10b981' },
                  { key: 'LOST', val: m.lost, fill: '#f43f5e' },
                  { key: 'PENDING', val: m.pending, fill: '#f59e0b' },
                ];

                return (
                  <g key={row.key}>
                    {bars.map((bar, bIdx) => {
                      const bx = startX + bIdx * (barW + gap);
                      const ratio = maxMarketGroupVal > 0 ? bar.val / maxMarketGroupVal : 0;
                      const bh = Math.max(bar.val > 0 ? 4 : 2, plotH * ratio);
                      const by = padTop + plotH - bh;
                      return (
                        <g key={bar.key}>
                          <rect
                            x={bx}
                            y={by}
                            width={barW}
                            height={bh}
                            rx={3}
                            fill={bar.fill}
                          >
                            <title>{`${row.fullName} · ${bar.key}: ${bar.val}`}</title>
                          </rect>
                          {bar.val > 0 && (
                            <text
                              x={bx + barW / 2}
                              y={by - 5}
                              textAnchor="middle"
                              fontSize="9"
                              fontFamily="JetBrains Mono, monospace"
                              fill="#cbd5e1"
                            >
                              {bar.val}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    <text
                      x={groupCenter}
                      y={summarySvgH - 18}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#e2e8f0"
                    >
                      {row.shortName}
                    </text>
                    <text
                      x={groupCenter}
                      y={summarySvgH - 5}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                      fill="#10b981"
                    >
                      {m.settledTotal > 0 ? `${m.accuracyPct}% acc` : '0 settled'}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Legend Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                Won
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                Lost
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                Pending
              </span>
            </div>
            <span className="font-mono tabular-nums text-slate-500">
              Click any column to filter picks
            </span>
          </div>
        </div>

        {/* Right: Numeric Outcome Cards & Interactive Pick Drilldown */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* 3 Clean Numeric KPI Boxes */}
          <div className="grid grid-cols-3 gap-2.5">
            {columns.map((col) => {
              const Icon =
                col.key === 'WON' ? CheckCircle2 : col.key === 'LOST' ? XCircle : Clock;
              const isSelected = activeBucket === col.key;
              return (
                <button
                  key={col.key}
                  onClick={() =>
                    setActiveBucket((prev) => (prev === col.key ? null : col.key))
                  }
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    isSelected
                      ? col.surfaceClass
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className={`w-3.5 h-3.5 ${col.textClass}`} />
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {col.pct}%
                    </span>
                  </div>
                  <div className={`text-xl font-bold font-mono tabular-nums mt-1.5 ${col.textClass}`}>
                    {col.count}
                  </div>
                  <div className="text-[11px] font-medium text-slate-300">
                    {col.shortLabel}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Interactive Pick List */}
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                {activeBucket ? `${activeBucket} Predictions` : 'Settled & Pending Picks'}
              </span>
              {activeBucket && (
                <button
                  onClick={() => setActiveBucket(null)}
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            {filteredItems.length > 0 ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {filteredItems.map((item, idx) => (
                  <div
                    key={`${item.fixtureId}-${item.market}-${idx}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800/70 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-200 truncate">
                        {item.matchLabel}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums truncate">
                        {item.market} · Pick {item.predictedPick} ({Math.round(item.probability * 100)}%) · {item.actualResult}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-mono font-bold ${
                        item.outcome === 'WON'
                          ? 'text-emerald-400'
                          : item.outcome === 'LOST'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {item.outcome}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                No {activeBucket?.toLowerCase()} picks in this market scope.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
