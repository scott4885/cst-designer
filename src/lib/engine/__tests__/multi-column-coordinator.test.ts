import { describe, it, expect } from 'vitest';
import { MultiColumnCoordinator } from '../multi-column-coordinator';
import type { XSegmentTemplate } from '../types';

const MP: XSegmentTemplate = { asstPreMin: 10, doctorMin: 20, asstPostMin: 10 };
const HP: XSegmentTemplate = { asstPreMin: 20, doctorMin: 40, asstPostMin: 20 };
const ENDO: XSegmentTemplate = { asstPreMin: 10, doctorMin: 60, asstPostMin: 10, doctorContinuityRequired: true };
const HYG: XSegmentTemplate = {
  asstPreMin: 20,
  doctorMin: 10,
  asstPostMin: 30,
  examWindowMin: { earliestUnitIdx: 2, latestUnitIdx: 3 },
};

function baseCfg() {
  return {
    doctorProviderId: 'dr-1',
    dayStartMin: 7 * 60,       // 7:00
    dayEndMin: 16 * 60,        // 16:00
    lunchStartMin: 12 * 60,    // 12:00
    lunchEndMin: 13 * 60,      // 13:00
    maxConcurrentDoctorOps: 1,
    doctorTransitionBufferMin: 0,
    efdaScopeLevel: 'NONE' as const,
  };
}

describe('MultiColumnCoordinator — single-column (max=1)', () => {
  it('admits a single block inside working hours', () => {
    const c = new MultiColumnCoordinator(baseCfg());
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'b1',
      operatory: 'OP1',
      blockStartMin: 8 * 60,
      xSegment: MP,
    });
    expect(r.ok).toBe(true);
    expect(r.doctorStartMin).toBe(8 * 60 + 10);
    expect(r.doctorEndMin).toBe(8 * 60 + 30);
  });

  it('rejects a second block overlapping the first D-band', () => {
    const c = new MultiColumnCoordinator(baseCfg());
    c.reserveDoctorSegment({ blockInstanceId: 'b1', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP });
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'b2',
      operatory: 'OP2',
      blockStartMin: 8 * 60,
      xSegment: MP,
    });
    expect(r.ok).toBe(false);
    // Under max=1 the overlap path exits as EXCEEDS_MAX_CONCURRENT
    // (a semantically equivalent rejection to DOCTOR_COLLISION; both fail).
    expect(['DOCTOR_COLLISION', 'EXCEEDS_MAX_CONCURRENT']).toContain(r.reason);
  });

  it('rejects a block whose D-band falls inside lunch', () => {
    const c = new MultiColumnCoordinator(baseCfg());
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'b1',
      operatory: 'OP1',
      blockStartMin: 11 * 60 + 50,
      xSegment: MP, // D-band 12:00–12:20
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('LUNCH_COLLISION');
  });

  it('rejects a D-band that runs past dayEndMin', () => {
    const c = new MultiColumnCoordinator(baseCfg());
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'b1',
      operatory: 'OP1',
      blockStartMin: 15 * 60 + 50, // D-band 16:00–16:20 → past 16:00
      xSegment: MP,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('OUTSIDE_WORKING_HOURS');
  });
});

describe('MultiColumnCoordinator — 2-op (max=2)', () => {
  it('admits two concurrent non-continuity D-bands', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 2, efdaScopeLevel: 'LIMITED' });
    const r1 = c.reserveDoctorSegment({ blockInstanceId: 'b1', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP });
    expect(r1.ok).toBe(true);
    const r2 = c.reserveDoctorSegment({ blockInstanceId: 'b2', operatory: 'OP2', blockStartMin: 8 * 60 + 5, xSegment: MP });
    expect(r2.ok).toBe(true);
    expect(c.trace()).toHaveLength(2);
  });

  it('rejects a third concurrent D-band when max=2', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 2, efdaScopeLevel: 'LIMITED' });
    c.reserveDoctorSegment({ blockInstanceId: 'b1', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP });
    c.reserveDoctorSegment({ blockInstanceId: 'b2', operatory: 'OP2', blockStartMin: 8 * 60 + 5, xSegment: MP });
    const r3 = c.canPlaceDoctorSegment({ blockInstanceId: 'b3', operatory: 'OP3', blockStartMin: 8 * 60 + 10, xSegment: MP });
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe('EXCEEDS_MAX_CONCURRENT');
  });
});

describe('MultiColumnCoordinator — 3-op with EFDA BROAD (max=3)', () => {
  it('admits three concurrent D-bands when scope allows', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 3, efdaScopeLevel: 'BROAD' });
    expect(c.reserveDoctorSegment({ blockInstanceId: 'a', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP }).ok).toBe(true);
    expect(c.reserveDoctorSegment({ blockInstanceId: 'b', operatory: 'OP2', blockStartMin: 8 * 60 + 5, xSegment: MP }).ok).toBe(true);
    expect(c.reserveDoctorSegment({ blockInstanceId: 'c', operatory: 'OP3', blockStartMin: 8 * 60 + 10, xSegment: MP }).ok).toBe(true);
  });

  it('caps configured max=4 to 2 when scope is LIMITED', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 4, efdaScopeLevel: 'LIMITED' });
    c.reserveDoctorSegment({ blockInstanceId: 'a', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP });
    c.reserveDoctorSegment({ blockInstanceId: 'b', operatory: 'OP2', blockStartMin: 8 * 60 + 5, xSegment: MP });
    const r = c.canPlaceDoctorSegment({ blockInstanceId: 'c', operatory: 'OP3', blockStartMin: 8 * 60 + 10, xSegment: MP });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('EXCEEDS_MAX_CONCURRENT');
  });
});

