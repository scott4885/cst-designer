/**
 * Sprint 3 — Golden fixture: SMILE NM Friday.
 *
 * The extracted Excel Friday sheet has a 31st column (one extra hygienist)
 * on this day; our fixture uses the standard 5-provider config since the
 * test is about invariants, not exact column-count reproduction.
 */

import type { GenerationInput } from '../../types';
import {
  smileBlockTypes,
  smileNmProviders,
  rulesDefaults,
} from './_shared';
import type { GoldenFixture } from './smile-nm-monday.fixture';

export const smileNmFriday: GoldenFixture = {
  name: 'SMILE NM — Friday',
  dayCode: 'FRI',
  input: {
    providers: smileNmProviders(),
    blockTypes: smileBlockTypes(),
    rules: rulesDefaults(),
    timeIncrement: 10,
    dayOfWeek: 'FRIDAY',
    seed: 0x5A17E500,
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
