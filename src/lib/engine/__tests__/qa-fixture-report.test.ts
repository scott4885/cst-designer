/**
 * Phase 4 QA — Diagnostic test to emit per-fixture structural metrics.
 * Written by QA engineer, read-only — does not mutate engine or fixtures.
 * Emits to stdout (pass-through) so a parent process can capture metrics.
 */
import { describe, it } from 'vitest';
import { generateSchedule } from '../generator';
import { slotsToPlacedBlocks } from '../slots-to-placed-blocks';

import { smileNmMonday } from './golden-templates/smile-nm-monday.fixture';
import { smileNmTuesday } from './golden-templates/smile-nm-tuesday.fixture';
import { smileNmWednesday } from './golden-templates/smile-nm-wednesday.fixture';
import { smileNmThursday } from './golden-templates/smile-nm-thursday.fixture';
import { smileNmFriday } from './golden-templates/smile-nm-friday.fixture';
import { smileCascadeMonday } from './golden-templates/smile-cascade-monday.fixture';

const FIXTURES = [
  smileNmMonday,
  smileNmTuesday,
  smileNmWednesday,
  smileNmThursday,
  smileNmFriday,
  smileCascadeMonday,
];

describe('qa-fixture-report (diagnostic)', () => {
  it('emits per-fixture metrics', () => {
    const lines: string[] = [];
    for (const f of FIXTURES) {
      const result = generateSchedule(f.input);
      const placed = slotsToPlacedBlocks(
        result.slots,
        f.input.blockTypes,
        f.input.timeIncrement,
      );
      const byType: Record<string, number> = {};
      let totalProduction = 0;
      for (const b of placed) {
        byType[b.blockTypeId] = (byType[b.blockTypeId] ?? 0) + 1;
        totalProduction += b.productionAmount ?? 0;
      }
      const report = result.guardReport;
      const hardV = report?.violations?.filter((v) => v.severity === 'HARD') ?? [];
      const softV = report?.violations?.filter((v) => v.severity === 'SOFT') ?? [];
      const infoV = report?.violations?.filter((v) => v.severity === 'INFO') ?? [];

      // Morning load (dollars before 13:00 / totalDollars)
      const lunchStartMin = 13 * 60;
      let amDollars = 0;
      let totalDollars = 0;
      for (const b of placed) {
        const dollars = b.productionAmount ?? 0;
        totalDollars += dollars;
        if (b.startMinute < lunchStartMin) amDollars += dollars;
      }
      const morningPct =
        totalDollars > 0 ? ((amDollars / totalDollars) * 100).toFixed(1) : '0.0';

      // Lunch check
      const lunchOverlap = placed.filter(
        (b) =>
          b.startMinute < 14 * 60 && b.startMinute + b.durationMin > 13 * 60,
      );

      // Doctor X cross-column overlap
      const doctorOverlaps = findDoctorOverlapCount(placed);

      lines.push(`\n=== ${f.name} (${f.dayCode}) ===`);
      lines.push(`  blocks_by_type=${JSON.stringify(byType)}`);
      lines.push(`  total_blocks=${placed.length}`);
      lines.push(`  total_production=$${totalProduction.toFixed(0)}`);
      lines.push(`  morning_load_pct=${morningPct}%`);
      lines.push(
        `  violations HARD=${hardV.length} SOFT=${softV.length} INFO=${infoV.length}`,
      );
      for (const v of hardV.slice(0, 15)) {
        lines.push(`    HARD [${v.ap}] ${v.message}`);
      }
      for (const v of softV.slice(0, 5)) {
        lines.push(`    SOFT [${v.ap}] ${v.message}`);
      }
      lines.push(`  lunch_overlapping_blocks=${lunchOverlap.length}`);
      lines.push(`  doctor_x_pairwise_overlaps=${doctorOverlaps.pairwise}`);
      lines.push(`  doctor_x_same_op_overlaps=${doctorOverlaps.sameOp}`);
      lines.push(
        `  doctor_x_3way_overlaps=${doctorOverlaps.threeWay}`,
      );
    }
    // Emit as one big log so vitest prints it intact
    // eslint-disable-next-line no-console
    console.log('QA_FIXTURE_REPORT_BEGIN\n' + lines.join('\n') + '\nQA_FIXTURE_REPORT_END');
  });
});

function findDoctorOverlapCount(blocks: Array<{
  providerId: string;
  operatory: string;
  doctorMin: number;
  doctorStartMinute?: number | null;
}>): { pairwise: number; sameOp: number; threeWay: number } {
  const byProv = new Map<string, typeof blocks>();
  for (const b of blocks) {
    const arr = byProv.get(b.providerId) ?? [];
    arr.push(b);
    byProv.set(b.providerId, arr);
  }
  let pair = 0,
    same = 0,
    three = 0;
  for (const list of byProv.values()) {
    const windows = list
      .filter((b) => b.doctorMin > 0 && b.doctorStartMinute != null)
      .map((b) => ({
        op: b.operatory,
        start: b.doctorStartMinute as number,
        end: (b.doctorStartMinute as number) + b.doctorMin,
      }));
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i];
        const b = windows[j];
        const start = Math.max(a.start, b.start);
        const end = Math.min(a.end, b.end);
        if (start < end) {
          pair++;
          if (a.op === b.op) same++;
        }
        for (let k = j + 1; k < windows.length; k++) {
          const c = windows[k];
          const s = Math.max(a.start, b.start, c.start);
          const e = Math.min(a.end, b.end, c.end);
          if (s < e) three++;
        }
      }
    }
  }
  return { pairwise: pair, sameOp: same, threeWay: three };
}
