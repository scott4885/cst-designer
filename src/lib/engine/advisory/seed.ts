/**
 * Sprint 5 — Advisory seed helper (Phase 7 determinism fix).
 *
 * Before Phase 7: the advisory route called `generateSchedule()` without a
 * seed, so every `POST /api/offices/:id/advisory` produced different
 * `productionSummary.actualScheduled` values. That cascaded into
 * `weeklyProductionRatio`, the executive-summary narrative, and variant
 * `headlineKpis.productionTotal` — Sprint 5 DoD called for byte-stable
 * output and the gate regressed.
 *
 * After Phase 7: both the main advisory generator and the three-variant
 * generator derive a stable seed from (officeId, variantCode, dayOfWeek)
 * via this shared helper. Same inputs → same seed → same engine output →
 * byte-identical JSON on every POST.
 *
 * Tested in `src/lib/engine/advisory/__tests__/determinism.test.ts`.
 */

import { hashSeed } from '../rng';

/**
 * Variant code used by the advisory seed.
 *
 * - 'MAIN'     → the office's live template (advisory route main path)
 * - 'GROWTH'   → Growth variant
 * - 'ACCESS'   → Access variant
 * - 'BALANCED' → Balanced variant
 */
export type AdvisorySeedVariant = 'MAIN' | 'GROWTH' | 'ACCESS' | 'BALANCED';

/**
 * Derive a stable engine seed for an advisory run.
 *
 * Signature is `(officeId, variantCode, dayOfWeek)`. The dayOfWeek axis
 * matters because the generator is day-scoped — every day needs its own
 * deterministic seed so that shuffling the day order doesn't cascade into
 * different week-totals.
 *
 * @param officeId      stable identifier for the office row
 * @param variant       'MAIN' for the live template or a VariantCode
 * @param dayOfWeek     normalized 3-letter day (MON/TUE/.../FRI)
 * @returns 32-bit unsigned integer suitable for `createSeededRng()`
 */
export function advisorySeed(
  officeId: string,
  variant: AdvisorySeedVariant,
  dayOfWeek: string,
): number {
  return hashSeed(`advisory:${officeId}:${variant}:${dayOfWeek}`);
}
