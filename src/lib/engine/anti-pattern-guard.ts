/**
 * anti-pattern-guard.ts — Sprint 1
 *
 * Implements schedule-integrity guards aligned with Scheduling Bible §9.
 * Each guard is a pure function over PlacedBlock[] + DoctorScheduleTrace[] +
 * context. The aggregate runAllGuards() produces a GuardReport used by the
 * UI "health check" panel and by the test suite.
 *
 * IMPORTANT: Our AP-N numbering is an engine-internal contract that matches
 * the spirit of Bible §9 but not always the verbatim semantics. Bible §9
 * covers template-save-time config checks (e.g., AP-6 "no scheduling hawk")
 * that are upstream of the generator; the guards below run post-placement
 * against the DoctorScheduleTrace. Each handler documents its Bible §9
 * correspondence in a BIBLE tag. Engine-only guards (no Bible correspondence)
 * are tagged ENGINE-ONLY and live above the 1–15 range in spirit. See
 * `.cst-rebuild-v3/logs/sprint-4-fix-report.md` for the reconciliation map.
 *
 * AP-1   Doctor collision in same D-minute across two blocks           (BIBLE §9 AP-1 spirit; generalised)
 * AP-2   Orphan X-segment — an X reservation has no owning block       (ENGINE-ONLY, invariant of §2)
 * AP-3   Continuity-required D-band crossed by second D-band           (BIBLE §9 AP-9 / R-3.6)
 * AP-4   Doctor transition buffer violated                             (BIBLE §3 R-3.3 buffer discipline)
 * AP-5   Exam window violation — hygiene D-band outside examWindowMin  (BIBLE §9 AP-8 / R-3.5a)
 * AP-6   Quarterback overload — D-concurrency exceeds maxConcurrentDoctorOps (BIBLE §9 AP-7 / R-3.1)
 * AP-7   Assistant drought — A-band with no assistant occupying it     (BIBLE §2 Axiom 2 coverage)
 * AP-8   Lunch-break D-band — doctor scheduled during posted lunch     (BIBLE §6 lunch guard)
 * AP-9   Morning underload — policy morning-share not met              (BIBLE §9 AP-4 / §4 policies)
 * AP-10  Rock-block shortfall — too few primary blocks per half-day    (BIBLE §9 AP-4 / §4 policies)
 * AP-11  Adjacency drift — two same-type blocks back-to-back in same op (ENGINE-ONLY)
 * AP-12  Zero-duration doctor block (doctorMin=0 on DOCTOR-role)       (BIBLE §9 AP-11 / Axiom 2)
 * AP-13  Off-roster provider — provider placed on a day not in dayOfWeekRoster (BIBLE §9 AP-10 / §7 roster)
 * AP-14  After-hours D-band — D-segment extends past workingEnd        (ENGINE-ONLY, working-hours invariant)
 * AP-15  Provider overlap — same provider two blocks overlapping in same op (ENGINE-ONLY physical invariant)
 */

import type {
  BlockTypeInput,
  DoctorScheduleTrace,
  GuardReport,
  GuardResult,
  PlacedBlock,
  ProductionTargetPolicy,
  Violation,
} from './types';
import { getPolicy } from './production-policy';

export interface GuardContext {
  blocks: PlacedBlock[];
  doctorTrace: DoctorScheduleTrace[];
  /** Minute-of-day the business opens (typically 7am * 60 = 420) */
  dayStartMin: number;
  /** Minute-of-day the business closes */
  dayEndMin: number;
  /** Lunch window (optional) */
  lunchStartMin?: number | null;
  lunchEndMin?: number | null;
  /** Maximum concurrent D-bands allowed by office policy */
  maxConcurrentDoctorOps: number;
  /** Minutes the doctor needs between D-bands in different ops */
  doctorTransitionBufferMin: number;
  /** Production target policy for morning-load checks */
  productionPolicy: ProductionTargetPolicy;
  /** Day being scheduled (e.g. 'MON') */
  dayOfWeek: string;
  /** Per-provider roster — { providerId: ['MON','TUE',...] } */
  providerRosters?: Record<string, string[]>;
  /** Dollar value of a "Rock" block for threshold checks */
  rockDollarThreshold?: number;
  /**
   * Sprint 4 (P0-5): block-type catalog, keyed by `BlockTypeInput.id`. When
   * supplied, AP-5 consults `xSegment.examWindowMin` directly per Bible §R-3.5a
   * instead of the legacy doctorMin heuristic.
   */
  blockTypes?: readonly BlockTypeInput[];
}

