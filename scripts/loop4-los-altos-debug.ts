/**
 * Dump every AM/PM slot for Los Altos to understand why 0 swaps.
 */

import { GOLDEN_OFFICES } from '../src/lib/mock-data';
import { generateSchedule } from '../src/lib/engine/generator';
import { hashSeed } from '../src/lib/engine/rng';
import {
  toMinutes,
  buildProviderSlotMap,
  getProviderOpSlots,
  getLunchMidpoint,
} from '../src/lib/engine/slot-helpers';

const office = GOLDEN_OFFICES.find(o => /los altos/i.test(o.name))!;
const providers = office.providers ?? [];
const blockTypes = office.blockTypes ?? [];
const seed = hashSeed(`${office.id}:${office.name}:MONDAY`);
const result = generateSchedule({
  providers,
  blockTypes,
  rules: office.rules!,
  timeIncrement: office.timeIncrement,
  dayOfWeek: 'MONDAY',
  seed,
});

const psMap = buildProviderSlotMap(result.slots, providers);
const doctors = providers.filter(p => p.role === 'DOCTOR');

for (const doc of doctors) {
  const opSlotsList = getProviderOpSlots(psMap, doc.id);
  for (const ps of opSlotsList) {
    const boundary = getLunchMidpoint(doc);
    const idxs = ps.indices;
    console.log(
      `\n${doc.name}::${ps.operatory}  lunch=${Math.floor(boundary / 60)}:${String(boundary % 60).padStart(2, '0')}`
    );
    for (const idx of idxs) {
      const s = result.slots[idx];
      const min = toMinutes(s.time);
      const pm = min >= boundary ? 'PM' : 'AM';
      const content = s.isBreak ? '~~~LUNCH~~~' : (s.blockLabel ?? '(empty)');
      const instId = s.blockInstanceId ? ` [${s.blockInstanceId}]` : '';
      console.log(`  ${pm} ${s.time}  ${content}${instId}`);
    }
  }
}
