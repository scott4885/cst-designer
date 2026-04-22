/**
 * MultiColumnCoordinator — Sprint 1
 *
 * The authoritative solver for doctor-X segment placement across N operatory
 * columns for a single doctor. Replaces the legacy "zigzag against D-minutes"
 * heuristic in rock-sand-water.ts.
 *
 * Core invariants (Bible §3):
 *   R-3.1  Doctor is a singleton per-minute resource (except when the office
 *          policy explicitly allows maxConcurrentDoctorOps > 1 AND no block
 *          involved has doctorContinuityRequired=true).
 *   R-3.2  Doctor transitions between columns respect doctorTransitionBufferMin
 *          (default 0 on 10-min grids, can be 5 on 5-min grids).
 *   R-3.3  EFDA scope level gates maxConcurrentDoctorOps:
 *             NONE    → max 1 (even if configured higher)
 *             LIMITED → max 2
 *             BROAD   → max configured (up to 4)
 *   R-3.4  Zigzag: when reserving the second/third column, prefer offsets that
 *          avoid collision AND keep assistant pre/post bands concurrent-safe.
 *   R-3.5  Exam window: hygiene D-bands must land inside their examWindowMin
 *          range (middle 30 min of a 60-min recall by default).
 *   R-3.6  continuityRequired D-bands serialize — no concurrent D-bands may
 *          overlap a continuity-required band, regardless of maxConcurrent.
 *
 * The coordinator operates on minute-of-day resolution and tracks a per-minute
 * occupancy map of the doctor (or doctors, if multi-doctor).
 */

import type { DoctorScheduleTrace, XSegmentTemplate } from './types';

export interface CoordinatorConfig {
  /** Minutes from start-of-day the doctor is available (workingStart) */
  readonly dayStartMin: number;
  /** Minutes from start-of-day the doctor is unavailable (workingEnd) */
  readonly dayEndMin: number;
  /** Optional lunch break window; no D-band may be scheduled inside */
  readonly lunchStartMin?: number | null;
  readonly lunchEndMin?: number | null;
  /** Per Bible §3.3 gate; 1 = strict singleton, 2+ = quarterback */
  readonly maxConcurrentDoctorOps: number;
  /** Minutes the doctor needs between two D-bands in different ops */
  readonly doctorTransitionBufferMin: number;
  /** EFDA scope level — hard-caps maxConcurrentDoctorOps */
  readonly efdaScopeLevel?: 'NONE' | 'LIMITED' | 'BROAD';
  /** Doctor provider id — used for trace entries */
  readonly doctorProviderId: string;
}

export interface PlacementRequest {
  /** Unique id (assigned by caller) identifying the target placed block */
  readonly blockInstanceId: string;
  /** Operatory this block is going in (unique per column) */
  readonly operatory: string;
  /** Minute-of-day the block's asstPreMin phase starts */
  readonly blockStartMin: number;
  /** X-segment template */
  readonly xSegment: XSegmentTemplate;
}

export interface PlacementResult {
  ok: boolean;
  /** Minute-of-day the doctor's D-band starts (block start + asstPreMin) */
  doctorStartMin?: number;
  /** Minute-of-day the doctor's D-band ends (exclusive) */
  doctorEndMin?: number;
  /** If !ok, the reason the coordinator refused */
  reason?:
    | 'OUTSIDE_WORKING_HOURS'
    | 'LUNCH_COLLISION'
    | 'DOCTOR_COLLISION'
    | 'CONTINUITY_COLLISION'
    | 'EXCEEDS_MAX_CONCURRENT'
    | 'TRANSITION_BUFFER_VIOLATION'
    | 'EXAM_WINDOW_VIOLATION'
    | 'OPERATORY_OCCUPIED';
  /** Optional list of blockInstanceIds that caused the collision */
  collidingWith?: string[];
}

/**
 * Phase 4 — Operatory occupancy record. A chair can only host one procedure
 * at a time (Bible §2). This is independent of doctor-concurrency: two
 * providers sharing an operatory would *not* trip AP-1/AP-6 (different
 * doctors) but would absolutely trip AP-15 (same-op overlap). The coordinator
 * now tracks this explicitly so the placement layer can detect and refuse
 * such placements before they reach the guard report.
 */
