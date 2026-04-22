"use client";

/**
 * Sprint 6 Epic P — Delta view.
 *
 * Renders TemplateDelta as two tables: KPI deltas and Axis deltas.
 * Each row has current / recommended / delta + colour + direction icon.
 *
 * See SPRINT-6-PLAN §4.4.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TemplateDelta, DeltaDirection } from "@/lib/engine/advisory/types";
import { ArrowUp, ArrowDown, Minus, HelpCircle } from "lucide-react";

const DIRECTION_ICON: Record<DeltaDirection, React.ReactNode> = {
  UP: <ArrowUp className="h-3 w-3" />,
  DOWN: <ArrowDown className="h-3 w-3" />,
  EQUAL: <Minus className="h-3 w-3" />,
  N_A: <HelpCircle className="h-3 w-3" />,
};

const DIRECTION_COLOUR: Record<DeltaDirection, string> = {
  UP: "text-green-700",
  DOWN: "text-red-700",
  EQUAL: "text-slate-500",
  N_A: "text-slate-400",
};

function formatValue(v: number | null, unit: string): string {
  if (v == null) return "—";
  if (unit === "USD_WEEK") return `$${Math.round(v).toLocaleString()}`;
  if (unit === "PCT") return `${v.toFixed(1)}%`;
  if (unit === "SCORE") return `${v.toFixed(1)}`;
  return String(v);
}

function formatDelta(v: number | null, unit: string): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  if (unit === "USD_WEEK") return `${sign}$${Math.round(v).toLocaleString()}`;
  if (unit === "PCT") return `${sign}${v.toFixed(1)}%`;
  if (unit === "SCORE") return `${sign}${v.toFixed(1)}`;
  return `${sign}${v}`;
}

export interface DeltaViewProps {
  delta: TemplateDelta | null;
  hasPriorTemplate: boolean;
  priorFilename?: string;
  priorSourceFormat?: string;
  parseStatus?: string;
}

export function DeltaView({
  delta,
  hasPriorTemplate,
  priorFilename,
  priorSourceFormat,
  parseStatus,
}: DeltaViewProps) {
  if (!hasPriorTemplate) {
    return (
      <Card data-testid="delta-empty">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Upload your existing schedule above to see a side-by-side delta
          against the recommended template.
        </CardContent>
      </Card>
    );
  }
  if (!delta) {
    return (
      <Card data-testid="delta-unavailable">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          A prior template is loaded ({priorFilename} · {priorSourceFormat}),
          but structured delta isn&apos;t available (parse status: {parseStatus}).
          Try uploading a CSV or XLSX for a richer comparison.
        </CardContent>
      </Card>
    );
  }

  const confBand =
    delta.confidence === "HIGH"
      ? "bg-green-100 text-green-800 border-green-200"
      : delta.confidence === "MEDIUM"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-800 border-red-200";

  return (
    <div className="space-y-3" data-testid="delta-view">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Template Delta</span>
            <span
              className={`text-[11px] px-2 py-0.5 border rounded uppercase font-semibold ${confBand}`}
              data-testid="delta-confidence"
            >
              {delta.confidence} confidence ({Math.round(delta.matchedRatio * 100)}% matched)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-sm font-medium text-slate-800">{delta.summary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">KPI deltas</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs" data-testid="delta-kpi-table">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-1.5">Metric</th>
                <th className="py-1.5 text-right">Current</th>
                <th className="py-1.5 text-right">Recommended</th>
                <th className="py-1.5 text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {delta.kpis.map((k, ix) => (
                <tr key={ix} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-slate-700">
                    {k.metric}
                  </td>
                  <td className="py-1.5 text-right text-slate-600">
                    {formatValue(k.current, k.unit)}
                  </td>
                  <td className="py-1.5 text-right text-slate-600">
                    {formatValue(k.recommended, k.unit)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${DIRECTION_COLOUR[k.direction]}`}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      {DIRECTION_ICON[k.direction]}
                      {formatDelta(k.delta, k.unit)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Axis-score deltas</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs" data-testid="delta-axis-table">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-1.5">Axis</th>
                <th className="py-1.5 text-right">Current</th>
                <th className="py-1.5 text-right">Recommended</th>
                <th className="py-1.5 text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {delta.axes.map((a, ix) => (
                <tr key={ix} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-slate-700">
                    {a.label}
                    {a.note && (
                      <span className="ml-1 text-[10px] text-slate-400">
                        ({a.note})
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-slate-600">
                    {formatValue(a.current, "SCORE")}
                  </td>
                  <td className="py-1.5 text-right text-slate-600">
                    {formatValue(a.recommended, "SCORE")}
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${DIRECTION_COLOUR[a.direction]}`}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      {DIRECTION_ICON[a.direction]}
                      {formatDelta(a.delta, "SCORE")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {delta.unmatchedBlocks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Unmatched rows ({delta.unmatchedBlocks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600">
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {delta.unmatchedBlocks.slice(0, 20).map((b, ix) => (
                <li key={ix}>
                  <span className="font-mono">
                    {b.day} {b.start}-{b.end}
                  </span>
                  {b.label && <span className="ml-2">&ldquo;{b.label}&rdquo;</span>}
                </li>
              ))}
              {delta.unmatchedBlocks.length > 20 && (
                <li className="text-slate-400">
                  … {delta.unmatchedBlocks.length - 20} more
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
