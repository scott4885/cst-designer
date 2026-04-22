import type {
  BlockTypeInput,
  PracticeModelCode,
  StaffingCode,
  XSegmentTemplate,
} from './types';
import type { MultiColumnCoordinator } from './multi-column-coordinator';

/**
 * ---------------------------------------------------------------------------
 * Pattern Catalog v2 — Sprint 1
 * ---------------------------------------------------------------------------
 *
 * V1 (below as `legacyPatternCatalog`) mapped block labels → per-slot
 * StaffingCode[] arrays and was the authoritative "which minutes belong to
 * doctor vs assistant" source. V2 replaces that with the X-segment canonical
 * primitive (Bible §2.1) and consults the MultiColumnCoordinator for multi-op
 * solutions.
 *
 * The v1 catalog stays live as a **seed-only fallback** used when a BlockType
 * has neither an `xSegment` template nor `dTimeMin/aTimeMin` set. This keeps
 * existing offices working while their data is back-filled.
 *
 * Contract:
 *   - `resolvePattern(label)` — legacy API, preserved for back-compat.
 *   - `resolvePatternV2(args)` — new Sprint 1 API; returns an XSegmentTemplate
 *     and an optional placement hint from the coordinator.
 *   - `derivePattern(role, lengthSlots)` — legacy API, preserved.
 *
 * Downstream callers (rock-sand-water, slot-helpers) prefer v2 when the
 * BlockType carries xSegment; otherwise they fall back to v1.
 */

// ---------------------------------------------------------------------------
// Legacy catalog (v1) — sourced from extracted-patterns.md
// ---------------------------------------------------------------------------

export interface PatternDef {
  label: string;
  pattern: StaffingCode[];
  durationMin: number;
  role: 'DOCTOR' | 'HYGIENIST';
  aliases?: string[];
}

/**
 * @deprecated Prefer `XSegmentTemplate` on each BlockType. Retained for
 * seed-only fallback when a BlockType has no X-segment or D/A fields.
 */
export const legacyPatternCatalog: Record<string, PatternDef> = {
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
 * @deprecated Alias for `legacyPatternCatalog`. Retained so existing callers
 * keep compiling. New code should prefer `resolvePatternV2`.
 */
export const PATTERN_CATALOG = legacyPatternCatalog;

/**
 * @deprecated v1 public API — resolves a block label to a PatternDef.
 * Preserved for back-compat with `rock-sand-water.ts`, `slot-helpers.ts`,
 * and the catalog UI.
 */
export function resolvePattern(label: string | null | undefined): PatternDef | null {
  if (!label) return null;
  const norm = label.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!norm) return null;

  for (const def of Object.values(legacyPatternCatalog)) {
    if (def.label.toUpperCase() === norm) return def;
    if (def.aliases?.some((a) => a.toUpperCase() === norm)) return def;
  }

  const firstToken = norm.split(/[\s/>$]/)[0];
  for (const def of Object.values(legacyPatternCatalog)) {
    const canonFirst = def.label.toUpperCase().split(/[\s/>$]/)[0];
    if (firstToken && canonFirst === firstToken) return def;
    if (def.aliases?.some((a) => a.toUpperCase().split(/[\s/>$]/)[0] === firstToken)) return def;
  }

  const isShort = (s: string) => s.length <= 3;
  const wordBoundaryMatch = (haystack: string, needle: string): boolean => {
    const re = new RegExp(`(^|[^A-Z0-9])${needle.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^A-Z0-9]|$)`);
    return re.test(haystack);
  };
  for (const def of Object.values(legacyPatternCatalog)) {
    const lbl = def.label.toUpperCase();
    if (isShort(lbl) ? wordBoundaryMatch(norm, lbl) : norm.includes(lbl)) return def;
    if (
      def.aliases?.some((a) => {
        const au = a.toUpperCase();
        return isShort(au) ? wordBoundaryMatch(norm, au) : norm.includes(au);
      })
    ) {
      return def;
    }
  }

  return null;
}

export function derivePattern(
  role: 'DOCTOR' | 'HYGIENIST' | 'BOTH' | 'OTHER',
  lengthSlots: number
): StaffingCode[] {
  if (lengthSlots <= 0) return [];
  if (role === 'HYGIENIST') return Array(lengthSlots).fill('H');
  if (lengthSlots === 1) return ['D'];
  if (lengthSlots === 2) return ['A', 'D'];
  if (lengthSlots === 3) return ['A', 'D', 'A'];
  if (lengthSlots === 4) return ['A', 'D', 'D', 'A'];
  const arr: StaffingCode[] = Array(lengthSlots).fill('D');
  arr[0] = 'A';
  arr[1] = 'A';
  arr[lengthSlots - 1] = 'A';
  arr[lengthSlots - 2] = 'A';
  return arr;
}

