import { describe, it, expect } from 'vitest';
import {
  transformToOpenDental,
  generateOpenDentalJSON,
  generateMappingCSV,
  OpenDentalScheduleEntry,
  ProviderMapping,
  BlockTypeMapping,
} from '../open-dental';
import type { GenerationResult, TimeSlotOutput } from '@/lib/engine/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const providerMappings: ProviderMapping[] = [
  { providerId: 'doc-1', providerName: 'Dr. Smith',  provNum: '3'  },
  { providerId: 'hyg-1', providerName: 'Jane RDH',   provNum: '5'  },
];

const blockTypeMappings: BlockTypeMapping[] = [
  { blockTypeId: 'hp-1',     blockTypeLabel: 'HP',     defNum: '10' },
  { blockTypeId: 'np-1',     blockTypeLabel: 'NP CONS',defNum: '11' },
  { blockTypeId: 'recare-1', blockTypeLabel: 'Recare', defNum: '20' },
  { blockTypeId: 'srp-1',    blockTypeLabel: 'SRP',    defNum: '21' },
];

/** Build a simple slot sequence for one provider */
function makeSlots(
  providerId: string,
  blocks: { startTime: string; durationSlots: number; blockTypeId: string; blockLabel: string; operatory?: string }[],
  timeIncrement: number
): TimeSlotOutput[] {
  const slots: TimeSlotOutput[] = [];

  for (const block of blocks) {
    const [startH, startM] = block.startTime.split(':').map(Number);
    for (let i = 0; i < block.durationSlots; i++) {
      const totalMin = startH * 60 + startM + i * timeIncrement;
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push({
        time,
        providerId,
        operatory: block.operatory ?? 'OP1',
        staffingCode: 'D',
        blockTypeId: block.blockTypeId,
        blockLabel: block.blockLabel,
        isBreak: false,
      });
    }
  }

  return slots;
}

function makeSchedule(slots: TimeSlotOutput[]): GenerationResult {
  return {
    dayOfWeek: 'MONDAY',
    slots,
    warnings: [],
    productionSummary: [],
  };
}

// ─── transformToOpenDental ───────────────────────────────────────────────────

