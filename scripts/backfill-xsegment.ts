/**
 * scripts/backfill-xsegment.ts — Sprint 1
 *
 * Decompose legacy `pattern: StaffingCode[]` arrays on BlockType rows into the
 * Sprint 1 X-segment canonical primitive:
 *   { asstPreMin, doctorMin, asstPostMin }
 *
 * Decomposition heuristic (Bible §2.1, PRD-V4 §9.5):
 *   1. Leading run of 'A' codes  → asstPreMin = runLength * unitMin
 *   2. Middle run of 'D' or 'H'  → doctorMin  = runLength * unitMin
 *   3. Trailing run of 'A' codes → asstPostMin = runLength * unitMin
 *   4. Any `null` slots are treated as `A` (assistant-managed dead time).
 *
 * Fallback when `pattern` is null / empty but dTimeMin/aTimeMin present:
 *   asstPreMin  = 0
 *   doctorMin   = dTimeMin
 *   asstPostMin = aTimeMin
 *
 * Pure-hygiene fallback (isHygieneType && dTimeMin==0):
 *   asstPreMin  = max(durationMin - 10, 0)   // hygienist majority
 *   doctorMin   = 10                          // embedded doctor exam
 *   asstPostMin = 0
 *
 * Usage:
 *   npx tsx scripts/backfill-xsegment.ts          # dry-run (default)
 *   npx tsx scripts/backfill-xsegment.ts --apply  # write changes
 *   npx tsx scripts/backfill-xsegment.ts --apply --office=<id>  # one office only
 */

import { PrismaClient } from '../src/generated/prisma';

type StaffingCode = 'A' | 'D' | 'H' | 'E' | null;

interface DecomposedX {
  asstPreMin: number;
  doctorMin: number;
  asstPostMin: number;
  method: 'pattern' | 'd-a-fields' | 'hygiene-default' | 'duration-only';
  warning?: string;
}

