"use client";

import { useState, useEffect, useCallback } from "react";
import { Library, Trash2, Loader2, Plus, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";

interface TemplateLibraryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  isBuiltIn: boolean;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "General Practice",
  ENDO: "Endodontics",
  COSMETIC: "Cosmetic",
  HYGIENE: "Hygiene-Heavy",
  MULTI_OP: "Multi-Op",
};

const CATEGORY_COLORS: Record<string, string> = {
  GENERAL: "bg-blue-100 text-blue-700",
  ENDO: "bg-orange-100 text-orange-700",
  COSMETIC: "bg-pink-100 text-pink-700",
  HYGIENE: "bg-teal-100 text-teal-700",
  MULTI_OP: "bg-purple-100 text-purple-700",
};

export default function TemplatLibraryPage() {
  const [items, setItems] = useState<TemplateLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyModal, setApplyModal] = useState<TemplateLibraryItem | null>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ warnings: string[]; days: number } | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("GENERAL");
  const [saving, setSaving] = useState(false);

  const { offices, fetchOffices } = useOfficeStore();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/template-library");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchOffices().catch(() => {});
  }, [fetchItems, fetchOffices]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/template-library/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Failed to delete");
        return;
      }
      toast.success("Template deleted");
      fetchItems();
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const handleApply = async () => {
    if (!applyModal || !selectedOfficeId) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await fetch(`/api/template-library/${applyModal.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOfficeId: selectedOfficeId }),
      });
      if (!res.ok) throw new Error("Failed to apply");
      const data = await res.json();
      const dayCount = Object.keys(data.daySchedules || {}).length;
      setApplyResult({ warnings: data.warnings ?? [], days: dayCount });
      toast.success(`Template "${applyModal.name}" applied to office — ${dayCount} day(s) mapped!`);
    } catch {
      toast.error("Failed to apply template");
    } finally {
      setApplying(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/template-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), category: newCategory, slotsJson: "{}" }),
      });
      if (!res.ok) throw new Error("Failed to create");
      toast.success(`Template "${newName.trim()}" created!`);
      setShowNewDialog(false);
      setNewName("");
      setNewDesc("");
      setNewCategory("GENERAL");
      fetchItems();
    } catch {
      toast.error("Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Library className="w-6 h-6 text-accent" />
          <div>
            <h1 className="text-xl font-bold">Global Template Library</h1>
            <p className="text-sm text-muted-foreground">
              Pre-built schedule templates to apply to any office as a starting point.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNewDialog(true)} className="gap-1">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map(item => (
          <Card key={item.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm leading-snug">{item.name}</CardTitle>
                {item.isBuiltIn ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">Built-in</Badge>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(item.id)}
                    title="Delete template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <span
                className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded w-fit ${CATEGORY_COLORS[item.category] ?? "bg-muted text-muted-foreground"}`}
              >
                {CATEGORY_LABELS[item.category] ?? item.category}
              </span>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col pb-4 pt-0">
              <p className="text-xs text-muted-foreground flex-1 mb-4 leading-relaxed">
                {item.description || "No description."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1"
                onClick={() => {
                  setApplyModal(item);
                  setSelectedOfficeId("");
                  setApplyResult(null);
                }}
              >
                <Building2 className="w-3.5 h-3.5" />
                Apply to Office
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Library className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No templates yet. Create your first template!</p>
        </div>
      )}

      {/* Apply to Office modal */}
      <Dialog
        open={!!applyModal}
        onOpenChange={open => {
          if (!open) { setApplyModal(null); setApplyResult(null); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply Template to Office</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">{applyModal?.name}</p>
              <p className="text-xs text-muted-foreground">{applyModal?.description}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Select Office</Label>
              <Select value={selectedOfficeId} onValueChange={setSelectedOfficeId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Choose an office…" />
                </SelectTrigger>
                <SelectContent>
                  {offices.map(office => (
                    <SelectItem key={office.id} value={office.id}>
                      {office.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {applyResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  Applied — {applyResult.days} day(s) mapped to office providers.
                </div>
                {applyResult.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {w}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setApplyModal(null); setApplyResult(null); }}>
              Close
            </Button>
            {!applyResult && (
              <Button
                size="sm"
                onClick={handleApply}
                disabled={applying || !selectedOfficeId}
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Apply
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Template dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="e.g. Custom Endo Day"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                placeholder="Brief description…"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
