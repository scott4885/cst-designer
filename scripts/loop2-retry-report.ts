/**
 * Loop 2 ad-hoc reporting script.
 *
 * For each of the 5 GOLDEN_OFFICES × 5 weekdays, runs the quality-floor
 * retry envelope with the default config (maxAttempts=5, tierFloor='good')
 * and prints a compact per-(office,day) tier/score report.
 *
 * Run with:
 *   npx tsx scripts/loop2-retry-report.ts
 */

import { GOLDEN_OFFICES } from '../src/lib/mock-data';
import { generateScheduleWithRetry } from '../src/lib/engine/retry-envelope';
import { hashSeed } from '../src/lib/engine/rng';

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

interface Row {
  office: string;
  day: string;
  attemptsUsed: number;
  selectedScore: number;
  selectedTier: string;
  floorMet: boolean;
  allScores: number[];
}

const rows: Row[] = [];

for (const office of GOLDEN_OFFICES) {
  for (const day of WEEKDAYS) {
    const seed = hashSeed(`loop2-report:${office.id}:${day}`);
    const { qualityScore, metadata } = generateScheduleWithRetry(
      {
        providers: office.providers ?? [],
        blockTypes: office.blockTypes ?? [],
        rules: office.rules!,
        timeIncrement: office.timeIncrement,
        dayOfWeek: day,
      },
      { baseSeed: seed, maxAttempts: 5, tierFloor: 'good' },
    );
    rows.push({
      office: office.name,
      day,
      attemptsUsed: metadata.attemptsUsed,
      selectedScore: qualityScore.total,
      selectedTier: qualityScore.tier,
      floorMet: metadata.floorMet,
      allScores: metadata.allAttemptScores,
    });
  }
}

// Group by office and print
const byOffice = new Map<string, Row[]>();
for (const r of rows) {
  if (!byOffice.has(r.office)) byOffice.set(r.office, []);
  byOffice.get(r.office)!.push(r);
}

console.log('\n=== Loop 2 Retry Envelope Report ===');
console.log('Config: maxAttempts=5, tierFloor=good\n');

let okCount = 0;
let totalCount = 0;

for (const [office, list] of byOffice) {
  console.log(`\n${office}`);
  for (const r of list) {
    const tag = r.floorMet ? 'PASS' : 'FAIL';
    const suffix = r.floorMet ? ` (early-exit on attempt ${r.attemptsUsed})` : '';
    console.log(
      `  ${r.day.padEnd(9)} ${tag} ${r.selectedScore}/100 ${r.selectedTier.padEnd(11)}` +
      ` attempts=[${r.allScores.join(',')}]${suffix}`
    );
    totalCount++;
    if (r.floorMet) okCount++;
  }
  const officePass = list.filter(x => x.floorMet).length;
  console.log(`  → ${officePass}/${list.length} days cleared the 'good' floor`);
}

console.log('\n=== Summary ===');
console.log(`Overall: ${okCount}/${totalCount} (${Math.round((okCount / totalCount) * 100)}%) cleared the 'good' floor`);
console.log(`Roadmap done criterion: ≥95% — ${okCount / totalCount >= 0.95 ? 'MET' : 'NOT MET — flag to Loop 3/4'}`);

// Per-office breakdown — flag any office with <95% as Loop 3/4 target
console.log('\n=== Offices below 95% (Loop 3/4 targets) ===');
for (const [office, list] of byOffice) {
  const pct = list.filter(x => x.floorMet).length / list.length;
  if (pct < 0.95) {
    const failDays = list.filter(x => !x.floorMet).map(x => `${x.day}(${x.selectedScore})`).join(', ');
    console.log(`  ${office}: ${Math.round(pct * 100)}% — failing days: ${failDays}`);
  }
}
