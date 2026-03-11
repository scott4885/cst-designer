"use client";

import { useRef, useState } from "react";
import { Upload, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseOpenDentalCSV } from "@/lib/dpms-import";
import type { ProcedureMixImportResult } from "@/lib/dpms-import";
import type { ProcedureCategory } from "@/lib/engine/types";
import { PROCEDURE_CATEGORY_LABELS } from "@/lib/engine/types";
import { toast } from "sonner";

interface DPMSImportButtonProps {
  dpmsSystem?: string;
  onApply: (mix: Partial<Record<ProcedureCategory, number>>) => void;
}

export default function DPMSImportButton({ dpmsSystem = "OPEN_DENTAL", onApply }: DPMSImportButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ProcedureMixImportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        let parsed: ProcedureMixImportResult;
        if (dpmsSystem === "OPEN_DENTAL" || dpmsSystem === "open_dental") {
          parsed = parseOpenDentalCSV(text);
        } else {
          // Default to Open Dental for now
          parsed = parseOpenDentalCSV(text);
        }
        setResult(parsed);
        setShowPreview(true);
        if (parsed.warnings.length > 0) {
          toast.warning(`Import complete with ${parsed.warnings.length} warning(s)`);
        } else {
          toast.success(`Parsed ${parsed.rowCount} rows from ${parsed.providerName}`);
        }
      } catch (err) {
        toast.error("Failed to parse CSV file");
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result.mix);
    setShowPreview(false);
    setResult(null);
    toast.success("Procedure mix applied from DPMS import");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-3 h-3" />
        Import from DPMS Report
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {/* Preview Dialog */}
      {showPreview && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-xl w-full max-w-md mx-4 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">DPMS Import Preview</h3>
                <p className="text-sm text-muted-foreground">
                  {result.providerName} · {result.rowCount} rows ·{" "}
                  {result.dateRange.from && result.dateRange.to
                    ? `${result.dateRange.from} – ${result.dateRange.to}`
                    : "Date range unknown"}
                </p>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {result.warnings.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg space-y-1">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700 dark:text-amber-400">⚠ {w}</p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Calculated Mix — Total Production: ${result.totalProduction.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              {(Object.keys(result.mix) as ProcedureCategory[]).map(cat => {
                const pct = result.mix[cat] ?? 0;
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-xs text-foreground/80 w-36 flex-shrink-0">
                      {PROCEDURE_CATEGORY_LABELS[cat]}
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setShowPreview(false)}>
                Cancel
              </Button>
              <Button className="flex-1 gap-1.5" onClick={handleApply}>
                <CheckCircle className="w-3.5 h-3.5" />
                Apply as Current Mix
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
