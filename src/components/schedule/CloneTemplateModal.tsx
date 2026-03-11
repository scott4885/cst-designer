"use client";

import { useState, useMemo } from "react";
import { Search, CheckSquare, Square, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cloneTemplateToOffices, CloneResult } from "@/lib/clone-template";
import type { ProviderInput } from "@/lib/engine/types";
import type { OfficeData } from "@/lib/mock-data";
import { notify } from "@/lib/notifications";

interface CloneTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceOfficeId: string;
  sourceOfficeName: string;
  sourceProviders: ProviderInput[];
  allOffices: OfficeData[];
  /** Whether rotation is enabled for the source office */
  rotationEnabled?: boolean;
  /** Number of rotation weeks (2 or 4) */
  rotationWeeks?: number;
  /** Currently active week */
  activeWeek?: string;
  workingDays: string[];
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
};

type CloneStep = 'select' | 'confirm' | 'done';

export default function CloneTemplateModal({
  open,
  onOpenChange,
  sourceOfficeId,
  sourceOfficeName,
  sourceProviders,
  allOffices,
  rotationEnabled = false,
  rotationWeeks = 2,
  activeWeek = 'A',
  workingDays,
}: CloneTemplateModalProps) {
  const [step, setStep] = useState<CloneStep>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(DAYS.filter(d => workingDays.includes(d))));
  const [selectedWeeks, setSelectedWeeks] = useState<Set<string>>(new Set([activeWeek]));
  const [cloneLibrary, setCloneLibrary] = useState(false);
  const [cloneResults, setCloneResults] = useState<CloneResult[]>([]);
  const [totalMismatches, setTotalMismatches] = useState(0);
  const [isCloning, setIsCloning] = useState(false);

  // Offices available to clone to (exclude source)
  const availableOffices = useMemo(
    () => allOffices.filter(o => o.id !== sourceOfficeId),
    [allOffices, sourceOfficeId]
  );

  // Filtered offices by search
  const filteredOffices = useMemo(() => {
    if (!searchQuery.trim()) return availableOffices;
    const q = searchQuery.toLowerCase();
    return availableOffices.filter(
      o =>
        o.name.toLowerCase().includes(q) ||
        o.dpmsSystem.toLowerCase().includes(q)
    );
  }, [availableOffices, searchQuery]);

  const weekOptions: string[] = rotationEnabled
    ? (rotationWeeks === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B'])
    : ['A'];

  const toggleOffice = (id: string) => {
    setSelectedOfficeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const toggleWeek = (week: string) => {
    setSelectedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOfficeIds.size === filteredOffices.length) {
      setSelectedOfficeIds(new Set());
    } else {
      setSelectedOfficeIds(new Set(filteredOffices.map(o => o.id)));
    }
  };

  const handleClone = async () => {
    setIsCloning(true);
    try {
      const targetOffices = availableOffices
        .filter(o => selectedOfficeIds.has(o.id))
        .map(o => ({
          id: o.id,
          name: o.name,
          providers: o.providers ?? [],
        }));

      const { results, totalMismatches: tm } = cloneTemplateToOffices(
        sourceOfficeId,
        sourceProviders,
        targetOffices,
        {
          days: Array.from(selectedDays),
          weeks: Array.from(selectedWeeks),
          cloneLibrary,
        }
      );

      setCloneResults(results);
      setTotalMismatches(tm);
      setStep('done');
      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) {
        notify.cloned(successCount);
      }
    } finally {
      setIsCloning(false);
    }
  };

  const handleClose = () => {
    // Reset state on close
    setStep('select');
    setSearchQuery('');
    setSelectedOfficeIds(new Set());
    setSelectedDays(new Set(DAYS.filter(d => workingDays.includes(d))));
    setSelectedWeeks(new Set([activeWeek]));
    setCloneLibrary(false);
    setCloneResults([]);
    onOpenChange(false);
  };

  const canConfirm =
    selectedOfficeIds.size > 0 && selectedDays.size > 0 && selectedWeeks.size > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-semibold">📋 Clone Template to Another Office</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Copy <strong>{sourceOfficeName}</strong>&apos;s schedule to other offices.
            Providers are matched by role.
          </p>
        </div>

        {step === 'select' && (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Office Search + Select */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Target Offices</Label>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs text-accent hover:underline"
                  >
                    {selectedOfficeIds.size === filteredOffices.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search offices..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 h-8 text-sm"
                  />
                </div>
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {filteredOffices.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No other offices found</p>
                  )}
                  {filteredOffices.map(office => {
                    const isSelected = selectedOfficeIds.has(office.id);
                    return (
                      <button
                        key={office.id}
                        type="button"
                        onClick={() => toggleOffice(office.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors border-b last:border-b-0 ${isSelected ? 'bg-accent/5' : ''}`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-accent flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="flex-1 font-medium">{office.name}</span>
                        <Badge variant="secondary" className="text-xs">{office.dpmsSystem}</Badge>
                        <span className="text-xs text-muted-foreground">{office.providerCount} providers</span>
                      </button>
                    );
                  })}
                </div>
                {selectedOfficeIds.size > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedOfficeIds.size} office{selectedOfficeIds.size > 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* Days */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Clone which days?</Label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.filter(d => workingDays.includes(d)).map(day => {
                    const isSelected = selectedDays.has(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-accent text-accent-foreground border-accent'
                            : 'bg-background text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {DAY_LABELS[day]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weeks (only show if rotation enabled) */}
              {rotationEnabled && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Clone which weeks?</Label>
                  <div className="flex gap-2">
                    {weekOptions.map(week => {
                      const isSelected = selectedWeeks.has(week);
                      return (
                        <button
                          key={week}
                          type="button"
                          onClick={() => toggleWeek(week)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'bg-accent text-accent-foreground border-accent'
                              : 'bg-background text-muted-foreground border-border hover:bg-muted'
                          }`}
                        >
                          Week {week}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Clone Library Option */}
              <div className="flex items-center gap-3 py-2 border rounded-lg px-3">
                <Switch
                  id="clone-library"
                  checked={cloneLibrary}
                  onCheckedChange={setCloneLibrary}
                />
                <div>
                  <Label htmlFor="clone-library" className="text-sm font-medium cursor-pointer">
                    Clone appointment library too?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When off, target offices keep their own block type library. Default: off.
                  </p>
                </div>
              </div>

              {/* Provider mismatch notice */}
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                <strong>Provider matching:</strong> Doctors are matched to doctors, hygienists to hygienists by order. If counts differ, extra source providers will be skipped and you&apos;ll see a mismatch summary.
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleClone}
                disabled={!canConfirm || isCloning}
              >
                {isCloning ? 'Cloning...' : `Clone to ${selectedOfficeIds.size} office${selectedOfficeIds.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Summary */}
              <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Cloned to {cloneResults.length} office{cloneResults.length !== 1 ? 's' : ''}!
                  </p>
                  {totalMismatches > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {totalMismatches} provider mismatch{totalMismatches !== 1 ? 'es' : ''} were encountered.
                    </p>
                  )}
                </div>
              </div>

              {/* Mismatch details */}
              {cloneResults.some(r => r.mismatches.length > 0) && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Provider Count Mismatches
                  </p>
                  <div className="space-y-2">
                    {cloneResults.filter(r => r.mismatches.length > 0).map(r => (
                      <div key={r.officeId} className="text-xs bg-amber-500/10 border border-amber-500/20 rounded p-2">
                        {r.mismatches.map((m, i) => (
                          <p key={i} className="text-amber-700 dark:text-amber-400">{m.message}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