export function decomposePattern(
  pattern: StaffingCode[] | null | undefined,
  dTimeMin: number,
  aTimeMin: number,
  durationMin: number,
  isHygieneType: boolean,
  unitMin = 10
): DecomposedX {
  // Path 1: pattern present → scan runs
  if (pattern && pattern.length > 0) {
    const normalized: Array<'A' | 'D' | 'H' | 'E' | 'X'> = pattern.map((c) => {
      if (c === 'D' || c === 'H' || c === 'E') return c;
      if (c === 'A') return 'A';
      return 'A'; // treat null/unknown as assistant
    });

    let i = 0;
    // Leading A-run
    let preSlots = 0;
    while (i < normalized.length && normalized[i] === 'A') {
      preSlots++;
      i++;
    }
    // Middle D/H/E run
    let docSlots = 0;
    while (i < normalized.length && normalized[i] !== 'A') {
      docSlots++;
      i++;
    }
    // Trailing A-run
    let postSlots = 0;
    while (i < normalized.length && normalized[i] === 'A') {
      postSlots++;
      i++;
    }
    // Anything else is a non-canonical pattern (e.g. A-D-A-D) — warn
    const tail = normalized.slice(i);
    const warning = tail.length > 0
      ? `non-canonical pattern tail: ${tail.join('')} (treated as asstPost)`
      : undefined;
    postSlots += tail.length;

    return {
      asstPreMin: preSlots * unitMin,
      doctorMin: docSlots * unitMin,
      asstPostMin: postSlots * unitMin,
      method: 'pattern',
      warning,
    };
  }

  // Path 2: dTimeMin / aTimeMin present
  if (dTimeMin > 0 || aTimeMin > 0) {
    return {
      asstPreMin: 0,
      doctorMin: dTimeMin,
      asstPostMin: aTimeMin,
      method: 'd-a-fields',
    };
  }

  // Path 3: hygiene with no D/A fields
  if (isHygieneType && durationMin > 0) {
    return {
      asstPreMin: Math.max(durationMin - 10, 0),
      doctorMin: 10,
      asstPostMin: 0,
      method: 'hygiene-default',
    };
  }

  // Path 4: doctor block with no D/A fields — treat entire duration as doctorMin
  return {
    asstPreMin: 0,
    doctorMin: durationMin,
    asstPostMin: 0,
    method: 'duration-only',
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const officeArg = args.find((a) => a.startsWith('--office='));
  const officeId = officeArg ? officeArg.split('=')[1] : undefined;

  const prisma = new PrismaClient();

  const where = officeId ? { officeId } : {};
  const blocks = await prisma.blockType.findMany({ where });

  console.log(
    `[backfill-xsegment] ${apply ? 'APPLY' : 'DRY-RUN'} — scanning ${blocks.length} block(s)${officeId ? ` in office ${officeId}` : ''}`
  );

  const stats = { updated: 0, skipped: 0, warnings: 0 };
  const rows: Array<{ id: string; label: string; before: string; after: string; method: string; warning?: string }> = [];

  for (const b of blocks) {
    // Current values (schema has no `pattern` column — it lived in app-layer JSON).
    // We backfill from dTimeMin / aTimeMin / durationMin / isHygieneType.
    // Columns added in migration 20260421000000_xsegment_and_policy. Types
    // arrive through the Prisma client as typed fields, but during the
    // migration window the generated client may lag — narrow via a type
    // guard instead of `any`.
    const xs = b as unknown as {
      asstPreMin?: number | null;
      doctorMin?: number | null;
      asstPostMin?: number | null;
    };
    const already =
      (xs.asstPreMin ?? 0) + (xs.doctorMin ?? 0) + (xs.asstPostMin ?? 0) > 0;
    if (already) {
      stats.skipped++;
      continue;
    }

    const x = decomposePattern(
      null, // DB never stored pattern[] — decomposition runs against D/A fields
      b.dTimeMin,
      b.aTimeMin,
      b.durationMin,
      b.isHygieneType
    );

    rows.push({
      id: b.id,
      label: b.label,
      before: `d=${b.dTimeMin} a=${b.aTimeMin} dur=${b.durationMin} hyg=${b.isHygieneType}`,
      after: `pre=${x.asstPreMin} doc=${x.doctorMin} post=${x.asstPostMin}`,
      method: x.method,
      warning: x.warning,
    });

    if (x.warning) stats.warnings++;

    if (apply) {
      await prisma.blockType.update({
        where: { id: b.id },
        data: {
          asstPreMin: x.asstPreMin,
          doctorMin: x.doctorMin,
          asstPostMin: x.asstPostMin,
        },
      });
      stats.updated++;
    }
  }

  // Report
  console.log('');
  console.log('LABEL                          | BEFORE                            | AFTER                       | METHOD');
  console.log('-------------------------------+-----------------------------------+-----------------------------+----------------');
  for (const r of rows) {
    const label = r.label.padEnd(30).substring(0, 30);
    const before = r.before.padEnd(33).substring(0, 33);
    const after = r.after.padEnd(27).substring(0, 27);
    console.log(`${label} | ${before} | ${after} | ${r.method}${r.warning ? ` (WARN: ${r.warning})` : ''}`);
  }
  console.log('');
  console.log(
    `[backfill-xsegment] ${apply ? 'updated' : 'would update'} ${rows.length} block(s), skipped ${stats.skipped} (already backfilled), ${stats.warnings} warning(s)`
  );

  if (!apply && rows.length > 0) {
    console.log('');
    console.log('Re-run with --apply to persist changes.');
  }

  await prisma.$disconnect();
}

// Only run when invoked directly (not imported from tests)
// Under tsx + Windows `file:` URLs, compare basenames.
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('scripts/backfill-xsegment.ts');

if (invokedDirectly) {
  main().catch((err) => {
    console.error('[backfill-xsegment] FATAL:', err);
    process.exit(1);
  });
}