interface OperatoryBooking {
  /** Block instance that owns the booking — matches PlacedBlock.blockInstanceId */
  blockInstanceId: string;
  /** Operatory identifier (e.g. "R2", "OP8") */
  operatory: string;
  /** First minute-of-day the chair is occupied (inclusive) */
  startMin: number;
  /** Last minute-of-day the chair is occupied (exclusive) */
  endMin: number;
  /** Owning provider id — informational only */
  providerId?: string;
}

interface Reservation {
  blockInstanceId: string;
  operatory: string;
  doctorStartMin: number;
  doctorEndMin: number;
  continuityRequired: boolean;
  examWindow?: XSegmentTemplate['examWindowMin'];
  blockStartMin: number;
}

/**
 * Per-doctor coordinator. Caller instantiates one per Provider of role=DOCTOR
 * and feeds placement requests as RSW decides which block goes where.
 */
export class MultiColumnCoordinator {
  private readonly cfg: CoordinatorConfig;
  private readonly reservations: Reservation[] = [];
  /**
   * Phase 4 — Operatory bookings track chair-level occupancy so the
   * coordinator can reject placements that would create a same-op overlap
   * (AP-15) regardless of which doctor owns the block.
   */
  private readonly operatoryBookings: OperatoryBooking[] = [];

  constructor(cfg: CoordinatorConfig) {
    // Apply EFDA cap per R-3.3
    const efdaCap = scopeLevelToCap(cfg.efdaScopeLevel ?? 'NONE');
    const cap = Math.min(cfg.maxConcurrentDoctorOps, efdaCap);
    this.cfg = { ...cfg, maxConcurrentDoctorOps: Math.max(1, cap) };
  }

  /** Read-only snapshot of the doctor trace (exported at end of generation). */
  public trace(): DoctorScheduleTrace[] {
    return this.reservations.map((r, idx) => ({
      doctorStartMinute: r.doctorStartMin,
      doctorEndMinute: r.doctorEndMin,
      doctorProviderId: this.cfg.doctorProviderId,
      operatory: r.operatory,
      blockInstanceId: r.blockInstanceId,
      continuityRequired: r.continuityRequired,
      concurrencyIndex: this.countOverlappingAtStart(idx),
    }));
  }

  /** True when the given placement is admissible without mutating state. */
  public canPlaceDoctorSegment(req: PlacementRequest): PlacementResult {
    return this.check(req);
  }

  /**
   * Phase 4 — Chair-level occupancy check (pure, no mutation).
   *
   * Returns true when the full block footprint (asstPreMin + doctorMin +
   * asstPostMin) on the given operatory does not overlap any existing
   * operatory booking. This is the AP-15 regression shield — any placer
   * that consults the coordinator for operatory availability cannot admit
   * two providers into the same chair at overlapping times.
   */
  public canPlaceOnOperatory(args: {
    operatory: string;
    startMin: number;
    durMin: number;
    /** Optional — if provided, bookings with the same blockInstanceId are ignored (re-place). */
    blockInstanceId?: string;
  }): boolean {
    const endMin = args.startMin + args.durMin;
    for (const b of this.operatoryBookings) {
      if (b.operatory !== args.operatory) continue;
      if (args.blockInstanceId && b.blockInstanceId === args.blockInstanceId) continue;
      if (overlaps(args.startMin, endMin, b.startMin, b.endMin)) return false;
    }
    return true;
  }

  /**
   * Phase 4 — Commit a chair-level booking. Independent of the doctor
   * reservation log. Callers that use `placeBlockWithCoordinator` should
   * reserve BOTH the doctor segment AND the operatory footprint.
   */
  public reserveOperatory(args: {
    blockInstanceId: string;
    operatory: string;
    startMin: number;
    durMin: number;
    providerId?: string;
  }): { ok: boolean; reason?: PlacementResult['reason']; collidingWith?: string[] } {
    const endMin = args.startMin + args.durMin;
    const collisions = this.operatoryBookings
      .filter(
        (b) =>
          b.operatory === args.operatory &&
          b.blockInstanceId !== args.blockInstanceId &&
          overlaps(args.startMin, endMin, b.startMin, b.endMin),
      )
      .map((b) => b.blockInstanceId);
    if (collisions.length > 0) {
      return { ok: false, reason: 'OPERATORY_OCCUPIED', collidingWith: collisions };
    }
    this.operatoryBookings.push({
      blockInstanceId: args.blockInstanceId,
      operatory: args.operatory,
      startMin: args.startMin,
      endMin,
      providerId: args.providerId,
    });
    return { ok: true };
  }