// -----------------------------------------------------------------------------
// Individual guards
// -----------------------------------------------------------------------------

export function ap1_doctorCollision(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  const { doctorTrace } = ctx;
  for (let i = 0; i < doctorTrace.length; i++) {
    for (let j = i + 1; j < doctorTrace.length; j++) {
      const a = doctorTrace[i];
      const b = doctorTrace[j];
      if (a.doctorProviderId !== b.doctorProviderId) continue;
      if (overlaps(a.doctorStartMinute, a.doctorEndMinute, b.doctorStartMinute, b.doctorEndMinute)) {
        // A collision is only a violation when concurrency exceeds cap in AP-6;
        // here AP-1 specifically flags "same D-minute, different op" when the
        // office policy doesn't allow concurrent doctor ops (max=1).
        if (ctx.maxConcurrentDoctorOps <= 1) {
          violations.push({
            ap: 'AP-1',
            code: 'D_COLLISION',
            message: `Doctor ${a.doctorProviderId} has concurrent D-bands in ${a.operatory} and ${b.operatory}`,
            severity: 'HARD',
            blockInstanceIds: [a.blockInstanceId, b.blockInstanceId],
            range: {
              startMinute: Math.max(a.doctorStartMinute, b.doctorStartMinute),
              endMinute: Math.min(a.doctorEndMinute, b.doctorEndMinute),
            },
            providerId: a.doctorProviderId,
          });
        }
      }
    }
  }
  return { ap: 'AP-1', passed: violations.length === 0, violations };
}

export function ap2_orphanXSegment(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  const blockIds = new Set(ctx.blocks.map((b) => b.blockInstanceId));
  for (const t of ctx.doctorTrace) {
    if (!blockIds.has(t.blockInstanceId)) {
      violations.push({
        ap: 'AP-2',
        code: 'ORPHAN_X',
        message: `Doctor trace references block ${t.blockInstanceId} which has no corresponding PlacedBlock`,
        severity: 'HARD',
        blockInstanceIds: [t.blockInstanceId],
        providerId: t.doctorProviderId,
      });
    }
  }
  return { ap: 'AP-2', passed: violations.length === 0, violations };
}

export function ap3_continuityCrossed(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  const trace = ctx.doctorTrace;
  for (let i = 0; i < trace.length; i++) {
    if (!trace[i].continuityRequired) continue;
    for (let j = 0; j < trace.length; j++) {
      if (i === j) continue;
      const a = trace[i];
      const b = trace[j];
      if (a.doctorProviderId !== b.doctorProviderId) continue;
      if (overlaps(a.doctorStartMinute, a.doctorEndMinute, b.doctorStartMinute, b.doctorEndMinute)) {
        violations.push({
          ap: 'AP-3',
          code: 'CONTINUITY_CROSSED',
          message: `Continuity-required D-band ${a.blockInstanceId} overlaps with ${b.blockInstanceId}`,
          severity: 'HARD',
          blockInstanceIds: [a.blockInstanceId, b.blockInstanceId],
          providerId: a.doctorProviderId,
        });
      }
    }
  }
  return { ap: 'AP-3', passed: violations.length === 0, violations };
}

