/**
 * Patient Flow Simulation Engine (Sprint 15 Task 2)
 * Monte Carlo simulation for a provider's schedule.
 * 100 runs → P50/P90 completion times, expected patient count, bottleneck slot.
 */

import type { GenerationResult, ProviderInput, BlockTypeInput } from './types';

export interface PatientFlowResult {
  providerId: string;
  providerName: string;
  expectedPatients: number;
  p50EndTime: string; // "5:00 PM"
  p90EndTime: string; // "5:30 PM"
  scheduledEndTime: string; // "5:00 PM"
  runLongWarning: boolean; // P90 > scheduledEnd + 30 min
  bottleneck: {
    blockLabel: string;
    time: string;
    reason: string;
  } | null;
}

/** Variance profile per block label keyword (minutes ± from nominal duration) */
const VARIANCE_MAP: { pattern: RegExp; variance: number; patientCount: number }[] = [
  { pattern: /crown|bridge|veneer|onlay|inlay|implant/i, variance: 15, patientCount: 1 },
  { pattern: /root canal|endo|rct/i, variance: 20, patientCount: 1 },
  { pattern: /new patient|np\b|comp.*exam/i, variance: 20, patientCount: 1 },
  { pattern: /hygiene|prophy|cleaning/i, variance: 5, patientCount: 1 },
  { pattern: /srp|perio|scaling/i, variance: 10, patientCount: 1 },
  { pattern: /extract|surgery|oral surg/i, variance: 15, patientCount: 1 },
  { pattern: /filling|composite|amalgam|buildup|build-up/i, variance: 10, patientCount: 1 },
  { pattern: /emergency|limited|access|palliative/i, variance: 10, patientCount: 1 },
  { pattern: /consult|exam/i, variance: 10, patientCount: 1 },
];

function getVarianceProfile(label: string): { variance: number; patientCount: number } {
  for (const entry of VARIANCE_MAP) {
    if (entry.pattern.test(label)) {
      return { variance: entry.variance, patientCount: entry.patientCount };
    }
  }
  return { variance: 10, patientCount: 1 };
}

/** Simple seeded LCG random number generator for deterministic tests */
export class SeededRandom {
  private seed: number;
  constructor(seed = 42) {
    this.seed = seed;
  }
  next(): number {
    // LCG parameters from Numerical Recipes
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }
}

/** Parse a time string like "8:00 AM" or "07:00" to minutes from midnight */
function parseTimeToMinutes(time: string): number {
  // Handle HH:MM format
  const hmMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    return parseInt(hmMatch[1]) * 60 + parseInt(hmMatch[2]);
  }
  // Handle "8:00 AM" / "5:00 PM" format
  const ampmMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1]);
    const m = parseInt(ampmMatch[2]);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  return 0;
}

