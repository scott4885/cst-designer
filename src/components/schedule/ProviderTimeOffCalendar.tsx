"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProviderAbsence {
  id: string;
  date: string;
  reason: string;
}

interface ProviderTimeOffCalendarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  officeId: string;
  providerId: string;
  providerName: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toLocalDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function ProviderTimeOffCalendar({
  open,
  onOpenChange,
  officeId,
  providerId,
  providerName,
}: ProviderTimeOffCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [absences, setAbsences] = useState<ProviderAbsence[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAbsences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/providers/${providerId}/absences`);
      if (res.ok) {
        const data = await res.json();
        setAbsences(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [officeId, providerId]);

  useEffect(() => {
    if (open) fetchAbsences();
  }, [open, fetchAbsences]);

  const absenceDates = new Set(absences.map(a => a.date));

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const handleDayClick = (day: number) => {
    const dateStr = toLocalDateStr(viewYear, viewMonth, day);
    if (absenceDates.has(dateStr)) {
      // Clear the absence
      handleClearAbsence(dateStr);
    } else {
      setSelectedDate(dateStr);
      setReason("");
      setShowReasonInput(true);
    }
  };

  const handleSaveAbsence = async () => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/offices/${officeId}/providers/${providerId}/absences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selectedDate, reason }),
        }
      );
      if (!res.ok) throw new Error("Failed to save");
      toast.success(`${providerName} marked absent on ${selectedDate}`);
      setShowReasonInput(false);
      setSelectedDate(null);
      fetchAbsences();
    } catch {
      toast.error("Failed to save absence");
    } finally {
      setSaving(false);
    }
  };

  const handleClearAbsence = async (dateStr: string) => {
    try {
      const res = await fetch(
        `/api/offices/${officeId}/providers/${providerId}/absences?date=${dateStr}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(`Absence removed for ${dateStr}`);
      fetchAbsences();
    } catch {
      toast.error("Failed to remove absence");
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Time Off — {providerName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground font-medium mb-1">
              {WEEKDAYS.map(d => <div key={d}>{d}</div>)}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarCells.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                const dateStr = toLocalDateStr(viewYear, viewMonth, day);
                const isAbsent = absenceDates.has(dateStr);
                const absence = absences.find(a => a.date === dateStr);
                const isToday =
                  today.getFullYear() === viewYear &&
                  today.getMonth() === viewMonth &&
                  today.getDate() === day;

                return (
                  <button
                    key={dateStr}
                    onClick={() => handleDayClick(day)}
                    title={isAbsent ? `Absent${absence?.reason ? ` (${absence.reason})` : ""} — click to remove` : "Click to mark absent"}
                    className={cn(
                      "relative h-8 w-full rounded text-xs font-medium transition-colors",
                      isAbsent
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : isToday
                          ? "bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30"
                          : "hover:bg-accent/10 text-foreground"
                    )}
                  >
                    {day}
                    {isAbsent && absence?.reason && (
                      <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-yellow-300 rounded-full" title={absence.reason} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span>Absent (click to remove)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-300 border" />
                <span>Has reason</span>
              </div>
            </div>

            {/* Absence list */}
            {absences.length > 0 && (
              <div className="border-t border-border pt-3">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Marked Absences</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {absences.map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{a.date}</span>
                      <span className="text-muted-foreground flex-1 mx-2 truncate">{a.reason || "No reason"}</span>
                      <button
                        onClick={() => handleClearAbsence(a.date)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remove absence"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reason input */}
            {showReasonInput && selectedDate && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-medium">
                  Mark <span className="text-accent">{selectedDate}</span> as absent
                </p>
                <Input
                  placeholder="Reason (optional): Vacation, CE, Sick…"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSaveAbsence()}
                  className="text-xs h-8"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs flex-1"
                    onClick={handleSaveAbsence}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Save Absence
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => { setShowReasonInput(false); setSelectedDate(null); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