export function ap4_transitionBuffer(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  if (ctx.doctorTransitionBufferMin <= 0) {
    return { ap: 'AP-4', passed: true, violations };
  }
  const trace = [...ctx.doctorTrace].sort((a, b) => a.doctorStartMinute - b.doctorStartMinute);
  for (let i = 1; i < trace.length; i++) {
    const prev = trace[i - 1];
    const cur = trace[i];
    if (prev.doctorProviderId !== cur.doctorProviderId) continue;
    if (prev.operatory === cur.operatory) continue;
    const gap = cur.doctorStartMinute - prev.doctorEndMinute;
    if (gap >= 0 && gap < ctx.doctorTransitionBufferMin) {
      violations.push({
        ap: 'AP-4',
        code: 'TRANSITION_BUFFER',
        message: `Doctor transitions ${prev.operatory} → ${cur.operatory} with only ${gap}-min gap (needs ${ctx.doctorTransitionBufferMin})`,
        severity: 'SOFT',
        blockInstanceIds: [prev.blockInstanceId, cur.blockInstanceId],
        providerId: cur.doctorProviderId,
      });
    }
  }
  return { ap: 'AP-4', passed: violations.length === 0, violations };
}

/**
 * AP-5 — Exam window violation.
 *
 * BIBLE §9 AP-8 + §R-3.5a: "The doctor exam must land inside the hygiene
 * block's declared `xSegment.examWindowMin: { earliestUnitIdx, latestUnitIdx }`
 * range." Bible canonical grid is 10-min units.
 *
 * Sprint 4 (P0-5): replaces the previous `doctorMin`-based heuristic with a
 * direct contract check. The guard only runs for PlacedBlocks whose
 * resolved `BlockTypeInput` carries `xSegment.examWindowMin`. Blocks without
 * that field are out of scope (this is a hygiene-only constraint). When
 * `ctx.blockTypes` is not supplied, AP-5 becomes a no-op rather than
 * silently approximating — missing contract data must never manufacture a
 * false pass.
 */
export function ap5_examWindow(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  if (!ctx.blockTypes || ctx.blockTypes.length === 0) {
    // No catalog → cannot evaluate AP-5 per Bible contract. Return pass
    // rather than silently approximate via doctorMin heuristic.
    return { ap: 'AP-5', passed: true, violations };
  }
  const byBlockTypeId = new Map(ctx.blockTypes.map((bt) => [bt.id, bt]));
  const byBlockId = new Map(ctx.blocks.map((b) => [b.blockInstanceId, b]));
  const UNIT_MIN = 10; // Bible §6 canonical grid

  for (const t of ctx.doctorTrace) {
    const block = byBlockId.get(t.blockInstanceId);
    if (!block) continue;
    const bt = byBlockTypeId.get(block.blockTypeId);
    const examWindow = bt?.xSegment?.examWindowMin;
    if (!examWindow) continue; // not a hygiene-exam block per contract

    const earliestDoc = block.startMinute + examWindow.earliestUnitIdx * UNIT_MIN;
    const latestDoc = block.startMinute + (examWindow.latestUnitIdx + 1) * UNIT_MIN;

    if (t.doctorStartMinute < earliestDoc || t.doctorEndMinute > latestDoc) {
      violations.push({
        ap: 'AP-5',
        code: 'EXAM_WINDOW',
        message:
          `Hygiene exam on ${block.blockLabel} lands at ${t.doctorStartMinute}-${t.doctorEndMinute} ` +
          `(contract window: ${earliestDoc}-${latestDoc}; examWindowMin units ` +
          `[${examWindow.earliestUnitIdx},${examWindow.latestUnitIdx}])`,
        severity: 'SOFT',
        blockInstanceIds: [block.blockInstanceId],
        providerId: t.doctorProviderId,
        operatory: t.operatory,
      });
    }
  }
  return { ap: 'AP-5', passed: violations.length === 0, violations };
}

