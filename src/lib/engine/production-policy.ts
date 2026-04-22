/**
 * production-policy.ts — Sprint 1
 *
 * Four production-target policies per Bible §4. Each policy defines how daily
 * goal should be distributed across the schedule:
 *
 *   JAMESON_50         — 50% of daily production from "primary" (Rock) blocks
 *                        scheduled in the first half of the day (Jameson Mgmt).
 *   LEVIN_60           — 60-65% of production in the morning window (Levin Group).
 *   FARRAN_75_BY_NOON  — 75-80% of primary production before the lunch cutoff
 *                        (Dr. Howard Farran / Burkhart Associates).
 *   CUSTOM             — caller-supplied targetPrimaryPct / morningShare / cutoff.
 *
 * The policy object gives the RSW block-mix selector and morning-load enforcer
 * a single source of truth. `pickBlockMixForGoal()` returns the recommended
 * count per tier (ROCK/SAND/WATER) for a provider's daily goal given the policy.
 */

import type { ProductionTargetPolicy } from './types';

export interface PolicyParams {
  /** 0..1 — fraction of production that should come from primary (Rock) blocks */
  readonly targetPrimaryPct: number;
  /** Minute-of-day cutoff that separates morning from afternoon, if set */
  readonly morningCutoffMin?: number;
  /** 0..1 — fraction of production that should land before morningCutoffMin */
  readonly morningSharePct?: number;
  /** Minimum number of protected Rock blocks required per half-day */
  readonly protectedRockBlocks?: { am: number; pm: number };
  /** Short human-readable name for the policy (for telemetry / UI) */
  readonly label: string;
}

/** Canonical noon cutoff — 12:00 = 720 minutes from midnight. */
export const NOON_MIN = 12 * 60;

/** Canonical 11:30 lunch cutoff (some practices) = 690 minutes. */
export const LUNCH_CUTOFF_1130 = 11 * 60 + 30;

export const POLICIES: Record<ProductionTargetPolicy, PolicyParams> = {
  JAMESON_50: {
    label: 'Jameson 50/50',
    targetPrimaryPct: 0.5,
    morningCutoffMin: NOON_MIN,
    morningSharePct: 0.5,
    protectedRockBlocks: { am: 1, pm: 1 },
  },
  LEVIN_60: {
    label: 'Levin 60/40',
    targetPrimaryPct: 0.6,
    morningCutoffMin: NOON_MIN,
    morningSharePct: 0.625, // mid of 60-65% band
    protectedRockBlocks: { am: 2, pm: 1 },
  },
  FARRAN_75_BY_NOON: {
    label: 'Farran 75/25 by Noon',
    targetPrimaryPct: 0.75,
    morningCutoffMin: NOON_MIN,
    morningSharePct: 0.775, // mid of 75-80% band
    protectedRockBlocks: { am: 2, pm: 1 },
  },
  CUSTOM: {
    label: 'Custom',
    targetPrimaryPct: 0.5,
    morningCutoffMin: NOON_MIN,
    morningSharePct: 0.5,
    protectedRockBlocks: { am: 1, pm: 1 },
  },
};

/** Returns the canonical params for a given policy tag. */
export function getPolicy(policy: ProductionTargetPolicy): PolicyParams {
  return POLICIES[policy];
}

export interface BlockMixTarget {
  rockCount: number;
  sandCount: number;
  waterCount: number;
  /** Dollars expected from the rock tier given the distribution */
  rockDollars: number;
  /** Dollars expected from the sand tier */
  sandDollars: number;
  /** Dollars expected from the water tier */
  waterDollars: number;
  /** Policy params applied */
  policy: PolicyParams;
  /** Warnings (e.g. daily goal unreachable given slot count) */
  warnings: string[];
}

export interface PickMixArgs {
  dailyGoal: number;
  /** Usually derived from BlockType catalog — typical Rock block $, Sand block $, Water block $ */
  rockAvgDollars: number;
  sandAvgDollars: number;
  waterAvgDollars?: number;
  /** Total available slots for this provider (caps the total block count) */
  maxBlocks: number;
  policy: ProductionTargetPolicy;
  /** Optional override of policy params */
  overrides?: Partial<PolicyParams>;
}

/**
 * Compute a target block-count mix that satisfies the policy's
 * targetPrimaryPct given the daily goal. Returns integer counts rounded to
 * ceil (so total dollars ≥ goal when the policy is achievable).
 *
 * Example — dailyGoal=5000, JAMESON_50, rockAvg=1500, sandAvg=400:
 *   primary (rock) target = 0.5 * 5000 = 2500 → ceil(2500/1500) = 2 rock blocks → 3000
 *   remaining = 5000 - 3000 = 2000 → ceil(2000/400) = 5 sand blocks → 2000
 *   total blocks = 7
 */
export function pickBlockMixForGoal(args: PickMixArgs): BlockMixTarget {
  const base = getPolicy(args.policy);
  const policy: PolicyParams = { ...base, ...(args.overrides ?? {}) };
  const warnings: string[] = [];

  const primaryGoal = args.dailyGoal * policy.targetPrimaryPct;
  const secondaryGoal = args.dailyGoal - primaryGoal;

  // Rock count — ceil to meet/exceed primary goal
  const rockAvg = Math.max(1, args.rockAvgDollars);
  const rockCount = Math.ceil(primaryGoal / rockAvg);
  const rockDollars = rockCount * rockAvg;

  // Sand count — ceil to meet/exceed secondary goal
  const sandAvg = Math.max(1, args.sandAvgDollars);
  const sandCount = Math.ceil(secondaryGoal / sandAvg);
  const sandDollars = sandCount * sandAvg;

  // Water — only if there's room
  const waterAvg = args.waterAvgDollars ?? 0;
  const blocksUsed = rockCount + sandCount;
  let waterCount = 0;
  let waterDollars = 0;
  if (waterAvg > 0 && blocksUsed < args.maxBlocks) {
    waterCount = args.maxBlocks - blocksUsed;
    waterDollars = waterCount * waterAvg;
  }

  if (blocksUsed > args.maxBlocks) {
    warnings.push(
      `Block mix requires ${blocksUsed} blocks but only ${args.maxBlocks} slots available — goal unreachable at this policy`
    );
  }

  const actualPrimaryPct = rockDollars / Math.max(1, rockDollars + sandDollars + waterDollars);
  if (Math.abs(actualPrimaryPct - policy.targetPrimaryPct) > 0.1) {
    warnings.push(
      `Primary share ${(actualPrimaryPct * 100).toFixed(0)}% drifts from target ${(policy.targetPrimaryPct * 100).toFixed(0)}% (block averages don't divide cleanly)`
    );
  }

  return {
    rockCount,
    sandCount,
    waterCount,
    rockDollars,
    sandDollars,
    waterDollars,
    policy,
    warnings,
  };
}

/**
 * Helper — is a minute-of-day in the morning half according to the policy?
 */
export function isMorningMinute(min: number, policy: ProductionTargetPolicy): boolean {
  const p = getPolicy(policy);
  const cutoff = p.morningCutoffMin ?? NOON_MIN;
  return min < cutoff;
}
