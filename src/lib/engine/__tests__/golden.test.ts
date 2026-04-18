/**
 * Golden-schedule regression harness — Loop 1 foundation.
 *
 * For each of 5 canonical offices × 5 weekdays (Mon–Fri) we generate a
 * deterministic schedule (seeded RNG) and snapshot a compact set of
 * scalar/structured properties that collectively describe schedule
 * "shape" without being swamped by per-slot noise.
 *
 * When an engine change legitimately moves a number (Loops 2-5), run:
 *   npm run goldens:update
 * …inspect the diff, and commit. When a change is UNINTENDED, the diff
 * fails CI and tells you exactly which office/day regressed.
 *
 * The snapshotted shape intentionally covers every KPI that Loops 2-5
 * will touch:
 *   - qualityScore (total + component breakdown)
 *   - production per provider per op (rounded to nearest $100)
 *   - block-category distribution (count per category)
 *   - stagger-conflict count (hard conflicts from conflict-detector)
 *   - d-time conflict count (countDTimeOverlaps)
 *   - clinical-warning count (by severity)
 *   - morning-load ratio (% of production before lunch)
 *
 * Scalars are rounded, objects are key-sorted — diffs stay human-readable.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../generator';
import { generateScheduleWithRetry } from '../retry-envelope';
import { hashSeed } from '../rng';
import { calculateQualityScore } from '../quality-score';
import { validateClinicalRules } from '../clinical-rules';
import { detectAllConflicts, isScheduleClean } from '../conflict-detector';
import { countDTimeOverlaps } from '../stagger-resolver';
import { categorizeLabel } from '../block-categories';
import { toMinutes } from '../slot-helpers';
import { parseAmountFromLabel } from '../slot-helpers';
import { GOLDEN_OFFICES } from '@/lib/mock-data';
import type { TimeSlotOutput, BlockTypeInput, ProviderInput } from '../types';

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a number to the nearest $100 to keep snapshots insensitive to noise. */
function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

/** Round to 2 decimals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sort object keys alphabetically — produces stable snapshot output. */
function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return sorted as T;
}

/**
 * Resolve per-block production dollars for a slot, mirroring the engine's
 * production-calculator behavior: prefer the block's customProductionAmount,
 * fall back to blockType.minimumAmount, then parseAmountFromLabel.
 */
function slotBlockAmount(slot: TimeSlotOutput, blockTypes: BlockTypeInput[]): number {
  if (slot.customProductionAmount != null) return slot.customProductionAmount;
  const bt = blockTypes.find(b => b.id === slot.blockTypeId);
  if (!bt) return 0;
  if (bt.minimumAmount != null) return bt.minimumAmount;
  return parseAmountFromLabel(bt.label);
}

/**
 * Compute the production-weighted block-category distribution.
 * Returns `{ category: blockCount }` based on unique block placements
 * (collapsed by blockInstanceId so a multi-slot block counts once).
 */
function blockCategoryDistribution(slots: TimeSlotOutput[]): Record<string, number> {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const slot of slots) {
    if (slot.isBreak || !slot.blockTypeId || !slot.blockLabel) continue;
    const key = `${slot.providerId}::${slot.operatory}::${slot.blockInstanceId ?? slot.time}::${slot.blockTypeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cat = categorizeLabel(slot.blockLabel);
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return sortKeys(counts);
}

/**
 * Morning-load ratio: fraction of scheduled production placed before
 * each provider's lunch start. When a provider has no lunch, we use
 * 12:00 as the conventional AM/PM boundary.
 */
function morningLoadRatio(
  slots: TimeSlotOutput[],
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): number {
  let morning = 0;
  let total = 0;
  const seen = new Set<string>();
  const providerById = new Map(providers.map(p => [p.id, p] as const));

  for (const slot of slots) {
    if (slot.isBreak || !slot.blockTypeId) continue;
    // Only count the *first* slot of a block instance to avoid double-counting
    const key = `${slot.providerId}::${slot.operatory}::${slot.blockInstanceId ?? slot.time}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const amount = slotBlockAmount(slot, blockTypes);
    if (amount <= 0) continue;

    const provider = providerById.get(slot.providerId);
    const boundary = provider?.lunchStart ?? '12:00';
    const isAm = toMinutes(slot.time) < toMinutes(boundary);

    total += amount;
    if (isAm) morning += amount;
  }

  if (total <= 0) return 0;
  return round2(morning / total);
}

/**
 * Production totals per provider per operatory, rounded to nearest $100.
 * Keyed as "providerId::operatory" for sorted, stable output.
 */