/** Format minutes from midnight to "H:MM AM/PM" */
function minutesToTimeString(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

interface BlockRun {
  label: string;
  time: string;
  startMin: number;
  nominalDuration: number; // minutes
  variance: number;
  patientCount: number;
  isBreak: boolean;
}

/**
 * Simulate patient flow for a single provider on a single day.
 * @param providerId - Provider's ID
 * @param providerName - Provider's display name
 * @param schedule - Full day schedule result
 * @param timeIncrement - Office time increment in minutes
 * @param runs - Monte Carlo run count (default 100)
 * @param rng - Optional seeded RNG for deterministic tests
 */
export function simulatePatientFlow(
  providerId: string,
  providerName: string,
  schedule: GenerationResult,
  timeIncrement: number = 10,
  runs: number = 100,
  rng?: SeededRandom
): PatientFlowResult {
  const random = rng ?? new SeededRandom(42);

  // ─── Collect this provider's blocks ─────────────────────────────────────
  // Group consecutive slots into blocks by blockInstanceId or by label+providerId
  const providerSlots = schedule.slots.filter(
    s => s.providerId === providerId && !s.isBreak && s.blockLabel
  );

  // Group by blockInstanceId (or by label+startTime)
  const blockMap = new Map<string, { label: string; time: string; slotCount: number }>();
  for (const slot of providerSlots) {
    const key = slot.blockInstanceId ?? `${slot.blockLabel}-${slot.time}`;
    if (!blockMap.has(key)) {
      blockMap.set(key, { label: slot.blockLabel!, time: slot.time, slotCount: 0 });
    }
    blockMap.get(key)!.slotCount++;
  }

  const blockRuns: BlockRun[] = [];
  for (const block of blockMap.values()) {
    const nominalDuration = block.slotCount * timeIncrement;
    const { variance, patientCount } = getVarianceProfile(block.label);
    const startMin = parseTimeToMinutes(block.time);
    blockRuns.push({
      label: block.label,
      time: block.time,
      startMin,
      nominalDuration,
      variance,
      patientCount,
      isBreak: false,
    });
  }

  if (blockRuns.length === 0) {
    // Provider has no blocks — return zeroed result
    const scheduledEnd = getScheduledEndTime(schedule, providerId);
    return {
      providerId,
      providerName,
      expectedPatients: 0,
      p50EndTime: scheduledEnd,
      p90EndTime: scheduledEnd,
      scheduledEndTime: scheduledEnd,
      runLongWarning: false,
      bottleneck: null,
    };
  }

  // Sort blocks by start time
  blockRuns.sort((a, b) => a.startMin - b.startMin);

  // ─── Monte Carlo simulation ──────────────────────────────────────────────
  const completionTimes: number[] = [];
  const blockVarianceTotals = new Array(blockRuns.length).fill(0);

  for (let run = 0; run < runs; run++) {
    let cursor = blockRuns[0].startMin; // start time of first block
    let totalPatients = 0;

    for (let i = 0; i < blockRuns.length; i++) {
      const block = blockRuns[i];
      // If cursor is behind the block's start, advance to block start
      cursor = Math.max(cursor, block.startMin);
      // Apply random variance: uniform ±variance
      const delta = (random.next() * 2 - 1) * block.variance;
      const actualDuration = Math.max(timeIncrement, block.nominalDuration + delta);
      blockVarianceTotals[i] += Math.abs(delta);
      totalPatients += block.patientCount;
      cursor += actualDuration;
    }

    completionTimes.push(cursor);
  }

  // ─── Statistics ──────────────────────────────────────────────────────────
  completionTimes.sort((a, b) => a - b);
  const p50 = completionTimes[Math.floor(runs * 0.5)];
  const p90 = completionTimes[Math.floor(runs * 0.9)];
  const avgPatients = blockRuns.reduce((s, b) => s + b.patientCount, 0);

  // Determine bottleneck: block with highest variance×production impact
  let bottleneckIdx = 0;
  let maxVariance = -1;
  for (let i = 0; i < blockRuns.length; i++) {
    const score = blockVarianceTotals[i] / runs;
    if (score > maxVariance) {
      maxVariance = score;
      bottleneckIdx = i;
    }
  }

  const bottleneckBlock = blockRuns[bottleneckIdx];
  const scheduledEnd = getScheduledEndTime(schedule, providerId);
  const scheduledEndMin = parseTimeToMinutes(scheduledEnd);
  const runLongWarning = p90 > scheduledEndMin + 30;

  return {
    providerId,
    providerName,
    expectedPatients: avgPatients,
    p50EndTime: minutesToTimeString(Math.round(p50)),
    p90EndTime: minutesToTimeString(Math.round(p90)),
    scheduledEndTime: scheduledEnd,
    runLongWarning,
    bottleneck: maxVariance > 5 ? {
      blockLabel: bottleneckBlock.label,
      time: bottleneckBlock.time,
      reason: `High variance procedure (+/-${Math.round(getVarianceProfile(bottleneckBlock.label).variance)} min)`,
    } : null,
  };
}

/** Extract scheduled end time for a provider from the last non-break block */
function getScheduledEndTime(schedule: GenerationResult, providerId: string): string {
  const providerSlots = schedule.slots.filter(s => s.providerId === providerId);
  if (providerSlots.length === 0) return '5:00 PM';

  let lastMin = 0;
  for (const slot of providerSlots) {
    const m = parseTimeToMinutes(slot.time);
    if (m > lastMin) lastMin = m;
  }
  // Add one slot increment (assume 10 min if unknown)
  return minutesToTimeString(lastMin + 10);
}

/**
 * Run simulation for all providers in a schedule.
 * Returns one PatientFlowResult per unique provider.
 */
export function simulateAllProviders(
  schedule: GenerationResult,
  providers: ProviderInput[],
  timeIncrement: number = 10,
  runs: number = 100,
  rng?: SeededRandom
): PatientFlowResult[] {
  const results: PatientFlowResult[] = [];
  for (const provider of providers) {
    const result = simulatePatientFlow(
      provider.id,
      provider.name,
      schedule,
      timeIncrement,
      runs,
      rng
    );
    results.push(result);
  }
  return results;
}
