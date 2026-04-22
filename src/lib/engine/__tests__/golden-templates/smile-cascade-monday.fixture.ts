/**
 * Sprint 3 — Golden fixture: Smile Cascade Monday.
 *
 * Single-doctor (Fitzpatrick, 2 ops: OP8+OP9) + 3 RDHs. 08:00-17:00 with
 * 13:00-14:00 lunch. Daily goals smaller than SMILE NM; NP goal is 1/day.
 */

import type { GenerationInput, ScheduleRules } from '../../types';
import {
  smileBlockTypes,
  smileCascadeProviders,
} from './_shared';
import type { GoldenFixture } from './smile-nm-monday.fixture';

const cascadeRules: ScheduleRules = {
  npModel: 'HYGIENIST_ONLY',
  npBlocksPerDay: 1,
  srpBlocksPerDay: 1,
  hpPlacement: 'ANY',
  doubleBooking: true,
  matrixing: true,
  emergencyHandling: 'ACCESS_BLOCKS',
};

export const smileCascadeMonday: GoldenFixture = {
  name: 'Smile Cascade — Monday',
  dayCode: 'MON',
  input: {
    providers: smileCascadeProviders(),
    blockTypes: smileBlockTypes(),
    rules: cascadeRules,
    timeIncrement: 10,
    dayOfWeek: 'MONDAY',
    seed: 0xCA5CADE1,
  },
  expected: {
    hpMin: 0,
    hpMax: 8,
    // Cascade is a lower-volume practice; engine currently produces fewer
    // hygiene blocks than the 3×8 theoretical ceiling.
    hygMin: 3,
    blocksMin: 5,
    blocksMax: 45,
    // Sprint 4 P0-2: per-AP known-debt ledger. Empty = zero-tolerance.
    knownHardDebt: {},
  },
};
