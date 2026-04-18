/**
 * Loop 4 morning-load diagnostic probe.
 * Prints per-(office, day) ratios + swap counts + per-provider-op breakdown.
 */

import { GOLDEN_OFFICES } from '../src/lib/mock-data';
import { generateSchedule } from '../src/lib/engine/generator';
import { hashSeed } from '../src/lib/engine/rng';

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

for (const office of GOLDEN_OFFICES) {
  console.log(`\n=== ${office.name} ===`);
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
    const ml = result.morningLoadSwaps;
    if (!ml) {
      console.log(`  ${day}: no morning-load metadata`);
      continue;
    }
    const perOpRatios = Object.entries(ml.ratios)
      .map(([k, v]) => `${k.split('::')[1]}=${(v * 100).toFixed(0)}%`)
      .join(' ');
    console.log(
      `  ${day.padEnd(10)} schedule=${(ml.scheduleRatio * 100).toFixed(0).padStart(3)}%  swaps=${String(ml.swaps.length).padStart(2)}  hardCap=${ml.hardCapViolators.length}  per-op: ${perOpRatios}`
    );
  }
}
