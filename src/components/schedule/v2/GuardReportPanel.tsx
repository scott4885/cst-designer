"use client";

/**
 * Sprint 3 — Guard Report Panel (AP-1..AP-15).
 *
 * Reads a `GuardReport` produced by `runAllGuards()` (attached to every
 * `GenerationResult` by the generator). Renders counts + per-guard
 * pass/fail rows + the list of hard/soft violations. Pure presentational —
 * no store coupling, so it can live anywhere in the tree that has access
 * to the current day's generation result.
 *
 * Design is deliberately austere — scorecard-first. Guardrails beat charts.
 */

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { GuardReport, Violation } from "@/lib/engine/types";

interface Props {
  report: GuardReport | null | undefined;
  className?: string;
}

const AP_LABELS: Record<string, string> = {
  "AP-1": "Doctor collision (single-op offices)",
  "AP-2": "Orphan X-segment (missing doctor)",
  "AP-3": "Continuity crossed (doctor left mid-procedure)",
  "AP-4": "Doctor transition buffer violated",
  "AP-5": "Exam window missed",
  "AP-6": "Quarterback overload (concurrency > cap)",
  "AP-7": "Assistant drought (> 20 min gap)",
  "AP-8": "Lunch collision",
  "AP-9": "Morning underload (< target %)",
  "AP-10": "Rock shortfall (protected blocks unmet)",
  "AP-11": "Adjacency drift (same type chain > 3)",
  "AP-12": "Doctor-block with zero D-minutes",
  "AP-13": "Off-roster placement",
  "AP-14": "After-hours placement",
  "AP-15": "Provider overlap (double-booked)",
};

function sevIcon(sev: Violation["severity"]) {
  if (sev === "HARD") return <AlertTriangle className="w-3.5 h-3.5 text-red-600" />;
  if (sev === "SOFT") return <AlertCircle className="w-3.5 h-3.5 text-amber-600" />;
  return <Info className="w-3.5 h-3.5 text-blue-600" />;
}

export default function GuardReportPanel({ report, className = "" }: Props) {
  const [expanded, setExpanded] = useState(false);

  const statusTone = useMemo(() => {
    if (!report) return "gray";
    if (report.counts.hard > 0) return "red";
    if (report.counts.soft > 0) return "amber";
    return "green";
  }, [report]);

  if (!report) {
    return (
      <div className={`border rounded-md bg-gray-50 text-gray-600 text-sm px-3 py-2 ${className}`}>
        No guard report available (no doctor X-segments placed).
      </div>
    );
  }

  const ring =
    statusTone === "red"
      ? "border-red-300 bg-red-50"
      : statusTone === "amber"
      ? "border-amber-300 bg-amber-50"
      : statusTone === "green"
      ? "border-emerald-300 bg-emerald-50"
      : "border-gray-300 bg-gray-50";

  return (
    <div
      className={`border rounded-md ${ring} ${className}`}
      data-guard-panel
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        )}
        {report.passed && report.counts.soft === 0 ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
        ) : report.counts.hard > 0 ? (
          <AlertTriangle className="w-4 h-4 text-red-600" />
        ) : (
          <AlertCircle className="w-4 h-4 text-amber-600" />
        )}
        <span className="font-medium text-sm">
          Anti-Pattern Guard —{" "}
          {report.passed && report.counts.soft === 0
            ? "All 15 checks passed"
            : `${report.counts.hard} hard · ${report.counts.soft} soft · ${report.counts.info} info`}
        </span>
      </button>

      {expanded && (
        <div className="border-t bg-white px-3 py-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-1">Check</th>
                <th className="text-left py-1">Description</th>
                <th className="text-right py-1">Violations</th>
                <th className="text-right py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <tr key={r.ap} className="border-t">
                  <td className="py-1 pr-2 font-mono text-gray-600">{r.ap}</td>
                  <td className="py-1 pr-2 text-gray-800">
                    {AP_LABELS[r.ap] ?? r.ap}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {r.violations.length}
                  </td>
                  <td className="py-1 text-right">
                    {r.passed ? (
                      <span className="text-emerald-700">pass</span>
                    ) : (
                      <span className="text-red-700">fail</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.violations.length > 0 && (
            <div className="mt-3 border-t pt-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                Violations ({report.violations.length})
              </div>
              <ul className="space-y-1 max-h-48 overflow-auto pr-1">
                {report.violations.map((v, idx) => (
                  <li
                    key={`${v.ap}-${v.code}-${idx}`}
                    className="flex items-start gap-2 text-xs"
                  >
                    {sevIcon(v.severity)}
                    <span className="font-mono text-gray-500 shrink-0">
                      {v.ap}
                    </span>
                    <span className="text-gray-800">{v.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