describe('transformToOpenDental', () => {
  it('generates entries with correct SchedDate', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 6, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].SchedDate).toBe('2026-03-02');
  });

  it('calculates correct StartTime and StopTime for a 60-minute block (6×10min)', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 6, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].StartTime).toBe('08:00:00');
    expect(result.entries[0].StopTime).toBe('09:00:00');
  });

  it('calculates correct times for 15-minute increments', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '09:00', durationSlots: 4, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
    ], 15);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 15,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].StartTime).toBe('09:00:00');
    expect(result.entries[0].StopTime).toBe('10:00:00');
  });

  it('maps ProvNum from providerMappings', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].ProvNum).toBe('3');
  });

  it('maps BlockoutType DefNum from blockTypeMappings', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].BlockoutType).toBe('10');
  });

  it('sets SchedType to "Blockout" for all entries', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP' },
      { startTime: '08:30', durationSlots: 2, blockTypeId: 'np-1', blockLabel: 'NP CONS' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    result.entries.forEach(e => {
      expect(e.SchedType).toBe('Blockout');
    });
  });

  it('sets Note to the block label', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].Note).toBe('HP>$1200');
  });

  it('includes operatory in the entry', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP', operatory: 'OP2' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].operatories).toBe('OP2');
  });

  it('splits consecutive different blocks into separate entries', () => {
    const slots = [
      ...makeSlots('doc-1', [
        { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
      ], 10),
      ...makeSlots('doc-1', [
        { startTime: '08:30', durationSlots: 4, blockTypeId: 'np-1', blockLabel: 'NP CONS>$300' },
      ], 10),
    ];

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries).toHaveLength(2);
  });

  it('handles multiple providers independently', () => {
    const docSlots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 6, blockTypeId: 'hp-1', blockLabel: 'HP' },
    ], 10);
    const hygSlots = makeSlots('hyg-1', [
      { startTime: '08:00', durationSlots: 5, blockTypeId: 'recare-1', blockLabel: 'Recare' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule([...docSlots, ...hygSlots]),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries).toHaveLength(2);
    const docEntry = result.entries.find(e => e.ProvNum === '3');
    const hygEntry = result.entries.find(e => e.ProvNum === '5');
    expect(docEntry).toBeDefined();
    expect(hygEntry).toBeDefined();
  });

  it('skips break/lunch slots (isBreak = true)', () => {
    const slots: TimeSlotOutput[] = [
      {
        time: '13:00',
        providerId: 'doc-1',
        operatory: 'OP1',
        staffingCode: null,
        blockTypeId: null,
        blockLabel: 'LUNCH',
        isBreak: true,
      },
    ];

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries).toHaveLength(0);
  });

  it('skips slots with null blockTypeId (empty slots)', () => {
    const slots: TimeSlotOutput[] = [
      {
        time: '08:00',
        providerId: 'doc-1',
        operatory: 'OP1',
        staffingCode: 'D',
        blockTypeId: null,
        blockLabel: null,
        isBreak: false,
      },
    ];

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries).toHaveLength(0);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it('edge case: empty schedule (no slots)', () => {
    const result = transformToOpenDental({
      schedule: makeSchedule([]),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries).toHaveLength(0);
    expect(result.json).toBe('[]');
  });

  it('edge case: single provider, single slot block', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '10:00', durationSlots: 1, blockTypeId: 'hp-1', blockLabel: 'HP' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].StartTime).toBe('10:00:00');
    expect(result.entries[0].StopTime).toBe('10:10:00');
  });

  it('edge case: missing ProvNum mapping returns empty string', () => {
    const slots = makeSlots('unknown-provider', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].ProvNum).toBe('');
  });

  it('edge case: missing DefNum mapping returns empty string', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'unknown-type', blockLabel: 'UNKNOWN' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    expect(result.entries[0].BlockoutType).toBe('');
  });

  it('edge case: empty providerMappings and blockTypeMappings', () => {
    const slots = makeSlots('doc-1', [
      { startTime: '08:00', durationSlots: 3, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
    ], 10);

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings: [],
      blockTypeMappings: [],
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].ProvNum).toBe('');
    expect(result.entries[0].BlockoutType).toBe('');
  });
});

// ─── generateOpenDentalJSON ──────────────────────────────────────────────────

