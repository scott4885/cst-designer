import { describe, it, expect, beforeEach } from 'vitest';
import { useScheduleStore } from '@/store/schedule-store';
import type {
  GenerationResult,
  ProviderInput,
  BlockTypeInput,
} from '@/lib/engine/types';
import { generateExcel } from '@/lib/export/excel';
import ExcelJS from 'exceljs';

// ────────────────────────────────────────────────────────────────
// Shared fixtures
// ────────────────────────────────────────────────────────────────

const providers: ProviderInput[] = [
  {
    id: 'doc1',
    name: 'Dr. Alpha',
    role: 'DOCTOR',
    operatories: ['OP1'],
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 5000,
    color: '#ff0000',
  },
  {
    id: 'hyg1',
    name: 'Hyg Beta',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 2500,
    color: '#0000ff',
  },
];

const blockTypes: BlockTypeInput[] = [
  {
    id: 'bt-hp',
    label: 'HP',
    description: 'High Production',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
  },
  {
    id: 'bt-recall',
    label: 'Recall',
    description: 'Recare',
    minimumAmount: 200,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
  },
];

function makeEmptyDay(day: string, hours: { start: string; end: string }): GenerationResult {
  const slots: GenerationResult['slots'] = [];
  const mkSlot = (
    time: string,
    providerId: string,
    op: string,
    isBreak = false,
  ) => ({
    time,
    providerId,
    operatory: op,
    staffingCode: isBreak ? null : ('D' as const),
    blockTypeId: null,
    blockLabel: null,
    isBreak,
  });

  const [sh] = hours.start.split(':').map(Number);
  const [eh] = hours.end.split(':').map(Number);
  for (let h = sh; h < eh; h++) {
    for (let m = 0; m < 60; m += 10) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const lunchHour = h === 12;
      slots.push(mkSlot(time, 'doc1', 'OP1', lunchHour));
      slots.push(mkSlot(time, 'hyg1', 'HYG1', lunchHour));
    }
  }
  return { dayOfWeek: day, slots, productionSummary: [], warnings: [] };
}

function makeSourceMonday(): GenerationResult {
  const schedule = makeEmptyDay('MONDAY', { start: '07:00', end: '17:00' });
  // Place 3 doctor blocks and 2 hygiene blocks.
  const placeBlock = (provId: string, start: string, slotCount: number, btId: string, label: string) => {
    let placed = 0;
    for (const s of schedule.slots) {
      if (placed >= slotCount) break;
      if (s.providerId !== provId) continue;
      if (placed === 0 && s.time !== start) continue;
      if (s.isBreak) continue;
      s.blockTypeId = btId;
      s.blockLabel = label;
      s.staffingCode = provId === 'doc1' ? 'D' : 'H';
      s.blockInstanceId = `${provId}-${start}-${btId}`;
      placed++;
    }
  };
  placeBlock('doc1', '07:00', 3, 'bt-hp', 'HP>$1200');
  placeBlock('doc1', '08:30', 3, 'bt-hp', 'HP>$1200');
  placeBlock('doc1', '10:00', 3, 'bt-hp', 'HP>$1200');
  placeBlock('hyg1', '07:00', 6, 'bt-recall', 'Recall>$200');
  placeBlock('hyg1', '09:00', 6, 'bt-recall', 'Recall>$200');
  return schedule;
}

