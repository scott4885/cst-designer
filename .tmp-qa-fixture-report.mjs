import { generateSchedule } from './src/lib/engine/generator.ts';
import { slotsToPlacedBlocks } from './src/lib/engine/slots-to-placed-blocks.ts';
import { smileNmMonday } from './src/lib/engine/__tests__/golden-templates/smile-nm-monday.fixture.ts';
import { smileNmTuesday } from './src/lib/engine/__tests__/golden-templates/smile-nm-tuesday.fixture.ts';
import { smileNmWednesday } from './src/lib/engine/__tests__/golden-templates/smile-nm-wednesday.fixture.ts';
import { smileNmThursday } from './src/lib/engine/__tests__/golden-templates/smile-nm-thursday.fixture.ts';
import { smileNmFriday } from './src/lib/engine/__tests__/golden-templates/smile-nm-friday.fixture.ts';
import { smileCascadeMonday } from './src/lib/engine/__tests__/golden-templates/smile-cascade-monday.fixture.ts';

const FIXTURES = [
  smileNmMonday, smileNmTuesday, smileNmWednesday, smileNmThursday, smileNmFriday, smileCascadeMonday,
];

for (const f of FIXTURES) {
  try {
    const result = generateSchedule(f.input);
    const placed = slotsToPlacedBlocks(result.slots, f.input.blockTypes, f.input.timeIncrement);
    const byType = {};
    let totalProduction = 0;
    for (const b of placed) {
      byType[b.blockTypeId] = (byType[b.blockTypeId] || 0) + 1;
      totalProduction += (b.productionAmount || 0);
    }
    const report = result.guardReport;
    const hardViolations = report?.violations?.filter(v => v.severity === 'HARD') || [];
    const softViolations = report?.violations?.filter(v => v.severity === 'SOFT') || [];
    const infoViolations = report?.violations?.filter(v => v.severity === 'INFO') || [];

    // Morning load
    const lunchStartMin = 13 * 60;
    let amDollars = 0, totalDollars = 0;
    for (const b of placed) {
      const dollars = b.productionAmount || 0;
      totalDollars += dollars;
      if (b.startMinute < lunchStartMin) amDollars += dollars;
    }
    const morningPct = totalDollars > 0 ? (amDollars / totalDollars * 100).toFixed(1) : '0.0';

    console.log(`\n=== ${f.name} (${f.dayCode}) ===`);
    console.log('Block counts by type:', JSON.stringify(byType));
    console.log('Total blocks:', placed.length);
    console.log('Total production: $' + totalProduction.toFixed(0));
    console.log('Morning-load %:', morningPct + '%');
    console.log('Violations - HARD:', hardViolations.length, '/ SOFT:', softViolations.length, '/ INFO:', infoViolations.length);
    if (hardViolations.length > 0) {
      console.log('HARD details:');
      for (const v of hardViolations.slice(0, 10)) {
        console.log('  [' + v.ap + '] ' + v.message);
      }
    }
    if (softViolations.length > 0) {
      console.log('SOFT details (first 5):');
      for (const v of softViolations.slice(0, 5)) {
        console.log('  [' + v.ap + '] ' + v.message);
      }
    }
    // Lunch check - are any blocks spanning 13:00-14:00?
    const lunchOverlap = placed.filter(b => b.startMinute < 14*60 && b.startMinute + b.durationMin > 13*60);
    console.log('Blocks overlapping lunch (13:00-14:00):', lunchOverlap.length);
  } catch (e) {
    console.log('ERROR in', f.name, ':', e.message);
  }
}
