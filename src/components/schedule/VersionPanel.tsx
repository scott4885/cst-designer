"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, History, Loader2, Trash2, Upload, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { GenerationResult, ProviderProductionSummary } from "@/lib/engine/types";

interface TemplateVersion {
  id: string;
  name: string;
  dayOfWeek: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VersionPanelProps {
  officeId: string;
  activeDay: string;
  /** Active week ('A' or 'B') — passed through to template save/load for alternate-week offices. */
  activeWeek?: 'A' | 'B' | 'C' | 'D';
  currentSchedule: GenerationResult | null;
  onLoadVersion: (schedule: GenerationResult) => void;
}

export default function VersionPanel({
  officeId,
  activeDay,
  activeWeek = 'A',
  currentSchedule,
  onLoadVersion,
}: VersionPanelProps) {
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState<{
    a: { name: string; summary: ProviderProductionSummary[] } | null;
    b: { name: string; summary: ProviderProductionSummary[] } | null;
  }>({ a: null, b: null });

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const weekParam = activeWeek === 'B' ? `&week=B` : `&week=A`;
      const res = await fetch(`/api/offices/${officeId}/templates?day=${activeDay}${weekParam}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } catch (error) {
      console.error("Failed to fetch versions:", error);
    } finally {
      setLoading(false);
    }
  }, [officeId, activeDay, activeWeek]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleSave = async () => {
    if (!currentSchedule || !saveName.trim()) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          dayOfWeek: activeDay,
          weekType: activeWeek,
          slots: currentSchedule.slots,
          productionSummary: currentSchedule.productionSummary,
          warnings: currentSchedule.warnings,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast.success(`Saved as "${saveName.trim()}"`);
      setShowSaveDialog(false);
      setSaveName("");
      fetchVersions();
    } catch (error) {
      console.error("Error saving version:", error);
      toast.error("Failed to save version");
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (templateId: string) => {
    try {
      const res = await fetch(`/api/offices/${officeId}/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      const schedule: GenerationResult = {
        dayOfWeek: data.dayOfWeek,
        slots: data.slots,
        productionSummary: data.productionSummary,
        warnings: data.warnings,
      };

      onLoadVersion(schedule);
      toast.success(`Loaded version "${data.name}"`);
    } catch (error) {
      console.error("Error loading version:", error);
      toast.error("Failed to load version");
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const res = await fetch(`/api/offices/${officeId}/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Version deleted");
      fetchVersions();
    } catch (error) {
      console.error("Error deleting version:", error);
      toast.error("Failed to delete version");
    }
  };

  const handleCompare = async (templateId: string, templateName: string) => {
    try {
      const res = await fetch(`/api/offices/${officeId}/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();

      if (!compareVersions.a) {
        setCompareVersions({
          a: { name: templateName, summary: data.productionSummary },
          b: null,
        });
        toast.success(`Selected "${templateName}" as Version A. Now select Version B.`);
      } else {
        setCompareVersions({
          ...compareVersions,
          b: { name: templateName, summary: data.productionSummary },
        });
        setCompareMode(true);
      }
    } catch (error) {
      console.error("Error loading for compare:", error);
      toast.error("Failed to load version for comparison");
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4" />
              Versions
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] text-xs gap-1"
              disabled={!currentSchedule}
              onClick={() => {
                setSaveName(`Template - ${new Date().toLocaleDateString()}`);
                setShowSaveDialog(true);
              }}
            >
              <Save className="w-3 h-3" />
              Save Version
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No saved versions for {activeDay}
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-accent/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{version.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(version.updatedAt)}
                      {version.isActive && (
                        <span className="ml-1 text-green-600 font-medium">Active</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 min-h-[44px] min-w-[44px]"
                      title="Load"
                      onClick={() => handleLoad(version.id)}
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 min-h-[44px] min-w-[44px]"
                      title="Compare"
                      onClick={() => handleCompare(version.id, version.name)}
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 min-h-[44px] min-w-[44px]"
                      title="Delete"
                      onClick={() => handleDelete(version.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Version Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Version</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Version name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !saveName.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare Mode Dialog */}
      <Dialog open={compareMode} onOpenChange={(open) => {
        if (!open) {
          setCompareMode(false);
          setCompareVersions({ a: null, b: null });
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compare Versions</DialogTitle>
          </DialogHeader>
          {compareVersions.a && compareVersions.b && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CompareColumn label="Version A" name={compareVersions.a.name} summary={compareVersions.a.summary} />
              <CompareColumn label="Version B" name={compareVersions.b.name} summary={compareVersions.b.summary} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCompareMode(false);
              setCompareVersions({ a: null, b: null });
            }}>
              Back to Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CompareColumn({
  label,
  name,
  summary,
}: {
  label: string;
  name: string;
  summary: ProviderProductionSummary[];
}) {
  const totalScheduled = summary.reduce((sum, s) => sum + s.actualScheduled, 0);
  const totalTarget = summary.reduce((sum, s) => sum + s.target75, 0);
  const pct = totalTarget > 0 ? Math.round((totalScheduled / totalTarget) * 100) : 0;

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <p className="text-sm font-medium">{name}</p>
      <div className="space-y-1">
        {summary.map((s) => (
          <div key={s.providerId} className="flex justify-between text-xs">
            <span>{s.providerName}</span>
            <span className={s.status === 'MET' ? 'text-green-600' : s.status === 'UNDER' ? 'text-red-600' : 'text-yellow-600'}>
              ${Math.round(s.actualScheduled).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t border-border">
        <div className="flex justify-between text-xs font-medium">
          <span>Total</span>
          <span>${Math.round(totalScheduled).toLocaleString()} ({pct}%)</span>
        </div>
      </div>
    </div>
  );
}
