"use client";

import { useState } from "react";
import { AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClinicalWarning } from "@/lib/engine/clinical-rules";

interface ClinicalValidationPanelProps {
  warnings: ClinicalWarning[];
}

const SEVERITY_CONFIG = {
  error: {
    icon: XCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    label: "Warning",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
    label: "Info",
  },
};

export default function ClinicalValidationPanel({ warnings }: ClinicalValidationPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const errorCount = warnings.filter(w => w.severity === "error").length;
  const warningCount = warnings.filter(w => w.severity === "warning").length;
  const infoCount = warnings.filter(w => w.severity === "info").length;
  const totalCount = warnings.length;

  // Sort: errors first, then warnings, then info
  const sorted = [...warnings].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm">Clinical Validation</CardTitle>
            {totalCount === 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                ✓ All clear
              </span>
            ) : (
              <div className="flex items-center gap-1">
                {errorCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                    {errorCount} error{errorCount !== 1 ? "s" : ""}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                    {warningCount} warn{warningCount !== 1 ? "ings" : "ing"}
                  </span>
                )}
                {infoCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                    {infoCount} info
                  </span>
                )}
              </div>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {totalCount === 0 ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              No clinical rule violations found. Schedule looks good!
            </div>
          ) : (
            sorted.map((warning, idx) => {
              const cfg = SEVERITY_CONFIG[warning.severity];
              const Icon = cfg.icon;
              return (
                <div
                  key={`${warning.ruleId}-${idx}`}
                  className={`rounded-md border p-2.5 ${cfg.bg} ${cfg.border}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.text}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        {warning.affectedTime && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            @{warning.affectedTime}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs leading-snug ${cfg.text}`}>{warning.message}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      )}
    </Card>
  );
}
