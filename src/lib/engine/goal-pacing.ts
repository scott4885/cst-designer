/**
 * Goal Pacing Calculator — Sprint 16
 *
 * Given a provider's schedule for a day (slots + block types), compute:
 * - Cumulative production by hour
 * - Projected time when goal is hit
 * - Shortfall or on-track message
 * - Recommendations
 *
 * Pure computation — no React/browser dependencies.
 */

import type { TimeSlotOutput, BlockTypeInput, ProviderInput } from './types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface HourMilestone {
  /** Display time, e.g. "9:00 AM" */
  time: string;
  /** Cumulative production through this hour */
  cumulative: number;
  /** Percentage of daily goal achieved */
  pct: number;
}

export interface PacingResult {
  providerId: string;
  dailyGoal: number;
  scheduledTotal: number;
  cumulativeByHour: HourMilestone[];
  /** "1:30 PM" or null if goal is never hit */
  projectedGoalTime: string | null;
  goalHitByEnd: boolean;
  /** "On track by 2:00 PM" or "Will fall short by $1,200" */
  onTrackAt: string;
  shortfallAmount: number;
  recommendations: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Parse "8:00 AM" or "08:00" → minutes since midnight */
function parseToMinutes(t: string): number {
  const amPm = /^\s*(\d+):(\d{2})\s*(AM|PM)?\s*$/i.exec(t);
  if (!amPm) return 0;
  let h = parseInt(amPm[1], 10);
  const m = parseInt(amPm[2], 10);
  const period = (amPm[3] ?? '').toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function minutesToAmPm(minutes: number): string {
  const totalMin = Math.max(0, minutes);
  let h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

/** Group slots by their unique blockInstanceId (or by time+providerId if no instance) */
function collectBlocks(
  slots: TimeSlotOutput[],
  providerId: string,
  blockTypeMap: Map<string, BlockTypeInput>
): Array<{ startMin: number; endMin: number; production: number; label: string }> {
  // Use blockInstanceId to group; each unique instance = one block
  const instanceMap = new Map<string, {
    startMin: number;
    endMin: number;
    production: number;
    label: string;
  }>();

  const providerSlots = slots.filter(s => s.providerId === providerId && !s.isBreak && s.blockTypeId);

  for (const slot of providerSlots) {
    const key = slot.blockInstanceId ?? `${slot.time}-${slot.blockTypeId}`;
    const slotMin = parseToMinutes(slot.time);
    const bt = slot.blockTypeId ? blockTypeMap.get(slot.blockTypeId) : undefined;
    // Production = customProductionAmount or minimumAmount on the block type
    const production = slot.customProductionAmount ?? bt?.minimumAmount ?? 0;

    if (!instanceMap.has(key)) {
      instanceMap.set(key, {
        startMin: slotMin,
        endMin: slotMin,
        production,
        label: slot.blockLabel ?? bt?.label ?? '',
      });
    } else {
      const existing = instanceMap.get(key)!;
      instanceMap.set(key, {
        ...existing,
        endMin: Math.max(existing.endMin, slotMin),
      });
    }
  }

  return Array.from(instanceMap.values()).sort((a, b) => a.startMin - b.startMin);
}

// ─── Main calculator ────────────────────────────────────────────────────────────

export function calculateGoalPacing(
  providerId: string,
  dailyGoal: number,
  slots: TimeSlotOutput[],
  blockTypes: BlockTypeInput[],
  provider?: ProviderInput
): PacingResult {
  const blockTypeMap = new Map(blockTypes.map(bt => [bt.id, bt]));
  const blocks = collectBlocks(slots, providerId, blockTypeMap);

  // Determine working hours
  const workStart = parseToMinutes(provider?.workingStart ?? '07:00');
  const workEnd = parseToMinutes(provider?.workingEnd ?? '17:00');

  // Build hourly milestones
  const cumulativeByHour: HourMilestone[] = [];
  let runningTotal = 0;
  let projectedGoalTime: string | null = null;
  let goalHitByEnd = false;

  // Iterate each hour from workStart to workEnd
  for (let h = workStart; h <= workEnd; h += 60) {
    // Add all blocks that START in this hour window
    for (const block of blocks) {
      if (block.startMin >= h - 60 && block.startMin < h) {
        runningTotal += block.production;
        if (runningTotal >= dailyGoal && projectedGoalTime === null) {
          // Interpolate: at what exact minute was goal hit?
          // Use the block's start minute as the hit time
          projectedGoalTime = minutesToAmPm(block.startMin);
          goalHitByEnd = true;
        }
      }
    }
    cumulativeByHour.push({
      time: minutesToAmPm(h),
      cumulative: runningTotal,
      pct: dailyGoal > 0 ? Math.round((runningTotal / dailyGoal) * 100) : 0,
    });
  }

  // Also check blocks beyond last hour milestone
  for (const block of blocks) {
    if (block.startMin > workEnd) {
      runningTotal += block.production;
    }
  }

  const scheduledTotal = blocks.reduce((s, b) => s + b.production, 0);

  if (scheduledTotal >= dailyGoal && projectedGoalTime === null) {
    goalHitByEnd = true;
    // Find the exact block where goal was hit
    let cum = 0;
    for (const block of blocks) {
      cum += block.production;
      if (cum >= dailyGoal && projectedGoalTime === null) {
        projectedGoalTime = minutesToAmPm(block.startMin);
      }
    }
  }

  // Build message
  const shortfallAmount = Math.max(0, dailyGoal - scheduledTotal);
  let onTrackAt: string;
  if (goalHitByEnd && projectedGoalTime) {
    onTrackAt = `On track — goal hit by ${projectedGoalTime}`;
  } else if (goalHitByEnd) {
    onTrackAt = `On track — goal met by end of day`;
  } else {
    onTrackAt = `Will fall short by $${shortfallAmount.toLocaleString()}`;
  }

  // Recommendations
  const recommendations = buildRecommendations(blocks, scheduledTotal, dailyGoal, blockTypes, provider);

  return {
    providerId,
    dailyGoal,
    scheduledTotal,
    cumulativeByHour,
    projectedGoalTime,
    goalHitByEnd,
    onTrackAt,
    shortfallAmount,
    recommendations,
  };
}

function buildRecommendations(
  blocks: Array<{ startMin: number; endMin: number; production: number; label: string }>,
  scheduledTotal: number,
  dailyGoal: number,
  blockTypes: BlockTypeInput[],
  provider?: ProviderInput
): string[] {
  const recs: string[] = [];
  if (scheduledTotal >= dailyGoal) return recs;

  const gap = dailyGoal - scheduledTotal;

  // Find highest-production block types applicable to this role
  const role = provider?.role ?? 'DOCTOR';
  const eligibleBTs = blockTypes.filter(
    bt => bt.minimumAmount && bt.minimumAmount > 0 &&
      (bt.appliesToRole === 'BOTH' || bt.appliesToRole === role)
  ).sort((a, b) => (b.minimumAmount ?? 0) - (a.minimumAmount ?? 0));

  if (eligibleBTs.length > 0) {
    const top = eligibleBTs[0];
    const topAmount = top.minimumAmount ?? 0;
    if (topAmount > 0) {
      const needed = Math.ceil(gap / topAmount);
      const pm = provider?.lunchEnd ? parseToMinutes(provider.lunchEnd) : 13 * 60;
      recs.push(`Add ${needed} ${top.label} at ${minutesToAmPm(pm)} to close the $${gap.toLocaleString()} gap`);
    }
  }

  if (gap > 0 && gap <= 500) {
    recs.push(`Schedule one additional restorative appointment to bridge the $${gap.toLocaleString()} shortfall`);
  } else if (gap > 500 && gap <= 2000) {
    recs.push(`Consider a high-production procedure (crown, bridge) in the afternoon to reach goal`);
  } else if (gap > 2000) {
    recs.push(`Schedule is significantly under goal — review provider block type mix`);
  }

  return recs;
}

// ─── Multi-provider convenience ─────────────────────────────────────────────────

export function calculateAllProvidersPacing(
  providers: ProviderInput[],
  slots: TimeSlotOutput[],
  blockTypes: BlockTypeInput[]
): PacingResult[] {
  return providers.map(p =>
    calculateGoalPacing(p.id, p.dailyGoal, slots, blockTypes, p)
  );
}
