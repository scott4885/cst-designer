"use client";

/**
 * Sprint 3 — ProcedureOverride admin page (PRD-V4 FR-6).
 *
 * Lets a user shadow the x-segment of one or more block types with
 * per-practice values. Kept deliberately minimal — one table, one input
 * triple, one save per row. Designed for power users; the main schedule
 * page stays untouched.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOfficeStore } from "@/store/office-store";

interface OverrideRow {
  id: string;
  blockTypeId: string;
  asstPreMin: number | null;
  doctorMin: number | null;
  asstPostMin: number | null;
}

interface RowState {
  asstPreMin: string;
  doctorMin: string;
  asstPostMin: string;
  dirty: boolean;
  saving: boolean;
}

function toStr(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

function parseField(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 600 || !Number.isInteger(n)) {
    return Number.NaN;
  }
  return n;
}

export default function ProcedureOverridesPage() {
  const params = useParams();
  const router = useRouter();
  const officeId = params.id as string;

  const { currentOffice, fetchOffice, isLoading } = useOfficeStore();

  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  useEffect(() => {
    fetchOffice(officeId).catch(() => router.push("/"));
  }, [officeId, fetchOffice, router]);

  const loadOverrides = useCallback(async () => {
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/procedure-overrides`);
      if (!res.ok) throw new Error("Failed to load overrides");
      const data = (await res.json()) as OverrideRow[];
      setOverrides(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load overrides");
    } finally {
      setLoadingRows(false);
    }
  }, [officeId]);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  const blockTypes = currentOffice?.blockTypes ?? [];

  const overridesByBlockType = useMemo(() => {
    const map = new Map<string, OverrideRow>();
    for (const o of overrides) map.set(o.blockTypeId, o);
    return map;
  }, [overrides]);

  // Seed row state from server rows + base block-type x-segments.
  useEffect(() => {
    const next: Record<string, RowState> = {};
    for (const bt of blockTypes) {
      const ovr = overridesByBlockType.get(bt.id);
      const existing = rowState[bt.id];
      if (existing?.dirty) {
        next[bt.id] = existing;
        continue;
      }
      next[bt.id] = {
        asstPreMin: toStr(ovr?.asstPreMin ?? bt.xSegment?.asstPreMin ?? 0),
        doctorMin: toStr(ovr?.doctorMin ?? bt.xSegment?.doctorMin ?? 0),
        asstPostMin: toStr(ovr?.asstPostMin ?? bt.xSegment?.asstPostMin ?? 0),
        dirty: false,
        saving: false,
      };
    }
    setRowState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockTypes, overridesByBlockType]);

  const setField = (
    blockTypeId: string,
    field: "asstPreMin" | "doctorMin" | "asstPostMin",
    value: string,
  ) => {
    setRowState((prev) => ({
      ...prev,
      [blockTypeId]: {
        ...(prev[blockTypeId] ?? {
          asstPreMin: "",
          doctorMin: "",
          asstPostMin: "",
          saving: false,
          dirty: false,
        }),
        [field]: value,
        dirty: true,
      },
    }));
  };

  const handleSave = async (blockTypeId: string) => {
    const row = rowState[blockTypeId];
    if (!row) return;

    const asstPreMin = parseField(row.asstPreMin);
    const doctorMin = parseField(row.doctorMin);
    const asstPostMin = parseField(row.asstPostMin);

    if (
      Number.isNaN(asstPreMin) ||
      Number.isNaN(doctorMin) ||
      Number.isNaN(asstPostMin)
    ) {
      toast.error("Minutes must be integers between 0 and 600 (blank = use default)");
      return;
    }

    setRowState((prev) => ({
      ...prev,
      [blockTypeId]: { ...prev[blockTypeId], saving: true },
    }));

    try {
      const res = await fetch(`/api/offices/${officeId}/procedure-overrides`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blockTypeId,
          asstPreMin,
          doctorMin,
          asstPostMin,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      toast.success("Override saved");
      await loadOverrides();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRowState((prev) => ({
        ...prev,
        [blockTypeId]: { ...prev[blockTypeId], saving: false, dirty: false },
      }));
    }
  };

  const handleReset = (blockTypeId: string) => {
    setRowState((prev) => {
      const bt = blockTypes.find((b) => b.id === blockTypeId);
      if (!bt) return prev;
      return {
        ...prev,
        [blockTypeId]: {
          asstPreMin: toStr(bt.xSegment?.asstPreMin ?? 0),
          doctorMin: toStr(bt.xSegment?.doctorMin ?? 0),
          asstPostMin: toStr(bt.xSegment?.asstPostMin ?? 0),
          saving: false,
          dirty: true,
        },
      };
    });
  };

  const handleDelete = async (blockTypeId: string) => {
    try {
      const res = await fetch(
        `/api/offices/${officeId}/procedure-overrides?blockTypeId=${encodeURIComponent(blockTypeId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Override cleared");
      await loadOverrides();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (isLoading || !currentOffice) {
    return (
      <div className="p-6 text-sm text-gray-600">Loading office…</div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/offices/${officeId}`} className="text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold">Procedure Overrides</h1>
        <span className="text-sm text-gray-500">— {currentOffice.name}</span>
      </div>

      <p className="text-sm text-gray-600 mb-6 max-w-2xl">
        Override the per-practice x-segment (Assistant-Pre / Doctor / Assistant-Post)
        for any block type. Leave a field blank to keep the base BlockType value.
        Overrides apply at the next schedule generation.
      </p>

      {loadingRows ? (
        <div className="text-sm text-gray-500">Loading overrides…</div>
      ) : (
        <div className="border rounded-md overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Block Type</th>
                <th className="text-right px-3 py-2">Asst Pre (min)</th>
                <th className="text-right px-3 py-2">Doctor (min)</th>
                <th className="text-right px-3 py-2">Asst Post (min)</th>
                <th className="text-right px-3 py-2">Base Total</th>
                <th className="text-right px-3 py-2 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blockTypes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    No block types configured for this office.
                  </td>
                </tr>
              ) : (
                blockTypes.map((bt) => {
                  const row = rowState[bt.id];
                  const hasOverride = overridesByBlockType.has(bt.id);
                  const baseTotal =
                    (bt.xSegment?.asstPreMin ?? 0) +
                    (bt.xSegment?.doctorMin ?? 0) +
                    (bt.xSegment?.asstPostMin ?? 0);
                  return (
                    <tr key={bt.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">{bt.label}</div>
                        {hasOverride && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            override active
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={600}
                          className="w-20 border rounded px-2 py-1 text-right"
                          value={row?.asstPreMin ?? ""}
                          onChange={(e) =>
                            setField(bt.id, "asstPreMin", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={600}
                          className="w-20 border rounded px-2 py-1 text-right"
                          value={row?.doctorMin ?? ""}
                          onChange={(e) =>
                            setField(bt.id, "doctorMin", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={600}
                          className="w-20 border rounded px-2 py-1 text-right"
                          value={row?.asstPostMin ?? ""}
                          onChange={(e) =>
                            setField(bt.id, "asstPostMin", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {baseTotal} min
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReset(bt.id)}
                            title="Reset to base x-segment"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                          {hasOverride && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(bt.id)}
                              title="Clear override (revert to base)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleSave(bt.id)}
                            disabled={!row?.dirty || row?.saving}
                          >
                            <Save className="w-3.5 h-3.5 mr-1" />
                            {row?.saving ? "Saving…" : "Save"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
