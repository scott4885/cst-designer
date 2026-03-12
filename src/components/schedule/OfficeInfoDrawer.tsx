"use client";

import { X, Building2, Users, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OfficeInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  office: {
    name: string;
    dpmsSystem?: string;
    timeIncrement?: number;
    workingDays?: string[];
    totalDailyGoal?: number;
    providers?: Array<{
      id: string;
      name: string;
      role: string;
      color: string;
      operatories?: string[];
      workingStart?: string;
      workingEnd?: string;
      lunchStart?: string;
      lunchEnd?: string;
      dailyGoal?: number;
    }>;
    rules?: {
      doubleBooking?: boolean;
      matrixing?: boolean;
      npModel?: string;
      npBlocksPerDay?: number;
      srpBlocksPerDay?: number;
      hpPlacement?: string;
      emergencyHandling?: string;
    };
    blockTypes?: Array<{
      id: string;
      label: string;
      durationMin?: number;
      minimumAmount?: number;
      appliesToRole?: string;
    }>;
  };
}

const getDayLabel = (day: string) => {
  const labels: Record<string, string> = {
    MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday',
    THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday',
  };
  return labels[day] || day;
};

export default function OfficeInfoDrawer({ open, onClose, office }: OfficeInfoDrawerProps) {
  if (!open) return null;

  const providers = office.providers ?? [];
  const doctors = providers.filter(p => p.role === 'DOCTOR');
  const hygienists = providers.filter(p => p.role === 'HYGIENIST');
  const blockTypes = office.blockTypes ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="fixed right-0 top-0 h-full w-80 max-w-[90vw] bg-surface border-l border-border shadow-xl z-50 overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Office Info</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="px-4 py-3 space-y-4">
          {/* Office basics */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">General</h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{office.name}</dd>
              </div>
              {office.dpmsSystem && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">DPMS</dt>
                  <dd className="font-medium">{office.dpmsSystem}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Time Increment</dt>
                <dd className="font-medium">{office.timeIncrement ?? 10} min</dd>
              </div>
              {office.totalDailyGoal != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Daily Goal</dt>
                  <dd className="font-medium">${office.totalDailyGoal.toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Working days */}
          {office.workingDays && office.workingDays.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Working Days
              </h3>
              <div className="flex flex-wrap gap-1">
                {office.workingDays.map(d => (
                  <span key={d} className="px-2 py-0.5 rounded text-xs font-medium bg-muted border border-border">
                    {getDayLabel(d)}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Providers */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Users className="w-3 h-3" /> Providers ({providers.length})
            </h3>
            {doctors.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">Doctors</p>
                {doctors.map(p => (
                  <div key={p.id} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(p.operatories ?? []).join(', ')} · {p.workingStart}–{p.workingEnd}
                        {p.dailyGoal ? ` · $${p.dailyGoal.toLocaleString()}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hygienists.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground mb-1">Hygienists</p>
                {hygienists.map(p => (
                  <div key={p.id} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(p.operatories ?? []).join(', ')} · {p.workingStart}–{p.workingEnd}
                        {p.dailyGoal ? ` · $${p.dailyGoal.toLocaleString()}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Rules */}
          {office.rules && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Rules
              </h3>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Double Booking</dt>
                  <dd className="font-medium">{office.rules.doubleBooking ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">NP Model</dt>
                  <dd className="font-medium">{office.rules.npModel ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">HP Placement</dt>
                  <dd className="font-medium">{office.rules.hpPlacement ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">NP Blocks/Day</dt>
                  <dd className="font-medium">{office.rules.npBlocksPerDay ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Emergency</dt>
                  <dd className="font-medium">{office.rules.emergencyHandling ?? '—'}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* Block Types summary */}
          {blockTypes.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Block Types ({blockTypes.length})
              </h3>
              <div className="space-y-0.5">
                {blockTypes.slice(0, 15).map(bt => (
                  <div key={bt.id} className="flex items-center justify-between text-xs py-0.5">
                    <span className="truncate flex-1">{bt.label}</span>
                    <span className="text-muted-foreground ml-2 shrink-0">
                      {bt.durationMin ?? '?'}min
                      {bt.minimumAmount ? ` · $${bt.minimumAmount}` : ''}
                    </span>
                  </div>
                ))}
                {blockTypes.length > 15 && (
                  <p className="text-[10px] text-muted-foreground">+{blockTypes.length - 15} more</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
