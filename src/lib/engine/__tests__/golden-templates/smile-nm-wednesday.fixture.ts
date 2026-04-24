/**
 * Sprint 3 — Golden fixture: SMILE NM Wednesday.
 */

import type { GenerationInput } from '../../types';
import {
  smileBlockTypes,
  smileNmProviders,
  rulesDefaults,
} from './_shared';
import type { GoldenFixture } from './smile-nm-monday.fixture';

export const smileNmWednesday: GoldenFixture = {
  name: 'SMILE NM — Wednesday',
  dayCode: 'WED',
  input: {
    providers: smileNmProviders(),
    blockTypes: smileBlockTypes(),
    rules: rulesDefaults(),
    timeIncrement: 10,
    dayOfWeek: 'WEDNESDAY',
    seed: 0x5A17E300,
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