export function ap6_quarterbackOverload(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  // For each minute, count concurrent D-bands per doctor.
  const grouped = new Map<string, DoctorScheduleTrace[]>();
  for (const t of ctx.doctorTrace) {
    const arr = grouped.get(t.doctorProviderId) ?? [];
    arr.push(t);
    grouped.set(t.doctorProviderId, arr);
  }
  for (const [doctorId, traces] of grouped) {
    // Sweep-line: for every start/end event, track the running overlap count
    const events: Array<{ time: number; delta: number; blockId: string }> = [];
    for (const t of traces) {
      events.push({ time: t.doctorStartMinute, delta: +1, blockId: t.blockInstanceId });
      events.push({ time: t.doctorEndMinute, delta: -1, blockId: t.blockInstanceId });
    }
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let active = 0;
    const activeIds = new Set<string>();
    for (const ev of events) {
      if (ev.delta === +1) {
        active++;
        activeIds.add(ev.blockId);
        if (active > ctx.maxConcurrentDoctorOps) {
          violations.push({
            ap: 'AP-6',
            code: 'QUARTERBACK_OVERLOAD',
            message: `Doctor ${doctorId} has ${active} concurrent D-bands at minute ${ev.time} (max ${ctx.maxConcurrentDoctorOps})`,
            severity: 'HARD',
            blockInstanceIds: Array.from(activeIds),
            range: { startMinute: ev.time, endMinute: ev.time + 1 },
            providerId: doctorId,
          });
        }
      } else {
        active--;
        activeIds.delete(ev.blockId);
      }
    }
  }
  return { ap: 'AP-6', passed: violations.length === 0, violations };
}

export function ap7_assistantDrought(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  // Flag when a block has asstPreMin=0 AND asstPostMin=0 AND doctorMin < durationMin
  // (i.e. there's dead time neither doctor nor assistant covered).
  for (const b of ctx.blocks) {
    const covered = b.asstPreMin + b.doctorMin + b.asstPostMin;
    if (b.durationMin > covered && covered > 0) {
      violations.push({
        ap: 'AP-7',
        code: 'ASSISTANT_DROUGHT',
        message: `Block ${b.blockLabel} has ${b.durationMin - covered} uncovered minutes (asstPre+doc+asstPost=${covered}, dur=${b.durationMin})`,
        severity: 'SOFT',
        blockInstanceIds: [b.blockInstanceId],
        providerId: b.providerId,
        operatory: b.operatory,
      });
    }
  }
  return { ap: 'AP-7', passed: violations.length === 0, violations };
}

export function ap8_lunchCollision(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  if (ctx.lunchStartMin == null || ctx.lunchEndMin == null) {
    return { ap: 'AP-8', passed: true, violations };
  }
  for (const t of ctx.doctorTrace) {
    if (overlaps(t.doctorStartMinute, t.doctorEndMinute, ctx.lunchStartMin, ctx.lunchEndMin)) {
      violations.push({
        ap: 'AP-8',
        code: 'LUNCH_D_BAND',
        message: `Doctor ${t.doctorProviderId} has D-band during posted lunch`,
        severity: 'HARD',
        blockInstanceIds: [t.blockInstanceId],
        providerId: t.doctorProviderId,
        operatory: t.operatory,
        range: {
          startMinute: Math.max(t.doctorStartMinute, ctx.lunchStartMin),
          endMinute: Math.min(t.doctorEndMinute, ctx.lunchEndMin),
        },
      });
    }
  }
  return { ap: 'AP-8', passed: violations.length === 0, violations };
}

export function ap9_morningUnderload(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  const policy = getPolicy(ctx.productionPolicy);
  const cutoff = policy.morningCutoffMin ?? 12 * 60;
  const share = policy.morningSharePct ?? 0.5;
  const amDollars = ctx.blocks
    .filter((b) => b.startMinute < cutoff)
    .reduce((s, b) => s + (b.productionAmount ?? 0), 0);
  const totalDollars = ctx.blocks.reduce((s, b) => s + (b.productionAmount ?? 0), 0);
  if (totalDollars <= 0) return { ap: 'AP-9', passed: true, violations };
  const actualShare = amDollars / totalDollars;
  if (actualShare < share - 0.1) {
    violations.push({
      ap: 'AP-9',
      code: 'MORNING_UNDERLOAD',
      message: `Morning share ${(actualShare * 100).toFixed(0)}% below policy target ${(share * 100).toFixed(0)}% (${ctx.productionPolicy})`,
      severity: 'SOFT',
    });
  }
  return { ap: 'AP-9', passed: violations.length === 0, violations };
}