function productionByProviderOp(
  slots: TimeSlotOutput[],
  blockTypes: BlockTypeInput[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  const seen = new Set<string>();
  for (const slot of slots) {
    if (slot.isBreak || !slot.blockTypeId) continue;
    const key = `${slot.providerId}::${slot.operatory}::${slot.blockInstanceId ?? slot.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const amount = slotBlockAmount(slot, blockTypes);
    if (amount <= 0) continue;
    const bucket = `${slot.providerId}::${slot.operatory}`;
    totals[bucket] = (totals[bucket] ?? 0) + amount;
  }
  const rounded: Record<string, number> = {};
  for (const k of Object.keys(totals).sort()) rounded[k] = round100(totals[k]);
  return rounded;
}

/**
 * Build the full summary object that gets snapshotted for one
 * (office, day) pair. All values are normalized/rounded/sorted so
 * diffs highlight only meaningful deltas.
 */
function summarizeRun(
  office: (typeof GOLDEN_OFFICES)[number],
  day: string
): Record<string, unknown> {
  const providers = office.providers ?? [];
  const blockTypes = office.blockTypes ?? [];
  const rules = office.rules!;

  // Deterministic seed: stable across runs, unique per (office, day)
  const seed = hashSeed(`${office.id}:${office.name}:${day}`);

  const schedule = generateSchedule({
    providers,
    blockTypes,
    rules,
    timeIncrement: office.timeIncrement,
    dayOfWeek: day,
    seed,
  });

  const clinicalWarnings = validateClinicalRules(schedule, providers, blockTypes);
  const quality = calculateQualityScore(schedule, providers, blockTypes, clinicalWarnings);
  const conflicts = detectAllConflicts(schedule, providers, blockTypes);
  const dTimeOverlaps = countDTimeOverlaps(schedule.slots, providers);

  const clinicalBySeverity = {
    error: clinicalWarnings.filter(w => w.severity === 'error').length,
    warning: clinicalWarnings.filter(w => w.severity === 'warning').length,
    info: clinicalWarnings.filter(w => w.severity === 'info').length,
  };

  const conflictsBySeverity = {
    error: conflicts.filter(c => c.severity === 'error').length,
    warning: conflicts.filter(c => c.severity === 'warning').length,
  };

  return sortKeys({
    qualityScore: {
      total: quality.total,
      tier: quality.tier,
      components: quality.components.map(c => ({
        label: c.label,
        score: c.score,
        maxScore: c.maxScore,
      })),
    },
    productionByProviderOp: productionByProviderOp(schedule.slots, blockTypes),
    blockCategoryDistribution: blockCategoryDistribution(schedule.slots),
    staggerConflicts: conflicts.filter(c => c.category === 'DOUBLE_BOOKING').length,
    dTimeConflicts: dTimeOverlaps,
    clinicalWarnings: sortKeys(clinicalBySeverity),
    conflictsBySeverity: sortKeys(conflictsBySeverity),
    morningLoadRatio: morningLoadRatio(schedule.slots, providers, blockTypes),
    cleanSchedule: isScheduleClean(conflicts),
  });
}

// ---------------------------------------------------------------------------
// Tests — one per office, asserting all 5 weekdays in a single snapshot
// ---------------------------------------------------------------------------

describe('Golden schedule regression harness', () => {
  it('covers exactly 5 offices × 5 weekdays', () => {
    expect(GOLDEN_OFFICES).toHaveLength(5);
    expect(WEEKDAYS).toHaveLength(5);
  });

  for (const office of GOLDEN_OFFICES) {
    describe(`${office.name} (${office.id})`, () => {
      it('matches golden snapshot for all weekdays', () => {
        const byDay: Record<string, unknown> = {};
        for (const day of WEEKDAYS) {
          byDay[day] = summarizeRun(office, day);
        }
        expect(sortKeys(byDay)).toMatchSnapshot();
      });

      it('produces identical output on two back-to-back runs (determinism guard)', () => {
        const first = summarizeRun(office, 'MONDAY');
        const second = summarizeRun(office, 'MONDAY');
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      });
    });
  }

  // ---------------------------------------------------------------------
  // Loop 2 — retry envelope snapshot. One representative office (CDT
  // Comfort) proves that the retry telemetry is deterministic across runs
  // and that the retry path itself is reproducible. The existing 25
  // single-shot goldens above remain unchanged.
  // ---------------------------------------------------------------------
  describe('retry envelope (Loop 2)', () => {
    const cdt = GOLDEN_OFFICES.find(o => /cdt/i.test(o.name)) ?? GOLDEN_OFFICES[2];

    function summarizeRetryRun(day: string): Record<string, unknown> {
      const providers = cdt.providers ?? [];
      const blockTypes = cdt.blockTypes ?? [];
      const rules = cdt.rules!;
      const seed = hashSeed(`retry:${cdt.id}:${cdt.name}:${day}`);

      const { schedule, qualityScore, metadata } = generateScheduleWithRetry(
        {
          providers,
          blockTypes,
          rules,
          timeIncrement: cdt.timeIncrement,
          dayOfWeek: day,
        },
        { baseSeed: seed, maxAttempts: 3, tierFloor: 'good' }
      );

      const clinicalWarnings = validateClinicalRules(schedule, providers, blockTypes);
      // Recompute quality vs the selected schedule so the snapshot is
      // self-consistent even if the wrapper's internal scorer drifts.
      const verify = calculateQualityScore(schedule, providers, blockTypes, clinicalWarnings);

      return sortKeys({
        attemptsUsed: metadata.attemptsUsed,
        floorMet: metadata.floorMet,
        maxAttempts: metadata.maxAttempts,
        tierFloor: metadata.tierFloor,
        selectedAttempt: metadata.selectedAttempt,
        allAttemptScores: metadata.allAttemptScores,
        allAttemptTiers: metadata.allAttemptTiers,
        selectedScore: qualityScore.total,
        selectedTier: qualityScore.tier,
        verifyScore: verify.total,
        verifyTier: verify.tier,
      });
    }

    it(`${cdt.name}: deterministic retry telemetry across weekdays`, () => {
      const byDay: Record<string, unknown> = {};
      for (const day of WEEKDAYS) {
        byDay[day] = summarizeRetryRun(day);
      }
      expect(sortKeys(byDay)).toMatchSnapshot();
    });

    it(`${cdt.name}: back-to-back retry runs are identical`, () => {
      const a = summarizeRetryRun('MONDAY');
      const b = summarizeRetryRun('MONDAY');
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  // ---------------------------------------------------------------------
  // Loop 5 — rationale annotation. Every engine-placed non-break slot must
  // carry a `rationale` string explaining why it was placed there. The
  // taxonomy is open-ended (new categories can appear as the engine grows)
  // so we snapshot the distribution for one representative office × day
  // (CDT Comfort Dental Monday) and assert universal coverage across the
  // full 5 × 5 golden grid.
  // ---------------------------------------------------------------------
  describe('rationale annotation (Loop 5)', () => {
    const cdtComfort = GOLDEN_OFFICES.find(o => /cdt/i.test(o.name)) ?? GOLDEN_OFFICES[1];

    it(`${cdtComfort.name} MONDAY: rationale distribution snapshot`, () => {
      const seed = hashSeed(`${cdtComfort.id}:${cdtComfort.name}:MONDAY`);
      const result = generateSchedule({
        providers: cdtComfort.providers ?? [],
        blockTypes: cdtComfort.blockTypes ?? [],
        rules: cdtComfort.rules!,
        timeIncrement: cdtComfort.timeIncrement,
        dayOfWeek: 'MONDAY',
        seed,
      });

      // Count distinct block instances by rationale (collapse multi-slot blocks)
      const seen = new Set<string>();
      const counts: Record<string, number> = {};
      for (const slot of result.slots) {
        if (slot.isBreak || !slot.blockTypeId || !slot.blockLabel) continue;
        const key = `${slot.providerId}::${slot.operatory}::${slot.blockInstanceId ?? slot.time}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const rationale = slot.rationale ?? '(none)';
        counts[rationale] = (counts[rationale] ?? 0) + 1;
      }
      expect(sortKeys(counts)).toMatchSnapshot();
    });

    it('every non-break slot has a rationale across all 5 offices × 5 weekdays', () => {
      for (const office of GOLDEN_OFFICES) {
        for (const day of WEEKDAYS) {
          const seed = hashSeed(`${office.id}:${office.name}:${day}`);
          const result = generateSchedule({
            providers: office.providers ?? [],
            blockTypes: office.blockTypes ?? [],
            rules: office.rules!,
            timeIncrement: office.timeIncrement,
            dayOfWeek: day,
            seed,
          });
          for (const slot of result.slots) {
            if (slot.isBreak) continue;
            if (slot.blockLabel === null) continue;
            if (!slot.rationale) {
              // eslint-disable-next-line no-console
              console.error(
                `  missing rationale: ${office.name} ${day} ${slot.time} provider=${slot.providerId} op=${slot.operatory} label="${slot.blockLabel}"`
              );
            }
            expect(slot.rationale).toBeTruthy();
          }
        }
      }
    });
  });

  // ---------------------------------------------------------------------
  // Loop 6 — multi-op stagger visualization conflict-map stability.
  //
  // For each multi-op doctor office (Smile Cascade, CDT Comfort, NHD
  // Ridgeview), assert that the shape of the inline conflict surface is
  // stable: we snapshot the total hard-error count + the first 5
  // "time/providerId" identifiers in lexical order. If the engine shifts a
  // conflict around the diff is surfaced; if the visualization logic
  // regresses the snapshot breaks.
  //
  // Note: we use the Monday generation of each office because it has the
  // heaviest load and the largest conflict surface in the golden fixtures.
  // ---------------------------------------------------------------------
  describe('multi-op stagger conflict map (Loop 6)', () => {
    const MULTI_OP_OFFICE_NAMES = ['Smile Cascade', 'CDT Comfort', 'NHD Ridgeview'];

    for (const officeName of MULTI_OP_OFFICE_NAMES) {
      const office = GOLDEN_OFFICES.find(o => o.name.includes(officeName));
      if (!office) continue;

      it(`${office.name}: Monday conflict-map shape is stable`, () => {
        const providers = office.providers ?? [];
        const blockTypes = office.blockTypes ?? [];
        const rules = office.rules!;
        const seed = hashSeed(`${office.id}:${office.name}:MONDAY`);

        const schedule = generateSchedule({
          providers,
          blockTypes,
          rules,
          timeIncrement: office.timeIncrement,
          dayOfWeek: 'MONDAY',
          seed,
        });

        const conflicts = detectAllConflicts(schedule, providers, blockTypes);
        const hardConflicts = conflicts.filter(c => c.severity === 'error');
        const dTimeOverlaps = countDTimeOverlaps(schedule.slots, providers);

        // Stable identifier per hard conflict. Sort lexically so the snapshot
        // is deterministic even when detectAllConflicts iteration order shifts.
        const conflictIds = hardConflicts
          .filter(c => !!c.time && !!c.providerId)
          .map(c => `${c.time}/${c.providerId}`)
          .sort();

        expect(
          sortKeys({
            hardConflictCount: hardConflicts.length,
            dTimeOverlapCount: dTimeOverlaps,
            firstFiveConflictIds: conflictIds.slice(0, 5),
          })
        ).toMatchSnapshot();
      });
    }
  });

  // ---------------------------------------------------------------------
  // Loop 4 — morning-load floor assertion. After the generator's post-fill
  // enforcer pass, the schedule-wide morning-load ratio must clear the
  // 0.70 hard-cap threshold for every office × weekday combination.
  //
  // Interpretation: 0.70 is the HARD floor (tier-cap threshold). Anything
  // below 0.70 means the enforcer failed to produce an acceptable schedule
  // and the day's score is capped at 'fair' regardless of other wins.
  //
  // Structural note: some offices (Los Altos, Smile Cascade) can't reach
  // the 0.75 swap-trigger because their AM is already fully packed with
  // mid-value blocks and there's no room to absorb PM production without
  // net-zero swaps. The enforcer does its best; the test enforces that
  // no office regresses below the true hard cap.
  //
  // Uses the generator's returned `morningLoadSwaps.scheduleRatio` (doctor
  // production only) — NOT the snapshot's whole-schedule morningLoadRatio
  // (which includes hygiene).
  // ---------------------------------------------------------------------
  describe('morning-load floor (Loop 4)', () => {
    const MORNING_LOAD_FLOOR = 0.70;

    for (const office of GOLDEN_OFFICES) {
      it(`${office.name}: all weekdays clear ${MORNING_LOAD_FLOOR * 100}% morning-load hard floor`, () => {
        for (const day of WEEKDAYS) {
          const seed = hashSeed(`${office.id}:${office.name}:${day}`);
          const result = generateSchedule({
            providers: office.providers ?? [],
            blockTypes: office.blockTypes ?? [],
            rules: office.rules!,
            timeIncrement: office.timeIncrement,
            dayOfWeek: day,
            seed,
          });
          const ratio = result.morningLoadSwaps?.scheduleRatio ?? 0;
          if (ratio < MORNING_LOAD_FLOOR) {
            // eslint-disable-next-line no-console
            console.error(
              `  ${office.name} ${day}: ratio=${(ratio * 100).toFixed(0)}% < floor=${MORNING_LOAD_FLOOR * 100}%; ` +
                `swaps=${result.morningLoadSwaps?.swaps.length ?? 0}; ` +
                `hardCap=${result.morningLoadSwaps?.hardCapViolators.length ?? 0}`
            );
          }
          expect(ratio).toBeGreaterThanOrEqual(MORNING_LOAD_FLOOR);
        }
      });
    }
  });
});