  /** Read-only snapshot of operatory bookings (for tests and tracing). */
  public operatoryTrace(): ReadonlyArray<OperatoryBooking> {
    return this.operatoryBookings;
  }

  /**
   * Commit the placement to the coordinator's reservation log. Returns the
   * same PlacementResult shape as canPlaceDoctorSegment.
   */
  public reserveDoctorSegment(req: PlacementRequest): PlacementResult {
    const check = this.check(req);
    if (!check.ok) return check;
    const { blockStartMin, xSegment } = req;
    const doctorStartMin = blockStartMin + xSegment.asstPreMin;
    const doctorEndMin = doctorStartMin + xSegment.doctorMin;
    this.reservations.push({
      blockInstanceId: req.blockInstanceId,
      operatory: req.operatory,
      doctorStartMin,
      doctorEndMin,
      continuityRequired: !!xSegment.doctorContinuityRequired,
      examWindow: xSegment.examWindowMin,
      blockStartMin,
    });

    // Phase 4 — Also commit the chair-level booking so future placement
    // queries (including from a different provider's coordinator, when
    // coordinators are linked in a future sprint) see this operatory as
    // occupied for the full block span. De-dup on blockInstanceId in case
    // a caller re-reserves.
    const blockDur = xSegment.asstPreMin + xSegment.doctorMin + xSegment.asstPostMin;
    if (blockDur > 0) {
      const existing = this.operatoryBookings.findIndex(
        (b) => b.blockInstanceId === req.blockInstanceId,
      );
      const booking: OperatoryBooking = {
        blockInstanceId: req.blockInstanceId,
        operatory: req.operatory,
        startMin: blockStartMin,
        endMin: blockStartMin + blockDur,
        providerId: this.cfg.doctorProviderId,
      };
      if (existing >= 0) this.operatoryBookings[existing] = booking;
      else this.operatoryBookings.push(booking);
    }

    return {
      ok: true,
      doctorStartMin,
      doctorEndMin,
    };
  }

