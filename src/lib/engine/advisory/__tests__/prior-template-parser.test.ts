/**
 * Sprint 6 Epic P — Prior-template parser tests.
 *
 * Covers the CSV parser, the fuzzy label matcher, and the FREETEXT fallback.
 * XLSX is exercised via an end-to-end route test in Playwright; a unit test
 * would require shipping a binary fixture.
 */

import { describe, it, expect } from 'vitest';
import {
  matchLabelToBlockType,
  parseCsv,
  parseFreeText,
  parsePriorTemplate,
  normalizeTime,
  normalizeDay,
  diffMinutes,
} from '../prior-template-parser';

describe('normalizeDay', () => {
  it('maps full day names to 3-letter codes', () => {
    expect(normalizeDay('Monday')).toBe('MON');
    expect(normalizeDay('TUESDAY')).toBe('TUE');
    expect(normalizeDay('wednesday')).toBe('WED');
  });
  it('passes through 3-letter codes', () => {
    expect(normalizeDay('THU')).toBe('THU');
  });
  it('returns null for garbage', () => {
    expect(normalizeDay('floofday')).toBe(null);
  });
});

describe('normalizeTime', () => {
  it('parses 24-hour HH:MM', () => {
    expect(normalizeTime('08:30')).toBe('08:30');
    expect(normalizeTime('14:00')).toBe('14:00');
  });
  it('parses 12-hour with AM/PM', () => {
    expect(normalizeTime('8:30 AM')).toBe('08:30');
    expect(normalizeTime('2:00 PM')).toBe('14:00');
    expect(normalizeTime('12:00 PM')).toBe('12:00');
    expect(normalizeTime('12:00 AM')).toBe('00:00');
  });
  it('returns null for garbage', () => {
    expect(normalizeTime('elevenish')).toBe(null);
  });
});

describe('diffMinutes', () => {
  it('computes simple durations', () => {
    expect(diffMinutes('08:00', '09:30')).toBe(90);
    expect(diffMinutes('13:00', '14:00')).toBe(60);
  });
  it('returns 0 when end equals start', () => {
    expect(diffMinutes('10:00', '10:00')).toBe(0);
  });
  it('returns negative for end < start (caller filters)', () => {
    expect(diffMinutes('10:00', '09:00')).toBe(-60);
  });
});

describe('matchLabelToBlockType', () => {
  it('direct-matches common labels', () => {
    expect(matchLabelToBlockType('HP').matchedBlockType).toBe('HP');
    expect(matchLabelToBlockType('Hygiene').matchedBlockType).toBe('RC');
  });

  it('matches via synonyms', () => {
    const r = matchLabelToBlockType('crown prep');
    expect(r.matchedBlockType).toBe('HP');
    expect(r.matchConfidence).toBeGreaterThan(0.5);
  });

  it('matches via token overlap (Jaccard)', () => {
    const r = matchLabelToBlockType('hygiene recall appointment');
    expect(r.matchedBlockType).toBe('RC');
  });

  it('matches via Levenshtein for typos', () => {
    const r = matchLabelToBlockType('huddl');
    expect(r.matchedBlockType).toBe('HUDDLE');
  });

  it('returns null for garbage', () => {
    const r = matchLabelToBlockType('xzzyzx-narglebargle');
    expect(r.matchedBlockType).toBe(null);
    expect(r.matchConfidence).toBe(0);
  });
});

describe('parseCsv', () => {
  const CSV = `Day,Start,End,Label,Provider
Mon,08:00,09:30,Crown prep,Dr. A
Mon,09:30,10:30,Hygiene,Lisa
Mon,13:00,14:00,NP Exam,Dr. A
Tue,10:00,11:00,Something unknown,Dr. A`;

  it('parses a minimal CSV with 4 rows', () => {
    const r = parseCsv(CSV);
    expect(r.sourceFormat).toBe('CSV');
    expect(r.blocks.length).toBe(4);
    const [row0, row1, row2, row3] = r.blocks;
    expect(row0.day).toBe('MON');
    expect(row0.start).toBe('08:00');
    expect(row0.end).toBe('09:30');
    expect(row0.matchedBlockType).toBe('HP');
    expect(row1.matchedBlockType).toBe('RC');
    expect(row2.matchedBlockType).toBe('NPE');
    expect(row3.matchedBlockType).toBe(null);
  });

  it('still returns blocks when most labels do not match a block type', () => {
    const csv = `Day,Start,End,Label
Mon,08:00,09:00,Unknown thing
Mon,09:00,10:00,Other unknown
Mon,10:00,11:00,Huddle`;
    const r = parseCsv(csv);
    expect(r.blocks.length).toBe(3);
    const matched = r.blocks.filter((b) => b.matchedBlockType !== null);
    expect(matched.length).toBe(1); // only "Huddle"
  });

  it('handles quoted values with commas', () => {
    const csv = `Day,Start,End,Label
Mon,08:00,09:00,"Crown, molar"`;
    const r = parseCsv(csv);
    expect(r.blocks[0].label).toBe('Crown, molar');
  });

  it('reports failing rows', () => {
    const csv = `Day,Start,End,Label
GARBAGE,elevenish,twelveish,HP`;
    const r = parseCsv(csv);
    expect(r.blocks.length).toBe(0);
    expect(r.failingRows && r.failingRows.length).toBeGreaterThan(0);
  });
});

describe('parseFreeText', () => {
  it('preserves raw text and marks format as FREETEXT', () => {
    const text = `
MON 08:00-09:30 Crown prep
TUE 09:00-10:00 Hygiene recall
`;
    const r = parseFreeText(text);
    expect(r.sourceFormat).toBe('FREETEXT');
    // FREETEXT ships with no structured blocks in Sprint 6
    expect(r.blocks.length).toBe(0);
    expect(r.rawText).toBe(text);
    expect(r.parseStatus).toBe('OK');
  });

  it('marks source format as DOCX when explicitly passed', () => {
    const r = parseFreeText('Some text', 'DOCX');
    expect(r.sourceFormat).toBe('DOCX');
    expect(r.blocks.length).toBe(0);
  });
});

describe('parsePriorTemplate dispatcher', () => {
  it('routes CSV strings to parseCsv', async () => {
    const csv = `Day,Start,End,Label\nMon,08:00,09:00,HP`;
    const r = await parsePriorTemplate('CSV', csv);
    expect(r.sourceFormat).toBe('CSV');
    expect(r.blocks.length).toBe(1);
  });
  it('routes FREETEXT strings to parseFreeText (no blocks)', async () => {
    const r = await parsePriorTemplate('FREETEXT', 'Mon 08:00-09:00 Huddle');
    expect(r.sourceFormat).toBe('FREETEXT');
    expect(r.blocks.length).toBe(0);
    expect(r.rawText).toBe('Mon 08:00-09:00 Huddle');
  });
});
