import type { StaffingCode } from './types';

/**
 * Canonical per-slot staffing patterns extracted from 6 real multi-column templates
 * (SMILE NM Mon/Tue/Wed/Thu/Fri + Smile Cascade Mon). All patterns assume 10-min slots.
 *
 * Source: .rebuild-research/extracted-patterns.md
 * Legend: A = assistant-managed, D = doctor hands-on, H = hygienist, null = open
 */

export interface PatternDef {
  label: string;
  pattern: StaffingCode[];
  durationMin: number;
  role: 'DOCTOR' | 'HYGIENIST';
  aliases?: string[];
}

export const PATTERN_CATALOG: Record<string, PatternDef> = {
  HP: {
    label: 'HP > $1800',
    pattern: ['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A'],
    durationMin: 80,
    role: 'DOCTOR',
    aliases: ['HIGH PRODUCTION', 'HP>$1800', 'HP > 1800'],
  },

  MP: {
    label: 'MP',
    pattern: ['A', 'D', 'D', 'A'],
    durationMin: 40,
    role: 'DOCTOR',
    aliases: ['MID PRODUCTION', 'MEDIUM PRODUCTION', 'FILLING'],
  },

  ER: {
    label: 'ER',
    pattern: ['A', 'D', 'A'],
    durationMin: 30,
    role: 'DOCTOR',
    aliases: ['EMERGENCY', 'LIMITED EXAM'],
  },

  NON_PROD: {
    label: 'NON-PROD',
    pattern: ['A', 'A', 'A'],
    durationMin: 30,
    role: 'DOCTOR',
    aliases: ['NONPROD', 'NON PROD'],
  },

  NP_DOC: {
    label: 'NP CONS',
    pattern: ['A', 'D', 'D', 'A'],
    durationMin: 40,
    role: 'DOCTOR',
    aliases: ['NEW PATIENT CONSULT', 'NP CONSULT', 'NP CONS'],
  },

  NP_HYG: {
    label: 'NP>$300',
    pattern: ['H', 'H', 'H', 'H', 'H', 'D', 'D', 'D', 'H'],
    durationMin: 90,
    role: 'HYGIENIST',
    aliases: ['NEW PATIENT', 'NP', 'HYG NP'],
  },

  PM_GING: {
    label: 'PM/GING>$150',
    pattern: ['H', 'H', 'H', 'H', 'H', 'H'],
    durationMin: 60,
    role: 'HYGIENIST',
    aliases: ['PROPHY', 'PROPHY/GINGIVITIS', 'GINGIVITIS'],
  },

  RC_PM: {
    label: 'RC/PM > $130',
    pattern: ['H', 'D', 'H', 'H', 'H', 'H'],
    durationMin: 60,
    role: 'HYGIENIST',
    aliases: ['RECALL', 'RC/PM', 'RECARE'],
  },

  SRP: {
    label: 'SRP>$400',
    pattern: ['H', 'H', 'H', 'H', 'H', 'H'],
    durationMin: 60,
    role: 'HYGIENIST',
    aliases: ['SCALING', 'SRP', 'PERIO MAINTENANCE'],
  },
};

/**
 * Resolve a block label to a pattern definition. Normalizes the input (uppercase,
 * strip whitespace/punctuation) and checks both canonical labels and aliases.
 */
export function resolvePattern(label: string | null | undefined): PatternDef | null {
  if (!label) return null;
  const norm = label.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!norm) return null;

  // Exact match on canonical label or alias
  for (const def of Object.values(PATTERN_CATALOG)) {
    if (def.label.toUpperCase() === norm) return def;
    if (def.aliases?.some((a) => a.toUpperCase() === norm)) return def;
  }

  // Prefix / first-token match — catches "HP RESTO", "MP FILL 1500", "SRP QUAD", etc.
  const firstToken = norm.split(/[\s/>$]/)[0];
  for (const def of Object.values(PATTERN_CATALOG)) {
    const canonFirst = def.label.toUpperCase().split(/[\s/>$]/)[0];
    if (firstToken && canonFirst === firstToken) return def;
    if (def.aliases?.some((a) => a.toUpperCase().split(/[\s/>$]/)[0] === firstToken)) return def;
  }

  // Substring fallback — canonical label or alias appears anywhere in the
  // input. For short (≤3 char) tokens we require a word boundary so "NP" doesn't
  // greedily match "NPE" or "CROWN PREP", and "HP" doesn't match "CHOP".
  const isShort = (s: string) => s.length <= 3;
  const wordBoundaryMatch = (haystack: string, needle: string): boolean => {
    const re = new RegExp(`(^|[^A-Z0-9])${needle.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^A-Z0-9]|$)`);
    return re.test(haystack);
  };
  for (const def of Object.values(PATTERN_CATALOG)) {
    const lbl = def.label.toUpperCase();
    if (isShort(lbl) ? wordBoundaryMatch(norm, lbl) : norm.includes(lbl)) return def;
    if (def.aliases?.some((a) => {
      const au = a.toUpperCase();
      return isShort(au) ? wordBoundaryMatch(norm, au) : norm.includes(au);
    })) {
      return def;
    }
  }

  return null;
}

/**
 * Produce a per-slot pattern for a block that has no pre-declared pattern,
 * using role + length to derive a sensible default. Used as a fallback so the
 * engine never regresses to hardcoded "A at ends, D in middle" generation.
 */
export function derivePattern(
  role: 'DOCTOR' | 'HYGIENIST' | 'BOTH' | 'OTHER',
  lengthSlots: number,
): StaffingCode[] {
  if (lengthSlots <= 0) return [];

  if (role === 'HYGIENIST') {
    return Array(lengthSlots).fill('H');
  }

  // DOCTOR or BOTH: A-bookends + D-middle, mirroring the observed MP/ER/HP family.
  if (lengthSlots === 1) return ['D'];
  if (lengthSlots === 2) return ['A', 'D'];
  if (lengthSlots === 3) return ['A', 'D', 'A'];
  if (lengthSlots === 4) return ['A', 'D', 'D', 'A'];
  // 5+: 2 A's at each end, D's in middle (matches HP > $1800 scaling)
  const arr: StaffingCode[] = Array(lengthSlots).fill('D');
  arr[0] = 'A';
  arr[1] = 'A';
  arr[lengthSlots - 1] = 'A';
  arr[lengthSlots - 2] = 'A';
  return arr;
}
