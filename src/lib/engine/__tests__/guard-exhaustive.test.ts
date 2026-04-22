/**
 * Phase 4 — Guard-exhaustive regression shield.
 *
 * Asserts that across all 6 golden fixtures, the engine produces ZERO HARD
 * violations for the anti-patterns that Sprint 3 flagged as known issues
 * (AP-8 lunch D-band, AP-15 same-op overlap) — plus the structural gates
 * (AP-1, AP-6, AP-13, AP-14) that must never regress.
 *
 * The golden-templates test asserts "under hardCeiling" (currently 0 for
 * all 6). This file asserts per-guard exact counts so a new HARD AP-8 or
 * AP-15 cannot sneak in under a combined ceiling.
 *
 * This is a permanent regression shield — do not relax these expectations
 * without also changing the Anti-Pattern Guard definitions (Bible §9).
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../generator';
import type { GenerationResult } from '../types';

import { smileNmMonday } from './golden-templates/smile-nm-monday.fixture';
import { smileNmTuesday } from './golden-templates/smile-nm-tuesday.fixture';
import { smileNmWednesday } from './golden-templates/smile-nm-wednesday.fixture';
import { smileNmThursday } from './golden-templates/smile-nm-thursday.fixture';
import { smileNmFriday } from './golden-templates/smile-nm-friday.fixture';
import { smileCascadeMonday } from './golden-templates/smile-cascade-monday.fixture';

const FIXTURES = [
  smileNmMonday,
  smileNmTuesday,
  smileNmWednesday,
  smileNmThursday,
  smileNmFriday,
  smileCascadeMonday,
];

/**
 * Guards that must NEVER produce a HARD violation on a golden fixture. If
 * one does, it is a real engine bug (not a golden drift) and must be fixed
 * at the engine level, not by adjusting this test.
 */
const ZERO_HARD_GUARDS = ['AP-1', 'AP-6', 'AP-8', 'AP-13', 'AP-14', 'AP-15'] as const;

function countHardByAp(result: GenerationResult, ap: string): number {
  const report = result.guardReport;
  if (!report) return 0;
  return report.violations.filter((v) => v.ap === ap && v.severity === 'HARD').length;
}

describe.each(FIXTURES)('guard-exhaustive: $name', (fixture) => {
  let result: GenerationResult;

  it('generates a guard report', () => {
    result = generateSchedule(fixture.input);
    expect(result.guardReport).toBeTruthy();
  });

  it.each(ZERO_HARD_GUARDS)('has zero HARD %s violations', (ap) => {
    result ??= generateSchedule(fixture.input);
    const count = countHardByAp(result, ap);
    const msgs = (result.guardReport?.violations ?? [])
      .filter((v) => v.ap === ap && v.severity === 'HARD')
      .map((v) => v.message);
    expect(count, `${fixture.name} ${ap} HARD violations: ${msgs.join('; ')}`).toBe(0);
  });

  it('has zero HARD violations overall', () => {
    result ??= generateSchedule(fixture.input);
    const hard = result.guardReport?.counts.hard ?? 0;
    const msgs = (result.guardReport?.violations ?? [])
      .filter((v) => v.severity === 'HARD')
      .map((v) => `[${v.ap}] ${v.message}`);
    expect(hard, `${fixture.name} HARD violations: ${msgs.join('; ')}`).toBe(0);
  });
});

describe('guard-exhaustive: robustness across seed variations', () => {
  // Run every fixture at 8 different seeds to catch non-deterministic regressions.
  // If any seed produces an AP-8 or AP-15 HARD violation, we catch it here
  // instead of waiting for the one seed-path in goldens to trip.
  const seedOffsets = [0x1000, 0x2000, 0x3000, 0x4000, 0x5000, 0x6000, 0x7000, 0x8000];

  it.each(FIXTURES)('$name — zero HARD AP-8/AP-15 across 8 seed variations', (fixture) => {
    for (const offset of seedOffsets) {
      const seed = (fixture.input.seed ?? 0) + offset;
      const result = generateSchedule({ ...fixture.input, seed });
      const ap8 = countHardByAp(result, 'AP-8');
      const ap15 = countHardByAp(result, 'AP-15');
      expect(
        ap8,
        `${fixture.name} seed=0x${seed.toString(16)} AP-8 HARD count`,
      ).toBe(0);
      expect(
        ap15,
        `${fixture.name} seed=0x${seed.toString(16)} AP-15 HARD count`,
      ).toBe(0);
    }
  });
});
