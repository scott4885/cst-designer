"use client";

/**
 * Sprint 6 Epic P — Prior-template upload panel.
 *
 * Thin file-picker that serialises CSV/XLSX/DOCX/FREETEXT content and POSTs
 * to /api/offices/:id/prior-template. On success the parent refetches the
 * delta view.
 *
 * XLSX is read as base64 (the server decodes it before passing to exceljs).
 * CSV/DOCX/FREETEXT are read as text.
 *
 * See SPRINT-6-PLAN §4.1.
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { PriorTemplate } from "@/lib/engine/advisory/types";

export interface PriorTemplateUploadProps {
  officeId: string;
  priorTemplate: PriorTemplate | null;
  onUploaded: (pt: PriorTemplate) => void;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const res = fr.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

function detectFormat(file: File): "CSV" | "XLSX" | "DOCX" | null {
  const n = file.name.toLowerCase();
  if (n.endsWith(".csv")) return "CSV";
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm")) return "XLSX";
  if (n.endsWith(".docx")) return "DOCX";
  return null;
}

export function PriorTemplateUpload({
  officeId,
  priorTemplate,
  onUploaded,
}: PriorTemplateUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [freetext, setFreetext] = useState("");
  const [showFreetext, setShowFreetext] = useState(false);

  async function handleFile(f: File) {
    const fmt = detectFormat(f);
    if (!fmt) {
      toast.error(`Unsupported file type. Use CSV, XLSX, or DOCX.`);
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error("File too large — max 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const content =
        fmt === "XLSX" ? await readAsBase64(f) : await readAsText(f);
      const res = await fetch(`/api/offices/${officeId}/prior-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: fmt, filename: f.name, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onUploaded(data.priorTemplate);
      if (data.parse?.idempotent) {
        toast.info("Same file already uploaded — using the existing parse.");
      } else if (data.parse?.parseStatus === "FAILED") {
        toast.error(`Parse failed: ${data.parse.errorMessage ?? "unknown error"}`);
      } else {
        toast.success(
          `Parsed ${data.parse.blockCount} blocks (${data.parse.matchedCount} matched).`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submitFreetext() {
    if (!freetext.trim()) {
      toast.error("Paste your existing schedule first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/prior-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "FREETEXT",
          filename: "pasted-template.txt",
          content: freetext,
          rawText: freetext,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onUploaded(data.priorTemplate);
      toast.success("Prior template saved (free-text fallback).");
      setShowFreetext(false);
      setFreetext("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const parseLabel = priorTemplate
    ? `${priorTemplate.filename} · ${priorTemplate.sourceFormat} · ${priorTemplate.blockCount} blocks (${priorTemplate.matchedCount} matched)`
    : null;

  return (
    <Card data-testid="prior-template-upload">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Your existing schedule (optional)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Upload the template your office currently runs to see a side-by-side
          delta with the recommended schedule. Accepts CSV, XLSX, or DOCX up
          to 2 MB. Read-only — this never changes the live schedule.
        </p>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xlsm,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            data-testid="prior-template-file-input"
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            data-testid="prior-template-upload-btn"
          >
            {busy ? "Uploading…" : priorTemplate ? "Replace file" : "Upload file"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFreetext((v) => !v)}
            disabled={busy}
            data-testid="prior-template-freetext-toggle"
          >
            {showFreetext ? "Cancel paste" : "Paste as text instead"}
          </Button>
        </div>

        {showFreetext && (
          <div className="space-y-2">
            <Textarea
              rows={6}
              value={freetext}
              onChange={(e) => setFreetext(e.target.value)}
              placeholder="Paste your existing weekly schedule…"
              data-testid="prior-template-freetext-input"
            />
            <Button
              type="button"
              size="sm"
              onClick={submitFreetext}
              disabled={busy}
              data-testid="prior-template-freetext-submit"
            >
              Save as prior template
            </Button>
          </div>
        )}

        {parseLabel && (
          <p className="text-xs text-slate-700 border-t pt-2">
            <span className="font-semibold">Loaded:</span> {parseLabel}
          </p>
        )}

        {priorTemplate && priorTemplate.matchedCount < priorTemplate.blockCount * 0.5 && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-xs px-2 py-1.5"
            data-testid="prior-template-low-confidence"
          >
            Low match confidence — some rows could not be matched to a known
            block type. Delta accuracy is reduced.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
