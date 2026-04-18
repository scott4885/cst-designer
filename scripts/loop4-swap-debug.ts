/**
 * Loop 4 swap-candidate debug probe.
 * For CDT Comfort Monday, prints all PM HP and AM non-HP blocks per op
 * with their durations so we can see why swaps aren't firing.
 */

import { GOLDEN_OFFICES } from '../src/lib/mock-data';
import { generateSchedule } from '../src/lib/engine/generator';
import { hashSeed } from '../src/lib/engine/rng';
import { categorize } from '../src/lib/engine/block-categories';
import { toMinutes, parseAmountFromLabel, buildProviderSlotMap, getProviderOpSlots, getLunchMidpoint } from '../src/lib/engine/slot-helpers';
import type { BlockTypeInput } from '../src/lib/engine/types';

const office = GOLDEN_OFFICES.find(o => /cdt/i.test(o.name))!;
const providers = office.providers ?? [];
const blockTypes = office.blockTypes ?? [];

// Generate WITHOUT the morning-load enforcer: temp-disable it?
// Actually, the generator now always enforces. Let's inspect the AFTER state.
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
const btById = new Map(blockTypes.map(bt => [bt.id, bt]));

for (const doc of doctors) {
  const opSlotsList = getProviderOpSlots(psMap, doc.id);
  for (const ps of opSlotsList) {
    const boundary = getLunchMidpoint(doc);
    // Collect blocks
    const idxs = ps.indices;
    let i = 0;
    const blocks: { time: string; cat: string; dur: number; amt: number; label: string; pm: boolean }[] = [];
    while (i < idxs.length) {
      const slot = result.slots[idxs[i]];
      if (slot.isBreak || !slot.blockTypeId) { i++; continue; }
      const instanceId = slot.blockInstanceId ?? `${slot.time}-${slot.blockTypeId}`;
      const startTime = slot.time;
      let len = 1;
      const startI = i;
      i++;
      while (i < idxs.length) {
        const next = result.slots[idxs[i]];
        const nextInstanceId = next.blockInstanceId ?? `${next.time}-${next.blockTypeId}`;
        if (next.isBreak || !next.blockTypeId || nextInstanceId !== instanceId) break;
        len++;
        i++;
      }
      const bt = btById.get(slot.blockTypeId!) as BlockTypeInput | undefined;
      const amount = slot.customProductionAmount ?? bt?.minimumAmount ?? (slot.blockLabel ? parseAmountFromLabel(slot.blockLabel) : 0);
      const cat = categorize({ id: slot.blockTypeId!, label: slot.blockLabel! } as BlockTypeInput);
      const startMin = toMinutes(startTime);
      blocks.push({ time: startTime, cat, dur: len, amt: amount ?? 0, label: slot.blockLabel ?? '', pm: startMin >= boundary });
    }

    const amNonHP = blocks.filter(b => !b.pm && b.cat !== 'HP');
    const pmHP = blocks.filter(b => b.pm && b.cat === 'HP');
    if (pmHP.length === 0) continue;

    console.log(`\n${doc.name}::${ps.operatory} lunch=${Math.floor(boundary / 60)}:${String(boundary % 60).padStart(2, '0')}`);
    console.log(`  AM non-HP candidates:`);
    for (const b of amNonHP) console.log(`    ${b.time}  ${b.cat.padEnd(8)}  slots=${b.dur}  $${b.amt}  ${b.label}`);
    console.log(`  PM HP blocks:`);
    for (const b of pmHP) console.log(`    ${b.time}  ${b.cat.padEnd(8)}  slots=${b.dur}  $${b.amt}  ${b.label}`);

    // Compute ratio
    let amTotal = 0, total = 0;
    for (const b of blocks) {
      if (b.amt <= 0) continue;
      total += b.amt;
      if (!b.pm) amTotal += b.amt;
    }
    console.log(`  ratio = ${((amTotal / total) * 100).toFixed(0)}%`);
  }
}