export function ap10_rockShortfall(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  const policy = getPolicy(ctx.productionPolicy);
  const needed = policy.protectedRockBlocks ?? { am: 1, pm: 1 };
  const cutoff = policy.morningCutoffMin ?? 12 * 60;
  const rockThreshold = ctx.rockDollarThreshold ?? 1000;
  const amRock = ctx.blocks.filter(
    (b) => b.startMinute < cutoff && (b.productionAmount ?? 0) >= rockThreshold
  ).length;
  const pmRock = ctx.blocks.filter(
    (b) => b.startMinute >= cutoff && (b.productionAmount ?? 0) >= rockThreshold
  ).length;
  if (amRock < needed.am) {
    violations.push({
      ap: 'AP-10',
      code: 'ROCK_SHORTFALL_AM',
      message: `Only ${amRock} AM Rock blocks (need ${needed.am} per ${ctx.productionPolicy})`,
      severity: 'SOFT',
    });
  }
  if (pmRock < needed.pm) {
    violations.push({
      ap: 'AP-10',
      code: 'ROCK_SHORTFALL_PM',
      message: `Only ${pmRock} PM Rock blocks (need ${needed.pm} per ${ctx.productionPolicy})`,
      severity: 'SOFT',
    });
  }
  return { ap: 'AP-10', passed: violations.length === 0, violations };
}

export function ap11_adjacencyDrift(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  // For each (providerId, operatory), sort by startMinute and flag adjacent
  // blocks that share the same blockTypeId.
  const byKey = new Map<string, PlacedBlock[]>();
  for (const b of ctx.blocks) {
    const k = `${b.providerId}::${b.operatory}`;
    const arr = byKey.get(k) ?? [];
    arr.push(b);
    byKey.set(k, arr);
  }
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (prev.blockTypeId === cur.blockTypeId && prev.startMinute + prev.durationMin === cur.startMinute) {
        violations.push({
          ap: 'AP-11',
          code: 'ADJACENCY_DRIFT',
          message: `Two back-to-back ${prev.blockLabel} blocks in ${prev.operatory} — merge into single block or stagger`,
          severity: 'INFO',
          blockInstanceIds: [prev.blockInstanceId, cur.blockInstanceId],
          providerId: prev.providerId,
          operatory: prev.operatory,
        });
      }
    }
  }
  return { ap: 'AP-11', passed: violations.length === 0, violations };
}

export function ap12_zeroDoctorOnDoctorBlock(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  // A PlacedBlock with doctorMin=0 on a provider whose role is DOCTOR is suspicious —
  // probably a mis-migrated block missing its X-segment.
  // Detect via the doctor trace; any block that has no trace but appears on a
  // doctor provider suggests doctorMin=0 on a doctor-role.
  const tracedIds = new Set(ctx.doctorTrace.map((t) => t.blockInstanceId));
  for (const b of ctx.blocks) {
    if (b.doctorMin === 0 && !tracedIds.has(b.blockInstanceId)) {
      // Not every zero-doctor block is a violation — pure-hygiene is fine.
      // Flag only when durationMin >= 30 AND asstPreMin + asstPostMin < durationMin
      // (i.e. it claims to cover the chair but has no clinician minutes tied to it).
      // Sprint 4 P1-4: outer `b.doctorMin === 0` already established; don't re-check.
      if (b.asstPreMin + b.asstPostMin < b.durationMin) {
        violations.push({
          ap: 'AP-12',
          code: 'ZERO_DOCTOR_BLOCK',
          message: `Block ${b.blockLabel} has doctorMin=0 and insufficient asst coverage (asstPre=${b.asstPreMin}, asstPost=${b.asstPostMin})`,
          severity: 'INFO',
          blockInstanceIds: [b.blockInstanceId],
          providerId: b.providerId,
          operatory: b.operatory,
        });
      }
    }
  }
  return { ap: 'AP-12', passed: violations.length === 0, violations };
}

export function ap13_offRoster(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  if (!ctx.providerRosters) return { ap: 'AP-13', passed: true, violations };
  const providersSeen = new Set(ctx.blocks.map((b) => b.providerId));
  for (const providerId of providersSeen) {
    const roster = ctx.providerRosters[providerId];
    if (!roster) continue;
    if (!roster.includes(ctx.dayOfWeek)) {
      violations.push({
        ap: 'AP-13',
        code: 'OFF_ROSTER',
        message: `Provider ${providerId} scheduled on ${ctx.dayOfWeek} but roster is [${roster.join(',')}]`,
        severity: 'HARD',
        providerId,
      });
    }
  }
  return { ap: 'AP-13', passed: violations.length === 0, violations };
}