describe('generateOpenDentalJSON', () => {
  it('produces valid JSON string', () => {
    const entries: OpenDentalScheduleEntry[] = [
      {
        SchedDate: '2026-03-02',
        StartTime: '08:00:00',
        StopTime: '09:00:00',
        SchedType: 'Blockout',
        ProvNum: '3',
        BlockoutType: '10',
        Note: 'HP>$1200',
        operatories: 'OP1',
      },
    ];

    const json = generateOpenDentalJSON(entries);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it('produces JSON that matches API schema fields', () => {
    const entries: OpenDentalScheduleEntry[] = [
      {
        SchedDate: '2026-03-02',
        StartTime: '08:00:00',
        StopTime: '09:00:00',
        SchedType: 'Blockout',
        ProvNum: '3',
        BlockoutType: '10',
        Note: 'HP>$1200',
        operatories: 'OP1',
      },
    ];

    const json = generateOpenDentalJSON(entries);
    const parsed = JSON.parse(json)[0];

    expect(parsed).toHaveProperty('SchedDate');
    expect(parsed).toHaveProperty('StartTime');
    expect(parsed).toHaveProperty('StopTime');
    expect(parsed).toHaveProperty('SchedType', 'Blockout');
    expect(parsed).toHaveProperty('ProvNum');
    expect(parsed).toHaveProperty('BlockoutType');
    expect(parsed).toHaveProperty('Note');
    expect(parsed).toHaveProperty('operatories');
  });

  it('produces empty JSON array for empty entries', () => {
    const json = generateOpenDentalJSON([]);
    expect(json).toBe('[]');
  });

  it('handles multiple entries', () => {
    const entries: OpenDentalScheduleEntry[] = [
      { SchedDate: '2026-03-02', StartTime: '08:00:00', StopTime: '09:00:00', SchedType: 'Blockout', ProvNum: '3', BlockoutType: '10', Note: 'HP', operatories: 'OP1' },
      { SchedDate: '2026-03-02', StartTime: '09:00:00', StopTime: '09:30:00', SchedType: 'Blockout', ProvNum: '5', BlockoutType: '20', Note: 'Recare', operatories: 'HYG1' },
    ];
    const parsed = JSON.parse(generateOpenDentalJSON(entries));
    expect(parsed).toHaveLength(2);
  });
});

// ─── generateMappingCSV ──────────────────────────────────────────────────────

describe('generateMappingCSV', () => {
  it('generates a non-empty CSV string', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    expect(csv.length).toBeGreaterThan(0);
  });

  it('includes PROVIDER MAPPINGS section header', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    expect(csv).toContain('PROVIDER MAPPINGS');
  });

  it('includes BLOCK TYPE MAPPINGS section header', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    expect(csv).toContain('BLOCK TYPE MAPPINGS');
  });

  it('includes provider name and ProvNum in CSV', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    expect(csv).toContain('Dr. Smith');
    expect(csv).toContain(',3');
  });

  it('includes block type label and DefNum in CSV', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    expect(csv).toContain('HP');
    expect(csv).toContain(',10');
  });

  it('includes column headers in each section', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    expect(csv).toContain('STD Provider Name');
    expect(csv).toContain('Open Dental ProvNum');
    expect(csv).toContain('STD Block Type Label');
    expect(csv).toContain('Open Dental BlockoutType DefNum');
  });

  it('handles empty provider and block type mappings', () => {
    const csv = generateMappingCSV([], []);
    expect(csv).toContain('PROVIDER MAPPINGS');
    expect(csv).toContain('BLOCK TYPE MAPPINGS');
    // No data rows, but still valid structure
  });

  it('escapes commas in values with double-quotes', () => {
    const mappingsWithComma: ProviderMapping[] = [
      { providerId: 'doc-1', providerName: 'Smith, Dr. John', provNum: '3' },
    ];
    const csv = generateMappingCSV(mappingsWithComma, []);
    expect(csv).toContain('"Smith, Dr. John"');
  });

  it('each row has the same number of commas as the header', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    const lines = csv.split('\n').filter(l => l.trim());

    // Check provider section
    const provHeaderIdx = lines.findIndex(l => l.includes('STD Provider ID'));
    if (provHeaderIdx >= 0) {
      const headerCommas = (lines[provHeaderIdx].match(/,/g) || []).length;
      // Data rows should have same number of commas
      const dataRow = lines[provHeaderIdx + 1];
      if (dataRow) {
        const dataCommas = (dataRow.match(/,/g) || []).length;
        expect(dataCommas).toBe(headerCommas);
      }
    }
  });

  it('sections are separated by a blank line', () => {
    const csv = generateMappingCSV(providerMappings, blockTypeMappings);
    // There should be at least one blank line between sections
    expect(csv).toMatch(/\n\n/);
  });
});

// ─── Integration: full round-trip ────────────────────────────────────────────

describe('Open Dental export round-trip', () => {
  it('produces JSON that can be re-parsed and matches original entries', () => {
    const slots = [
      ...makeSlots('doc-1', [
        { startTime: '08:00', durationSlots: 9, blockTypeId: 'hp-1', blockLabel: 'HP>$1200' },
        { startTime: '09:30', durationSlots: 3, blockTypeId: 'np-1', blockLabel: 'NP CONS>$300' },
      ], 10),
      ...makeSlots('hyg-1', [
        { startTime: '08:00', durationSlots: 5, blockTypeId: 'recare-1', blockLabel: 'Recare>$150' },
        { startTime: '08:50', durationSlots: 8, blockTypeId: 'srp-1', blockLabel: 'SRP>$300', operatory: 'HYG1' },
      ], 10),
    ];

    const result = transformToOpenDental({
      schedule: makeSchedule(slots),
      schedDate: '2026-03-02',
      timeIncrement: 10,
      providerMappings,
      blockTypeMappings,
    });

    const parsed: OpenDentalScheduleEntry[] = JSON.parse(result.json);
    expect(parsed.length).toBe(result.entries.length);

    // Verify schema for all entries
    parsed.forEach(entry => {
      expect(entry).toHaveProperty('SchedDate', '2026-03-02');
      expect(entry).toHaveProperty('SchedType', 'Blockout');
      expect(entry.StartTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(entry.StopTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });
});
