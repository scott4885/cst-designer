/**
 * Diagnostic — count AP violations per guard per fixture across many seeds.
 * Confirms determinism and robustness of the zero-HARD baseline.
 */
import { smileNmMonday } from '../src/lib/engine/__tests__/golden-templates/smile-nm-monday.fixture';
import { smileNmTuesday } from '../src/lib/engine/__tests__/golden-templates/smile-nm-tuesday.fixture';
import { smileNmWednesday } from '../src/lib/engine/__tests__/golden-templates/smile-nm-wednesday.fixture';
import { smileNmThursday } from '../src/lib/engine/__tests__/golden-templates/smile-nm-thursday.fixture';
import { smileNmFriday } from '../src/lib/engine/__tests__/golden-templates/smile-nm-friday.fixture';
import { smileCascadeMonday } from '../src/lib/engine/__tests__/golden-templates/smile-cascade-monday.fixture';
import { generateSchedule } from '../src/lib/engine/generator';

const FIXTURES = [
  smileNmMonday,
  smileNmTuesday,
  smileNmWednesday,
  smileNmThursday,
  smileNmFriday,
  smileCascadeMonday,
];

const APS = [
  'AP-1', 'AP-2', 'AP-3', 'AP-4', 'AP-5', 'AP-6', 'AP-7', 'AP-8',
  'AP-9', 'AP-10', 'AP-11', 'AP-12', 'AP-13', 'AP-14', 'AP-15',
];

function run(fixture: typeof smileNmMonday, seedOverride?: number) {
  const input = seedOverride == null
    ? fixture.input
    : { ...fixture.input, seed: seedOverride };
  const result = generateSchedule(input);
  return result;
}

console.log('\n=== Default-seed baseline ===\n');
for (const f of FIXTURES) {
  const result = run(f);
  const report = result.guardReport;
  if (!report) { console.log(`${f.name}: no report`); continue; }
  const ap8 = report.violations.filter((v) => v.ap === 'AP-8' && v.severity === 'HARD').length;
  const ap15 = report.violations.filter((v) => v.ap === 'AP-15' && v.severity === 'HARD').length;
  const hard = report.counts.hard;
  const soft = report.counts.soft;
  const info = report.counts.info;
  console.log(`${f.name.padEnd(30)} HARD=${hard} (AP8=${ap8} AP15=${ap15})  SOFT=${soft} INFO=${info}`);
}

console.log('\n=== 20 random seeds per fixture ===\n');
for (const f of FIXTURES) {
  let maxHardAp8 = 0;
  let maxHardAp15 = 0;
  let maxHard = 0;
  for (let s = 0; s < 20; s++) {
    const result = run(f, (f.input.seed ?? 0) + s * 0x1000 + 1);
    const report = result.guardReport;
    if (!report) continue;
    const ap8 = report.violations.filter((v) => v.ap === 'AP-8' && v.severity === 'HARD').length;
    const ap15 = report.violations.filter((v) => v.ap === 'AP-15' && v.severity === 'HARD').length;
    maxHardAp8 = Math.max(maxHardAp8, ap8);
    maxHardAp15 = Math.max(maxHardAp15, ap15);
    maxHard = Math.max(maxHard, report.counts.hard);
  }
  console.log(`${f.name.padEnd(30)} worst-case 20 seeds: HARD=${maxHard} (AP8=${maxHardAp8} AP15=${maxHardAp15})`);
}