  /**
   * Search for the earliest block-start minute at or after `earliestStartMin`
   * where the given xSegment can be placed in the given operatory. Returns
   * `null` when no slot exists before `latestStartMin`.
   */
  public findDoctorSegmentSlot(args: {
    blockInstanceId: string;
    operatory: string;
    xSegment: XSegmentTemplate;
    earliestStartMin: number;
    latestStartMin: number;
    /** Step between attempts; typically the office time increment (10 or 15) */
    stepMin: number;
  }): PlacementResult & { blockStartMin?: number } {
    for (
      let t = args.earliestStartMin;
      t <= args.latestStartMin;
      t += args.stepMin
    ) {
      const r = this.check({
        blockInstanceId: args.blockInstanceId,
        operatory: args.operatory,
        blockStartMin: t,
        xSegment: args.xSegment,
      });
      if (r.ok) return { ...r, blockStartMin: t };
    }
    return { ok: false, reason: 'DOCTOR_COLLISION' };
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private check(req: PlacementRequest): PlacementResult {
    const { blockStartMin, xSegment, operatory } = req;
    const doctorStartMin = blockStartMin + xSegment.asstPreMin;
    const doctorEndMin = doctorStartMin + xSegment.doctorMin;
    const blockDur = xSegment.asstPreMin + xSegment.doctorMin + xSegment.asstPostMin;
    const blockEndMin = blockStartMin + blockDur;

    // Phase 4 — Chair-level availability check. Applies to every placement,
    // including zero-D-band (pure hygiene / blocked-out) blocks: the chair
    // is occupied for the full asstPreMin+doctorMin+asstPostMin span. Rejecting
    // same-op overlap here is the AP-15 regression shield.
    const opCollisions = this.operatoryBookings
      .filter(
        (b) =>
          b.operatory === operatory &&
          b.blockInstanceId !== req.blockInstanceId &&
          overlaps(blockStartMin, blockEndMin, b.startMin, b.endMin),
      )
      .map((b) => b.blockInstanceId);
    if (opCollisions.length > 0) {
      return {
        ok: false,
        reason: 'OPERATORY_OCCUPIED',
        collidingWith: opCollisions,
      };
    }

    // Zero-duration D-band (pure hygiene / blocked-out) is always admissible
    // for the doctor-track; chair was already validated above.
    if (xSegment.doctorMin <= 0) {
      return { ok: true, doctorStartMin, doctorEndMin };
    }

    // R-3.1 Working hours
    if (doctorStartMin < this.cfg.dayStartMin || doctorEndMin > this.cfg.dayEndMin) {
      return { ok: false, reason: 'OUTSIDE_WORKING_HOURS' };
    }

    // Lunch break
    if (
      this.cfg.lunchStartMin != null &&
      this.cfg.lunchEndMin != null &&
      overlaps(doctorStartMin, doctorEndMin, this.cfg.lunchStartMin, this.cfg.lunchEndMin)
    ) {
      return { ok: false, reason: 'LUNCH_COLLISION' };
    }

    // R-3.5 Exam window (hygiene)
    if (xSegment.examWindowMin) {
      const unitMin = 10; // Bible §6 canonical grid
      const earliestDoc = blockStartMin + xSegment.examWindowMin.earliestUnitIdx * unitMin;
      const latestDoc = blockStartMin + (xSegment.examWindowMin.latestUnitIdx + 1) * unitMin;
      if (doctorStartMin < earliestDoc || doctorEndMin > latestDoc) {
        return { ok: false, reason: 'EXAM_WINDOW_VIOLATION' };
      }
    }

    // R-3.6 Continuity collisions — any overlap with a continuity-required
    // reservation is fatal, AND a new continuity-required placement must not
    // overlap any existing reservation at all.
    const newRequiresContinuity = !!xSegment.doctorContinuityRequired;
    const overlapping = this.reservations.filter((r) =>
      overlaps(doctorStartMin, doctorEndMin, r.doctorStartMin, r.doctorEndMin)
    );
    const colliding = overlapping.map((r) => r.blockInstanceId);

    if (newRequiresContinuity && overlapping.length > 0) {
      return {
        ok: false,
        reason: 'CONTINUITY_COLLISION',
        collidingWith: colliding,
      };
    }
    if (overlapping.some((r) => r.continuityRequired)) {
      return {
        ok: false,
        reason: 'CONTINUITY_COLLISION',
        collidingWith: colliding,
      };
    }

    // R-3.1 / R-3.3 Max-concurrent cap
    // (overlapping.length) is the count of existing D-bands that overlap the
    // candidate; the new one would be at index overlapping.length + 1.
    if (overlapping.length + 1 > this.cfg.maxConcurrentDoctorOps) {
      return {
        ok: false,
        reason: 'EXCEEDS_MAX_CONCURRENT',
        collidingWith: colliding,
      };
    }

    // R-3.2 Transition-buffer violation — the doctor can't teleport.
    // If any reservation ends within bufferMin of this one starting in a DIFFERENT
    // operatory, reject. (Same operatory is fine; it's a continuous chair.)
    if (this.cfg.doctorTransitionBufferMin > 0) {
      for (const r of this.reservations) {
        if (r.operatory === operatory) continue;
        const gapAfter = doctorStartMin - r.doctorEndMin;
        const gapBefore = r.doctorStartMin - doctorEndMin;
        if (gapAfter >= 0 && gapAfter < this.cfg.doctorTransitionBufferMin) {
          return {
            ok: false,
            reason: 'TRANSITION_BUFFER_VIOLATION',
            collidingWith: [r.blockInstanceId],
          };
        }
        if (gapBefore >= 0 && gapBefore < this.cfg.doctorTransitionBufferMin) {
          return {
            ok: false,
            reason: 'TRANSITION_BUFFER_VIOLATION',
            collidingWith: [r.blockInstanceId],
          };
        }
      }
    }

    return { ok: true, doctorStartMin, doctorEndMin };
  }

  private countOverlappingAtStart(idx: number): number {
    const target = this.reservations[idx];
    let count = 0;
    for (let i = 0; i < this.reservations.length; i++) {
      if (i === idx) continue;
      const r = this.reservations[i];
      if (overlaps(target.doctorStartMin, target.doctorEndMin, r.doctorStartMin, r.doctorEndMin)) {
        count++;
      }
    }
    return count;
  }
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function scopeLevelToCap(level: 'NONE' | 'LIMITED' | 'BROAD'): number {
  switch (level) {
    case 'NONE':
      return 1;
    case 'LIMITED':
      return 2;
    case 'BROAD':
      return 4;
  }
}
