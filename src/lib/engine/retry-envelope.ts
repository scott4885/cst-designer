/**
 * Quality-floor retry envelope — ROADMAP Loop 2.
 *
 * Wraps `generateSchedule()` with a best-of-N policy: generate → score →
 * retry with a derived seed if below the tier floor → keep the best.
 *
 * Design contract:
 *   - The core `generateSchedule()` stays a single-shot pure function.
 *     This module is a thin orchestrator that calls it N times with
 *     different seeds.
 *   - The base seed is derived from either the caller-supplied `seed`
 *     (deterministic path — golden tests) or from `Math.random()` (UI
 *     path — non-deterministic, matches legacy behavior).
 *   - Each attempt derives its own seed as `baseSeed ^ attemptHash(i)` so
 *     attempts explore different placements. Attempt 0 uses the base
 *     seed directly, preserving the single-shot snapshot for callers
 *     who don't care about retry.
 *   - Early-exit: if an attempt clears the floor, return immediately.
 *   - Keep-best: if no attempt clears the floor, return the highest
 *     scoring result with `floorMet = false`.
 *
 * @module engine/retry-envelope
 */

import type { GenerationInput, GenerationResult } from './types';
import { generateSchedule } from './generator';
import { createSeededRng, hashSeed, type RngFn } from './rng';
import { calculateQualityScore, type QualityScore, type QualityTier } from './quality-score';
import { validateClinicalRules } from './clinical-rules';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RetryMetadata {
  /** 1-indexed count of attempts actually run (1 = no retry needed). */
  attemptsUsed: number;
  /** Did any attempt clear the tier floor? */
  floorMet: boolean;
  /** Score of each attempt, in attempt order. */
  allAttemptScores: number[];
  /** Tier of each attempt, in attempt order — parallel to allAttemptScores. */
  allAttemptTiers: QualityTier[];
  /** Max attempts configured for this run. */
  maxAttempts: number;
  /** Tier floor the attempts were measured against. */
  tierFloor: QualityTier;
  /** Which attempt (1-indexed) produced the returned schedule. */
  selectedAttempt: number;
}

export interface RetryResult {
  schedule: GenerationResult;
  qualityScore: QualityScore;
  metadata: RetryMetadata;
}

export interface RetryOptions {
  /** Hard cap on attempts (default: 5). */
  maxAttempts?: number;
  /**
   * Minimum acceptable tier. Defaults to `'good'` (score ≥ 75).
   * Setting to `'needs_work'` effectively disables the retry loop.
   */
  tierFloor?: QualityTier;
  /**
   * Explicit base seed — makes the entire retry sequence deterministic.
   * If omitted, falls back to a randomly chosen 32-bit seed (UI path).
   * Golden tests should always pass this.
   */
  baseSeed?: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Numeric tier ordering — higher = better. */
const TIER_RANK: Record<QualityTier, number> = {
  needs_work: 0,
  fair: 1,
  good: 2,
  excellent: 3,
};

/**
 * Derive a unique, deterministic seed for each attempt index.
 *
 * Requirements:
 *   - Attempt 0 returns `baseSeed` unchanged (so single-shot callers
 *     observe the same snapshot as before this wrapper existed).
 *   - Later attempts must differ enough to perturb block placement.
 *     We XOR with a hashed attempt tag (not just `i`) so low attempt
 *     indices don't flip just one bit of the mulberry32 state — that
 *     can produce near-identical sequences for the first few outputs.
 */
function deriveAttemptSeed(baseSeed: number, attemptIndex: number): number {
  if (attemptIndex === 0) return baseSeed >>> 0;
  const tag = hashSeed(`retry-attempt:${attemptIndex}`);
  return (baseSeed ^ tag) >>> 0;
}

/**
 * Pick a non-deterministic base seed when the caller hasn't supplied one.
 * Uses Math.random because this is the UI path and we WANT different
 * results on each click. Callers who need determinism supply `baseSeed`.
 */
function randomBaseSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a schedule with a quality-floor retry envelope.
 *
 * This is the production-preferred entry point. For single-shot
 * deterministic behavior, set `maxAttempts: 1` or call `generateSchedule`
 * directly.
 *
 * @param input - The same input shape as `generateSchedule`. Any caller-
 *                supplied `seed` or `rng` is IGNORED here — the retry
 *                envelope owns seed derivation. Pass `opts.baseSeed`
 *                instead when you need deterministic behavior.
 * @param opts  - Retry configuration. See `RetryOptions`.
 * @returns     - The best attempt's schedule + score + retry metadata.
 */
export function generateScheduleWithRetry(
  input: GenerationInput & { activeWeek?: string },
  opts: RetryOptions = {}
): RetryResult {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 5);
  const tierFloor: QualityTier = opts.tierFloor ?? 'good';
  const baseSeed = (opts.baseSeed ?? randomBaseSeed()) >>> 0;
  const floorRank = TIER_RANK[tierFloor];

