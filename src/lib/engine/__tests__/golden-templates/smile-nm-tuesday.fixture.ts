/**
 * Sprint 3 — Golden fixture: SMILE NM Tuesday.
 *
 * Same 2-doctor / 3-RDH config as Monday; deterministic seed differs to
 * ensure each day produces a non-degenerate day-specific schedule.
 */

import type { GenerationInput } from '../../types';
import {
  smileBlockTypes,
  smileNmProviders,
  rulesDefaults,
} from './_shared';
import type { GoldenFixture } from './smile-nm-monday.fixture';

export const smileNmTuesday: GoldenFixture = {
  name: 'SMILE NM — Tuesday',
  dayCode: 'TUE',
  input: {
    providers: smileNmProviders(),
    blockTypes: smileBlockTypes(),
    rules: rulesDefaults(),
    timeIncrement: 10,
    dayOfWeek: 'TUESDAY',
    seed: 0x5A17E200,
  },
  expected: {
    hpMin: 2,
    hpMax: 10,
    hygMin: 10,
    // Post-2026-04-24 slot-aggregator fix: adjacent-split doubled counts.
    blocksMin: 40,
    blocksMax: 90,
    // Sprint 4 P0-2: per-AP known-debt ledger. Empty = zero-tolerance.
    knownHardDebt: {},
  },
};
