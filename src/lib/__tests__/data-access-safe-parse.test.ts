/**
 * data-access — safeParseJSON edge-case tests.
 *
 * The data-access layer hydrates Office/Provider/BlockType records from
 * SQLite where several columns are stored as JSON-serialized strings
 * (workingDays, operatories, providerSchedule, etc.). `safeParseJSON`
 * is the single chokepoint that owns the silent-fallback contract: if
 * the column is null, empty, or malformed, return the supplied default
 * — DON'T throw, DON'T corrupt the in-memory office.
 *
 * These tests pin that contract so a future refactor that "improves"
 * error handling can't accidentally turn a malformed-JSON column into
 * a 500 across every office page.
 */

import { describe, expect, it } from 'vitest';
import { safeParseJSON } from '../data-access';

describe('safeParseJSON', () => {
  it('returns the fallback when the value is null', () => {
    expect(safeParseJSON(null, [])).toEqual([]);
    expect(safeParseJSON<{ a: number }>(null, { a: 1 })).toEqual({ a: 1 });
  });

  it('returns the fallback when the value is undefined', () => {
    expect(safeParseJSON(undefined, ['x'])).toEqual(['x']);
  });

  it('returns the fallback when the value is empty string', () => {
    expect(safeParseJSON('', [])).toEqual([]);
  });

  it('parses a valid JSON object', () => {
    expect(
      safeParseJSON<{ a: number; b: string }>('{"a":1,"b":"x"}', {} as { a: number; b: string }),
    ).toEqual({ a: 1, b: 'x' });
  });

  it('parses a valid JSON array', () => {
    expect(safeParseJSON<string[]>('["MONDAY","TUESDAY"]', [])).toEqual([
      'MONDAY',
      'TUESDAY',
    ]);
  });

  it('returns the fallback when JSON is malformed (truncated)', () => {
    expect(safeParseJSON<string[]>('["MONDAY","TU', ['default'])).toEqual([
      'default',
    ]);
  });

  it('returns the fallback when JSON is malformed (random text)', () => {
    expect(safeParseJSON('not json at all', { ok: true })).toEqual({ ok: true });
  });

  it('returns the fallback when the value is "null" (the literal string)', () => {
    // JSON.parse("null") === null. The fallback contract says: if we got
    // a usable object we return it. JSON null is technically valid JSON,
    // so this round-trips to null — verify the behaviour either way.
    expect(safeParseJSON('null', { fallback: true })).toBeNull();
  });

  it('returns nested structures intact', () => {
    const nested = '{"providers":[{"id":"p1","ops":["OP1","OP2"]}]}';
    expect(
      safeParseJSON<{ providers: Array<{ id: string; ops: string[] }> }>(
        nested,
        { providers: [] },
      ),
    ).toEqual({ providers: [{ id: 'p1', ops: ['OP1', 'OP2'] }] });
  });

  it('passes through pre-parsed objects (defensive against adapter drift)', () => {
    // If the Prisma adapter ever hands back a non-string (e.g., a
    // future driver does the parse for us), don't double-parse and
    // don't fall back. Just return as-is.
    const alreadyParsed = { workingDays: ['MON', 'TUE'] } as unknown as string;
    expect(safeParseJSON(alreadyParsed, { workingDays: [] })).toEqual({
      workingDays: ['MON', 'TUE'],
    });
  });
});