function countBlocks(result: GenerationResult | undefined, provId: string): number {
  if (!result) return 0;
  let count = 0;
  let lastInstance: string | null | undefined = undefined;
  for (const s of result.slots) {
    if (s.providerId !== provId) continue;
    if (s.isBreak) { lastInstance = undefined; continue; }
    if (!s.blockTypeId) { lastInstance = undefined; continue; }
    const inst = s.blockInstanceId ?? s.blockTypeId;
    if (inst !== lastInstance) {
      count++;
      lastInstance = inst;
    }
  }
  return count;
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('Loop 9 — Copy Day + Variant', () => {
  beforeEach(() => {
    useScheduleStore.setState({
      generatedSchedules: {
        MONDAY: makeSourceMonday(),
        TUESDAY: makeEmptyDay('TUESDAY', { start: '07:00', end: '17:00' }),
        WEDNESDAY: makeEmptyDay('WEDNESDAY', { start: '07:00', end: '17:00' }),
        // Friday with shorter hours (2pm close) — simulates EOF.
        FRIDAY: makeEmptyDay('FRIDAY', { start: '07:00', end: '14:00' }),
      },
      activeDay: 'MONDAY',
      currentOfficeId: null,
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    });
  });

  it('copyDayToDays (replace): copies blocks to Tue+Wed and counts match source', () => {
    const res = useScheduleStore.getState().copyDayToDays(
      'MONDAY',
      ['TUESDAY', 'WEDNESDAY'],
      providers,
      blockTypes,
      { includeDoctor: true, includeHygiene: true, includeLunch: true, includeVariant: false, mode: 'replace' },
    );
    expect(res.copiedDays.sort()).toEqual(['TUESDAY', 'WEDNESDAY']);
    expect(res.blocksCopied).toBeGreaterThan(0);

    const tues = useScheduleStore.getState().generatedSchedules.TUESDAY;
    const wed = useScheduleStore.getState().generatedSchedules.WEDNESDAY;
    // 3 doctor blocks + 2 hygiene blocks expected per target.
    expect(countBlocks(tues, 'doc1')).toBe(3);
    expect(countBlocks(tues, 'hyg1')).toBe(2);
    expect(countBlocks(wed, 'doc1')).toBe(3);
    expect(countBlocks(wed, 'hyg1')).toBe(2);
  });

  it('copyDayToDays (merge): does NOT overwrite existing filled slots on the target', () => {
    // Pre-fill a doctor block on Tuesday at 07:00 with a different bt
    const state0 = useScheduleStore.getState();
    const tue0 = state0.generatedSchedules.TUESDAY;
    const slots0 = tue0.slots.map(s =>
      s.providerId === 'doc1' && s.time === '07:00'
        ? { ...s, blockTypeId: 'bt-recall', blockLabel: 'PRE-EXISTING', blockInstanceId: 'tue-pre' }
        : s,
    );
    useScheduleStore.setState({
      generatedSchedules: { ...state0.generatedSchedules, TUESDAY: { ...tue0, slots: slots0 } },
    });

    useScheduleStore.getState().copyDayToDays(
      'MONDAY',
      ['TUESDAY'],
      providers,
      blockTypes,
      { includeDoctor: true, includeHygiene: true, includeLunch: true, includeVariant: false, mode: 'merge' },
    );

    const tue = useScheduleStore.getState().generatedSchedules.TUESDAY;
    const preExisting = tue.slots.find(s => s.providerId === 'doc1' && s.time === '07:00');
    // Merge mode must preserve the pre-existing block label.
    expect(preExisting?.blockLabel).toBe('PRE-EXISTING');
  });

  it('copyDayToDays truncates when target has shorter hours (EOF Friday)', () => {
    const res = useScheduleStore.getState().copyDayToDays(
      'MONDAY',
      ['FRIDAY'],
      providers,
      blockTypes,
      { includeDoctor: true, includeHygiene: true, includeLunch: true, includeVariant: false, mode: 'replace' },
    );
    // Should still copy to Friday but with at least one warning about truncation/shorter hours.
    expect(res.copiedDays).toContain('FRIDAY');
    const hasTruncWarning = res.warnings.some(w => /truncat|shorter working hours/.test(w));
    expect(hasTruncWarning).toBe(true);

    // The 10:00 doctor block on source won't fit (only 1 slot left before 14:00 end? actually 4 hours = 24 slots).
    // But we can still verify blocks present in FRIDAY don't extend past 14:00.
    const fri = useScheduleStore.getState().generatedSchedules.FRIDAY;
    const latestBlockSlot = fri.slots
      .filter(s => s.providerId === 'doc1' && s.blockTypeId)
      .map(s => s.time)
      .sort()
      .pop();
    if (latestBlockSlot) {
      const [h] = latestBlockSlot.split(':').map(Number);
      expect(h).toBeLessThan(14);
    }
  });

  it('copyDayToDays: undo reverts the entire copy as ONE atomic step', () => {
    const store = useScheduleStore.getState();
    store.copyDayToDays(
      'MONDAY',
      ['TUESDAY', 'WEDNESDAY'],
      providers,
      blockTypes,
      { includeDoctor: true, includeHygiene: true, includeLunch: true, includeVariant: false, mode: 'replace' },
    );

    const afterCopy = useScheduleStore.getState();
    expect(countBlocks(afterCopy.generatedSchedules.TUESDAY, 'doc1')).toBe(3);
    expect(countBlocks(afterCopy.generatedSchedules.WEDNESDAY, 'doc1')).toBe(3);
    expect(afterCopy.canUndo).toBe(true);
    expect(afterCopy.undoStack.length).toBe(1); // ONE entry for the whole multi-day copy

    useScheduleStore.getState().undo();

    const afterUndo = useScheduleStore.getState();
    // Both Tuesday and Wednesday should be back to empty in a single undo
    expect(countBlocks(afterUndo.generatedSchedules.TUESDAY, 'doc1')).toBe(0);
    expect(countBlocks(afterUndo.generatedSchedules.WEDNESDAY, 'doc1')).toBe(0);
    expect(countBlocks(afterUndo.generatedSchedules.TUESDAY, 'hyg1')).toBe(0);
    expect(countBlocks(afterUndo.generatedSchedules.WEDNESDAY, 'hyg1')).toBe(0);
  });

  it('setVariantLabel: tag + clear with undo', () => {
    useScheduleStore.getState().setVariantLabel('FRIDAY', 'EOF');
    expect(useScheduleStore.getState().generatedSchedules.FRIDAY.variantLabel).toBe('EOF');

    useScheduleStore.getState().setVariantLabel('FRIDAY', null);
    expect(useScheduleStore.getState().generatedSchedules.FRIDAY.variantLabel).toBeNull();

    useScheduleStore.getState().undo();
    expect(useScheduleStore.getState().generatedSchedules.FRIDAY.variantLabel).toBe('EOF');

    useScheduleStore.getState().undo();
    expect(useScheduleStore.getState().generatedSchedules.FRIDAY.variantLabel ?? null).toBeNull();
  });

  it('copyDayToDays with includeVariant=true copies variantLabel to target', () => {
    useScheduleStore.getState().setVariantLabel('MONDAY', 'Opt1');
    useScheduleStore.getState().copyDayToDays(
      'MONDAY',
      ['TUESDAY'],
      providers,
      blockTypes,
      { includeDoctor: true, includeHygiene: true, includeLunch: true, includeVariant: true, mode: 'replace' },
    );
    expect(useScheduleStore.getState().generatedSchedules.TUESDAY.variantLabel).toBe('Opt1');
  });

  it('Excel export: variantLabel round-trips into the sheet name', async () => {
    const buffer = await generateExcel({
      officeName: 'Test Office',
      timeIncrement: 10,
      providers: [
        {
          id: 'doc1',
          name: 'Dr. Alpha',
          role: 'DOCTOR',
          operatories: ['OP1'],
          dailyGoal: 5000,
          hourlyRate: 500,
          color: '#ff0000',
          goal75: 3750,
        },
      ],
      blockTypes: [{ label: 'HP', minimumAmount: 1200 }],
      daySchedules: [
        {
          dayOfWeek: 'Monday',
          slots: [],
          productionSummary: [],
        },
        {
          dayOfWeek: 'Friday',
          variantLabel: 'EOF',
          slots: [],
          productionSummary: [],
        },
      ],
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheetNames = wb.worksheets.map(ws => ws.name);
    expect(sheetNames).toContain('Monday');
    expect(sheetNames).toContain('Friday (EOF)');
  });
});