  const providers = input.providers;
  const blockTypes = input.blockTypes;

  const allScores: number[] = [];
  const allTiers: QualityTier[] = [];

  let bestScore = -Infinity;
  let bestIndex = 0;
  let bestSchedule: GenerationResult | null = null;
  let bestQuality: QualityScore | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    const attemptSeed = deriveAttemptSeed(baseSeed, i);
    const rng: RngFn = createSeededRng(attemptSeed);

    // We pass BOTH seed and rng — seed is a hint, rng is the authoritative
    // entropy source inside the generator.
    const schedule = generateSchedule({
      ...input,
      seed: attemptSeed,
      rng,
    });

    const clinicalWarnings = validateClinicalRules(schedule, providers, blockTypes);
    const quality = calculateQualityScore(schedule, providers, blockTypes, clinicalWarnings, {
      // Loop 3: mix-adherence component needs the same intensity/time-increment
      // the generator used, so it can rebuild the prescription deterministically.
      intensity: input.intensity,
      timeIncrement: input.timeIncrement,
    });

    allScores.push(quality.total);
    allTiers.push(quality.tier);

    if (quality.total > bestScore) {
      bestScore = quality.total;
      bestIndex = i;
      bestSchedule = schedule;
      bestQuality = quality;
    }

    // Early exit: we cleared the floor.
    if (TIER_RANK[quality.tier] >= floorRank) {
      return {
        schedule,
        qualityScore: quality,
        metadata: {
          attemptsUsed: i + 1,
          floorMet: true,
          allAttemptScores: allScores,
          allAttemptTiers: allTiers,
          maxAttempts,
          tierFloor,
          selectedAttempt: i + 1,
        },
      };
    }
  }

  // No attempt cleared the floor — return the best we found.
  // bestSchedule/bestQuality are guaranteed non-null because maxAttempts ≥ 1.
  return {
    schedule: bestSchedule!,
    qualityScore: bestQuality!,
    metadata: {
      attemptsUsed: maxAttempts,
      floorMet: false,
      allAttemptScores: allScores,
      allAttemptTiers: allTiers,
      maxAttempts,
      tierFloor,
      selectedAttempt: bestIndex + 1,
    },
  };
}

/**
 * Attach a retry-metadata tag to the `warnings` array so downstream
 * consumers that only read `warnings[]` (legacy code, Excel export)
 * can surface the retry context without needing a typed shape change.
 *
 * Format is stable enough to parse back:
 *   "QUALITY_RETRY: used N/M attempts, floorMet=<true|false>, scores=[a,b,c]"
 *
 * Intentionally idempotent — won't stack if called twice.
 */
export function annotateRetryWarning(
  schedule: GenerationResult,
  metadata: RetryMetadata
): GenerationResult {
  const hasTag = schedule.warnings?.some(w => w.startsWith('QUALITY_RETRY:'));
  if (hasTag) return schedule;

  const tag =
    `QUALITY_RETRY: used ${metadata.attemptsUsed}/${metadata.maxAttempts} attempts, ` +
    `floorMet=${metadata.floorMet}, ` +
    `scores=[${metadata.allAttemptScores.join(',')}]`;

  return {
    ...schedule,
    warnings: [...(schedule.warnings ?? []), tag],
  };
}