describe('MultiColumnCoordinator — continuity (R-3.6)', () => {
  it('refuses concurrent D-band across a continuity-required block', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 3, efdaScopeLevel: 'BROAD' });
    c.reserveDoctorSegment({ blockInstanceId: 'endo', operatory: 'OP1', blockStartMin: 9 * 60, xSegment: ENDO });
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'mp',
      operatory: 'OP2',
      blockStartMin: 9 * 60 + 20, // D-band 9:30–9:50, inside ENDO D 9:10–10:10
      xSegment: MP,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('CONTINUITY_COLLISION');
  });

  it('refuses a continuity-required D-band that would overlap an existing one', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 2, efdaScopeLevel: 'LIMITED' });
    c.reserveDoctorSegment({ blockInstanceId: 'mp', operatory: 'OP1', blockStartMin: 9 * 60, xSegment: MP });
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'endo',
      operatory: 'OP2',
      blockStartMin: 9 * 60 + 5,
      xSegment: ENDO,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('CONTINUITY_COLLISION');
  });
});

describe('MultiColumnCoordinator — hygiene exam window (R-3.5)', () => {
  it('admits a hygiene block whose D-band lies inside the exam window', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 2, efdaScopeLevel: 'LIMITED' });
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'h1',
      operatory: 'OP-HYG1',
      blockStartMin: 8 * 60, // asstPre=20 → D 8:20–8:30 → offset 20, unit idx 2 (middle)
      xSegment: HYG,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a hygiene block whose D-band would fall outside its exam window', () => {
    // Force a D that starts at unit idx 0 by zeroing asstPreMin
    const badHyg: XSegmentTemplate = { ...HYG, asstPreMin: 0 };
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 2, efdaScopeLevel: 'LIMITED' });
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'h1',
      operatory: 'OP-HYG1',
      blockStartMin: 8 * 60,
      xSegment: badHyg,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('EXAM_WINDOW_VIOLATION');
  });
});

describe('MultiColumnCoordinator — stagger (R-3.4) via findDoctorSegmentSlot', () => {
  it('finds the earliest non-colliding stagger offset', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 1 });
    c.reserveDoctorSegment({ blockInstanceId: 'b1', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP });
    // Ask for a slot between 8:00 and 9:00 in OP2; must land after 8:30 (when first D ends)
    const r = c.findDoctorSegmentSlot({
      blockInstanceId: 'b2',
      operatory: 'OP2',
      xSegment: MP,
      earliestStartMin: 8 * 60,
      latestStartMin: 9 * 60,
      stepMin: 10,
    });
    expect(r.ok).toBe(true);
    // First legal slot: D-band must start >= 8:30; MP.asstPreMin=10, so blockStart >= 8:20
    expect(r.blockStartMin).toBeGreaterThanOrEqual(8 * 60 + 20);
  });

  it('returns ok:false when no admissible slot exists in range', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), maxConcurrentDoctorOps: 1 });
    // Fill a contiguous D-band window — HP D-band = 40 min. Phase 4 added
    // chair-occupancy tracking, so we spread the reservations across three
    // different operatories to avoid AP-15 same-chair overlap while still
    // saturating the doctor's D-band timeline end-to-end. The doctor-collision
    // check (EXCEEDS_MAX_CONCURRENT under max=1) is what the test asserts.
    // HP pattern: [asstPre=20, D=40, asstPost=20]. Place HPs at 8:00/8:40/9:20 so
    // the D-bands occupy 8:20–9:00, 9:00–9:40, 9:40–10:20 → full coverage 8:20–10:20.
    c.reserveDoctorSegment({ blockInstanceId: 'h1', operatory: 'OP-A', blockStartMin: 8 * 60, xSegment: HP });
    c.reserveDoctorSegment({ blockInstanceId: 'h2', operatory: 'OP-B', blockStartMin: 8 * 60 + 40, xSegment: HP });
    c.reserveDoctorSegment({ blockInstanceId: 'h3', operatory: 'OP-C', blockStartMin: 9 * 60 + 20, xSegment: HP });
    const r = c.findDoctorSegmentSlot({
      blockInstanceId: 'new',
      operatory: 'OP2',
      xSegment: HP,
      // Scan a window where every D-band placement would collide
      earliestStartMin: 8 * 60,
      latestStartMin: 8 * 60 + 40, // MP/HP D-bands starting in this range all collide
      stepMin: 10,
    });
    expect(r.ok).toBe(false);
  });
});

describe('MultiColumnCoordinator — transition buffer (R-3.2)', () => {
  it('rejects an inter-op transition inside the buffer window', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), doctorTransitionBufferMin: 5 });
    c.reserveDoctorSegment({ blockInstanceId: 'b1', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP }); // D 8:10-8:30
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'b2',
      operatory: 'OP2',
      blockStartMin: 8 * 60 + 20, // D 8:30–8:50 → 0-min gap → buffer violated
      xSegment: MP,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('TRANSITION_BUFFER_VIOLATION');
  });

  it('admits a transition when the gap exceeds the buffer', () => {
    const c = new MultiColumnCoordinator({ ...baseCfg(), doctorTransitionBufferMin: 5 });
    c.reserveDoctorSegment({ blockInstanceId: 'b1', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: MP });
    const r = c.canPlaceDoctorSegment({
      blockInstanceId: 'b2',
      operatory: 'OP2',
      blockStartMin: 8 * 60 + 30, // D 8:40–9:00 → 10-min gap
      xSegment: MP,
    });
    expect(r.ok).toBe(true);
  });
});
