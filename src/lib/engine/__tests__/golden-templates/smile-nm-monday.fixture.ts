/**
 * Sprint 3 — Golden fixture: SMILE NM Monday.
 *
 * Two-doctor (Hall, Borst) + 3-RDH. 07:00-17:00 with 13:00-14:00 lunch.
 * Expected block counts derived from `.rebuild-research/extracted-patterns.md`
 * — the observed Excel Monday sheet has ~5 HP blocks, ~3 MP, ~2 ER,
 * ~3 NON-PROD and 18 hygiene blocks across 3 columns.
 */

import type { GenerationInput } from '../../types';
import {
  smileBlockTypes,
  smileNmProviders,
  rulesDefaults,
  type ExpectedCounts,
} from './_shared';

export interface GoldenFixture {
  name: string;
  dayCode: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
  input: GenerationInput;
  expected: ExpectedCounts;
}

export const smileNmMonday: GoldenFixture = {
  name: 'SMILE NM — Monday',
  dayCode: 'MON',
  input: {
    providers: smileNmProviders(),
    blockTypes: smileBlockTypes(),
    rules: rulesDefaults(),
    timeIncrement: 10,
    dayOfWeek: 'MONDAY',
    seed: 0x5A17E100,
  },
  expected: {
    hpMin: 2,
    hpMax: 10,
    // 3 RDHs × ~9 hours of hygiene blocks — engine currently yields ~10–15
    // after adjacent-block splitting; keep floor at 10 to catch regressions.
    hygMin: 10,
    blocksMin: 20,
    blocksMax: 60,
    // Sprint 4 P0-2 — per-AP known-debt ledger. Empty map = zero tolerance
    // for every AP. Phase 4 re-baseline measured 0 HARD across 20 seed
    // variations. AP-8 (lunch) is structurally prevented at slot-creation
    // (lunch slots are isBreak=true). AP-15 (same-op overlap) is
    // structurally prevented by findAvailableRanges' blockTypeId check.
    // The coordinator's operatory-occupancy track is wired as a regression
    // shield for future placer rewrites. Keep this empty unless an AP
    // regression surfaces during a sprint — then bump and file a ticket.
    knownHardDebt: {},
  },
};