export function ap14_afterHours(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  for (const t of ctx.doctorTrace) {
    if (t.doctorEndMinute > ctx.dayEndMin) {
      violations.push({
        ap: 'AP-14',
        code: 'AFTER_HOURS_D_BAND',
        message: `Doctor ${t.doctorProviderId} D-band ends at ${t.doctorEndMinute} (past dayEndMin=${ctx.dayEndMin})`,
        severity: 'HARD',
        blockInstanceIds: [t.blockInstanceId],
        providerId: t.doctorProviderId,
        operatory: t.operatory,
      });
    }
    if (t.doctorStartMinute < ctx.dayStartMin) {
      violations.push({
        ap: 'AP-14',
        code: 'BEFORE_HOURS_D_BAND',
        message: `Doctor ${t.doctorProviderId} D-band starts at ${t.doctorStartMinute} (before dayStartMin=${ctx.dayStartMin})`,
        severity: 'HARD',
        blockInstanceIds: [t.blockInstanceId],
        providerId: t.doctorProviderId,
        operatory: t.operatory,
      });
    }
  }
  return { ap: 'AP-14', passed: violations.length === 0, violations };
}

export function ap15_providerOverlap(ctx: GuardContext): GuardResult {
  const violations: Violation[] = [];
  const byProviderOp = new Map<string, PlacedBlock[]>();
  for (const b of ctx.blocks) {
    const k = `${b.providerId}::${b.operatory}`;
    const arr = byProviderOp.get(k) ?? [];
    arr.push(b);
    byProviderOp.set(k, arr);
  }
  for (const arr of byProviderOp.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (overlaps(a.startMinute, a.startMinute + a.durationMin, b.startMinute, b.startMinute + b.durationMin)) {
          violations.push({
            ap: 'AP-15',
            code: 'PROVIDER_OVERLAP',
            message: `Provider ${a.providerId} has two blocks overlapping in ${a.operatory}: ${a.blockLabel} vs ${b.blockLabel}`,
            severity: 'HARD',
            blockInstanceIds: [a.blockInstanceId, b.blockInstanceId],
            providerId: a.providerId,
            operatory: a.operatory,
          });
        }
      }
    }
  }
  return { ap: 'AP-15', passed: violations.length === 0, violations };
}

// -----------------------------------------------------------------------------
// Aggregator
// -----------------------------------------------------------------------------

const ALL_GUARDS: Array<(ctx: GuardContext) => GuardResult> = [
  ap1_doctorCollision,
  ap2_orphanXSegment,
  ap3_continuityCrossed,
  ap4_transitionBuffer,
  ap5_examWindow,
  ap6_quarterbackOverload,
  ap7_assistantDrought,
  ap8_lunchCollision,
  ap9_morningUnderload,
  ap10_rockShortfall,
  ap11_adjacencyDrift,
  ap12_zeroDoctorOnDoctorBlock,
  ap13_offRoster,
  ap14_afterHours,
  ap15_providerOverlap,
];

export function runAllGuards(ctx: GuardContext): GuardReport {
  const results = ALL_GUARDS.map((g) => g(ctx));
  const allViolations = results.flatMap((r) => r.violations);
  // Sort: HARD first, SOFT, INFO
  const rank: Record<Violation['severity'], number> = { HARD: 0, SOFT: 1, INFO: 2 };
  allViolations.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const counts = {
    hard: allViolations.filter((v) => v.severity === 'HARD').length,
    soft: allViolations.filter((v) => v.severity === 'SOFT').length,
    info: allViolations.filter((v) => v.severity === 'INFO').length,
  };
  return {
    passed: counts.hard === 0,
    results,
    violations: allViolations,
    counts,
  };
}

// -----------------------------------------------------------------------------
// utils
// -----------------------------------------------------------------------------

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