// ---------------------------------------------------------------------------
// v2 catalog — X-segment canonical primitive (Sprint 1)
// ---------------------------------------------------------------------------

export interface V2Resolution {
  /** Canonical X-segment bands for this block type */
  xSegment: XSegmentTemplate;
  /** Where this template came from (telemetry / debug) */
  source: 'blockType.xSegment' | 'blockType.dATime' | 'legacyPatternCatalog' | 'derived';
  /** Legacy per-slot pattern (only populated for the legacy fallback path) */
  legacyPattern?: StaffingCode[];
}

export interface ResolvePatternArgs {
  blockType: BlockTypeInput;
  practiceModel: PracticeModelCode;
  /** 0-indexed column number (0 = primary, 1 = second op, ...) */
  column: number;
  coordinator?: MultiColumnCoordinator;
  /** Default unit minutes for decomposing the legacy pattern array */
  unitMin?: number;
}

/**
 * Sprint 1 — Resolve a BlockType into its X-segment template, consulting the
 * coordinator when the practice model allows multi-op. Returns the template
 * the generator should use to reserve the doctor D-band.
 *
 * Resolution order:
 *   1. blockType.xSegment (authoritative)
 *   2. blockType.dTimeMin + blockType.aTimeMin (D→doctorMin, A→asstPostMin)
 *   3. legacyPatternCatalog lookup by label → decompose pattern[]
 *   4. derivePattern(role, lengthSlots) → decompose
 *
 * `coordinator` is optional; when provided, the caller can subsequently use
 * `coordinator.findDoctorSegmentSlot()` with the returned template.
 */
export function resolvePatternV2(args: ResolvePatternArgs): V2Resolution {
  const { blockType } = args;
  const unitMin = args.unitMin ?? 10;

  // Path 1 — explicit X-segment template
  if (blockType.xSegment) {
    return { xSegment: blockType.xSegment, source: 'blockType.xSegment' };
  }

  // Path 2 — D/A fields (existing DB-backed block types)
  if ((blockType.dTimeMin ?? 0) > 0 || (blockType.aTimeMin ?? 0) > 0) {
    const doctorMin = blockType.dTimeMin ?? 0;
    const asstPostMin = blockType.aTimeMin ?? 0;
    const asstPreMin = Math.max(0, blockType.durationMin - doctorMin - asstPostMin);
    return {
      xSegment: {
        asstPreMin,
        doctorMin,
        asstPostMin,
        doctorContinuityRequired: blockType.doctorContinuityRequired ?? false,
      },
      source: 'blockType.dATime',
    };
  }

  // Path 3 — legacy catalog lookup by label
  const legacy = resolvePattern(blockType.label);
  if (legacy) {
    const decomposed = decomposeLegacyPattern(legacy.pattern, unitMin);
    return {
      xSegment: decomposed,
      source: 'legacyPatternCatalog',
      legacyPattern: legacy.pattern,
    };
  }

  // Path 4 — pure derivation
  const lengthSlots = Math.max(1, Math.floor(blockType.durationMin / unitMin));
  const role =
    blockType.appliesToRole === 'BOTH' || blockType.appliesToRole === 'DOCTOR'
      ? 'DOCTOR'
      : 'HYGIENIST';
  const derived = derivePattern(role as 'DOCTOR' | 'HYGIENIST', lengthSlots);
  return {
    xSegment: decomposeLegacyPattern(derived, unitMin),
    source: 'derived',
    legacyPattern: derived,
  };
}

/**
 * Decompose a legacy per-slot StaffingCode[] into an X-segment template.
 * Treats 'A' as assistant, 'D'|'H'|'E' as doctor/hygienist, null → 'A'.
 */
export function decomposeLegacyPattern(
  pattern: StaffingCode[],
  unitMin: number
): XSegmentTemplate {
  const normalized = pattern.map((c) => (c === 'A' || c == null ? 'A' : 'D'));

  let i = 0;
  let preSlots = 0;
  while (i < normalized.length && normalized[i] === 'A') {
    preSlots++;
    i++;
  }
  let docSlots = 0;
  while (i < normalized.length && normalized[i] !== 'A') {
    docSlots++;
    i++;
  }
  let postSlots = 0;
  while (i < normalized.length && normalized[i] === 'A') {
    postSlots++;
    i++;
  }
  // Tail (non-canonical) counts as post
  postSlots += normalized.length - i;

  return {
    asstPreMin: preSlots * unitMin,
    doctorMin: docSlots * unitMin,
    asstPostMin: postSlots * unitMin,
  };
}
