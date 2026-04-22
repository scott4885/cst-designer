"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ProviderMix,
  CategoryEntry,
  BlockCategory,
  calculateProductionMix,
  compareToIndustryBenchmark,
  DOCTOR_BENCHMARKS,
  HYGIENIST_BENCHMARKS,
} from "@/lib/engine/production-mix";
import type { GenerationResult, BlockTypeInput, ProviderInput } from "@/lib/engine/types";

// ─── Color palette matching block type colors ────────────────────────────────

const CATEGORY_COLORS: Record<BlockCategory, string> = {
  HP:           "#6366f1", // indigo
  NP:           "#22c55e", // green
  SRP:          "#f59e0b", // amber
  ER:           "#ef4444", // red
  MP:           "#3b82f6", // blue
  RECARE:       "#06b6d4", // cyan
  PM:           "#a855f7", // purple
  NON_PROD:     "#94a3b8", // slate
  ASSISTED_HYG: "#8b5cf6", // purple
  OTHER:        "#64748b", // gray
};

// ─── SVG Donut chart ─────────────────────────────────────────────────────────

interface DonutSegment {
  category: BlockCategory;
  percentage: number;
  displayLabel: string;
  amount: number;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  centerLabel?: string;
  centerSublabel?: string;
}

function DonutChart({
  segments,
  size = 180,
  centerLabel,
  centerSublabel,
}: DonutChartProps) {
  const [hovered, setHovered] = useState<BlockCategory | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.25;

  // Filter out 0% segments
  const activeSegments = segments.filter((s) => s.percentage > 0);
  const total = activeSegments.reduce((s, seg) => s + seg.percentage, 0);

  if (activeSegments.length === 0) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-muted-foreground text-sm"
      >
        No data
      </div>
    );
  }

  // Precompute cumulative angles so we don't reassign a let during render
  const angleBounds: { startAngle: number; endAngle: number }[] = [];
  activeSegments.reduce((acc, seg) => {
    const sliceDeg = (seg.percentage / total) * 360;
    const endAngle = acc + sliceDeg;
    angleBounds.push({ startAngle: acc, endAngle });
    return endAngle;
  }, 0);

  const paths = activeSegments.map((seg, i) => {
    const { startAngle, endAngle } = angleBounds[i];
    const isHovered = hovered === seg.category;
    const rOuter = isHovered ? outerR + 4 : outerR;

    return (
      <path
        key={seg.category}
        d={describeArc(cx, cy, rOuter, innerR, startAngle, endAngle)}
        fill={CATEGORY_COLORS[seg.category]}
        stroke="white"
        strokeWidth={1.5}
        opacity={hovered && !isHovered ? 0.45 : 1}
        style={{ transition: "all 0.15s ease", cursor: "pointer" }}
        onMouseEnter={() => setHovered(seg.category)}
        onMouseLeave={() => setHovered(null)}
      >
        <title>{`${seg.displayLabel}: ${seg.percentage.toFixed(1)}%`}</title>
      </path>
    );
  });

  const hoveredSeg = hovered ? activeSegments.find((s) => s.category === hovered) : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      {/* Center text */}
      {hoveredSeg ? (
        <>
          <text
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={13}
            fontWeight="bold"
            fill="currentColor"
          >
            {hoveredSeg.percentage.toFixed(1)}%
          </text>
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill="#64748b"
          >
            {hoveredSeg.displayLabel.length > 14
              ? hoveredSeg.displayLabel.slice(0, 12) + "…"
              : hoveredSeg.displayLabel}
          </text>
        </>
      ) : (
        <>
          {centerLabel && (
            <text
              x={cx}
              y={cy - 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fontWeight="bold"
              fill="currentColor"
            >
              {centerLabel}
            </text>
          )}
          {centerSublabel && (
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fill="#64748b"
            >
              {centerSublabel}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

// ─── Benchmark bar ────────────────────────────────────────────────────────────

interface BenchmarkBarProps {
  label: string;
  actual: number;
  min: number;
  max: number;
  color: string;
}

function BenchmarkBar({ label, actual, min, max, color }: BenchmarkBarProps) {
  const isUnder = actual < min;
  const isOver = actual > max;
  const status = isUnder ? "under" : isOver ? "over" : "ok";

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">
            {min}–{max}%
          </span>
          <span
            className="font-semibold"
            style={{ color: isUnder || isOver ? "#ef4444" : "#22c55e" }}
          >
            {actual.toFixed(1)}%
          </span>
          {status !== "ok" && (
            <span className="text-[10px] text-destructive">
              {status === "under" ? "▼ LOW" : "▲ HIGH"}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        {/* Ideal range band */}
        <div
          className="absolute top-0 bottom-0 bg-success/20 border-x border-success/40"
          style={{ left: `${min}%`, width: `${max - min}%` }}
        />
        {/* Actual value bar */}
        <div
          className="absolute top-0 bottom-0 rounded-full transition-all"
          style={{
            left: 0,
            width: `${Math.min(actual, 100)}%`,
            backgroundColor: color,
            opacity: 0.75,
          }}
        />
        {/* Actual value marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded"
          style={{
            left: `${Math.min(actual, 100)}%`,
            backgroundColor: isUnder || isOver ? "#ef4444" : color,
          }}
        />
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ entries }: { entries: CategoryEntry[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
      {entries
        .filter((e) => e.percentage > 0)
        .sort((a, b) => b.percentage - a.percentage)
        .map((e) => (
          <div key={e.category} className="flex items-center gap-1.5 text-xs">
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: CATEGORY_COLORS[e.category] }}
            />
            <span className="text-muted-foreground truncate">{e.displayLabel}</span>
            <span className="ml-auto font-semibold text-foreground">
              {e.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
    </div>
  );
}

// ─── Provider panel ───────────────────────────────────────────────────────────

interface ProviderPanelProps {
  mix: ProviderMix;
  color?: string;
}

function ProviderPanel({ mix, color }: ProviderPanelProps) {
  const benchmark =
    mix.role === "DOCTOR" || mix.role === "HYGIENIST"
      ? compareToIndustryBenchmark(mix, mix.role)
      : null;

  const _benchmarkMap =
    mix.role === "DOCTOR" ? DOCTOR_BENCHMARKS : HYGIENIST_BENCHMARKS;
  void _benchmarkMap;

  const segments: DonutSegment[] = mix.entries.map((e) => ({
    category: e.category,
    percentage: e.percentage,
    displayLabel: e.displayLabel,
    amount: e.amount,
  }));

  const totalStr = `$${mix.totalAmount.toLocaleString()}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {color && (
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        )}
        <span className="text-sm font-semibold">{mix.providerName}</span>
        <Badge variant="outline" className="text-[10px] capitalize">
          {mix.role.toLowerCase()}
        </Badge>
      </div>

      <div className="flex gap-4 items-start">
        <div className="flex-shrink-0">
          <DonutChart
            segments={segments}
            size={140}
            centerLabel={totalStr}
            centerSublabel="scheduled"
          />
        </div>
        <div className="flex-1 min-w-0">
          <Legend entries={mix.entries} />
        </div>
      </div>

      {/* Benchmark comparison */}
      {benchmark && benchmark.categories.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Industry Benchmarks
          </p>
          {benchmark.categories.map((bc) => (
            <BenchmarkBar
              key={bc.category}
              label={bc.category}
              actual={bc.actual}
              min={bc.idealMin}
              max={bc.idealMax}
              color={CATEGORY_COLORS[bc.category]}
            />
          ))}
        </div>
      )}

      {/* Warnings */}
      {benchmark && benchmark.warnings.length > 0 && (
        <div className="space-y-1">
          {benchmark.warnings.map((w, i) => (
            <div
              key={i}
              className="flex gap-1.5 items-start text-[11px] text-destructive bg-destructive/10 px-2 py-1 rounded"
            >
              <span>⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ProductionMixChartProps {
  schedule: GenerationResult;
  blockTypes: BlockTypeInput[];
  providers: ProviderInput[];
}

export default function ProductionMixChart({
  schedule,
  blockTypes,
  providers,
}: ProductionMixChartProps) {
  const [view, setView] = useState<"combined" | string>("combined");

  const mix = useMemo(
    () => calculateProductionMix(schedule, blockTypes, providers),
    [schedule, blockTypes, providers]
  );

  const providerById = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers]
  );

  if (!schedule || schedule.productionSummary.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Production Mix</h3>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Production mix will appear here after generating a schedule
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const combinedSegments: DonutSegment[] = mix.combined.entries.map((e) => ({
    category: e.category,
    percentage: e.percentage,
    displayLabel: e.displayLabel,
    amount: e.amount,
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Production Mix</h3>

      {/* View selector */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setView("combined")}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            view === "combined"
              ? "bg-accent text-accent-foreground border-accent"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Combined
        </button>
        {mix.providers.map((pm) => (
          <button
            key={pm.providerId}
            onClick={() => setView(pm.providerId)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              view === pm.providerId
                ? "bg-accent text-accent-foreground border-accent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {pm.providerName.split(" ").slice(-1)[0]}
          </button>
        ))}
      </div>

      {/* Combined view */}
      {view === "combined" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Office Combined</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0">
                <DonutChart
                  segments={combinedSegments}
                  size={140}
                  centerLabel={`$${mix.combined.totalAmount.toLocaleString()}`}
                  centerSublabel="total"
                />
              </div>
              <div className="flex-1 min-w-0">
                <Legend entries={mix.combined.entries} />
              </div>
            </div>

            {/* Per-role summaries in combined view */}
            {mix.providers.length > 1 && (
              <div className="pt-2 border-t space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  By Provider
                </p>
                {mix.providers.map((pm) => {
                  const p = providerById.get(pm.providerId);
                  return (
                    <div
                      key={pm.providerId}
                      className="flex items-center gap-2 text-xs"
                    >
                      {p && (
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                      )}
                      <span className="text-muted-foreground truncate flex-1">
                        {pm.providerName}
                      </span>
                      <span className="font-semibold">
                        ${pm.totalAmount.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Individual provider view */}
      {view !== "combined" &&
        mix.providers
          .filter((pm) => pm.providerId === view)
          .map((pm) => {
            const p = providerById.get(pm.providerId);
            return (
              <Card key={pm.providerId}>
                <CardContent className="pt-4">
                  <ProviderPanel mix={pm} color={p?.color} />
                </CardContent>
              </Card>
            );
          })}
    </div>
  );
}
