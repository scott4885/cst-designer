import { MultiColumnCoordinator } from '../src/lib/engine/multi-column-coordinator';
import type { XSegmentTemplate } from '../src/lib/engine/types';

const HP: XSegmentTemplate = { asstPreMin: 20, doctorMin: 40, asstPostMin: 20 };

const c = new MultiColumnCoordinator({
  doctorProviderId: 'dr-1',
  dayStartMin: 7 * 60,
  dayEndMin: 16 * 60,
  lunchStartMin: 12 * 60,
  lunchEndMin: 13 * 60,
  maxConcurrentDoctorOps: 1,
  doctorTransitionBufferMin: 0,
  efdaScopeLevel: 'NONE',
});

c.reserveDoctorSegment({ blockInstanceId: 'h1', operatory: 'OP1', blockStartMin: 8 * 60, xSegment: HP });
c.reserveDoctorSegment({ blockInstanceId: 'h2', operatory: 'OP1', blockStartMin: 8 * 60 + 40, xSegment: HP });
c.reserveDoctorSegment({ blockInstanceId: 'h3', operatory: 'OP1', blockStartMin: 9 * 60 + 20, xSegment: HP });

console.log('Reservations:', JSON.stringify(c.trace(), null, 2));
console.log('Bookings:', JSON.stringify(c.operatoryTrace(), null, 2));

for (let t = 8 * 60; t <= 8 * 60 + 40; t += 10) {
  const r = c.canPlaceDoctorSegment({
    blockInstanceId: 'new',
    operatory: 'OP2',
    blockStartMin: t,
    xSegment: HP,
  });
  console.log(`t=${t} ${Math.floor(t/60)}:${String(t%60).padStart(2,'0')} => ok=${r.ok} reason=${r.reason ?? ''}`);
}

const r = c.findDoctorSegmentSlot({
  blockInstanceId: 'new',
  operatory: 'OP2',
  xSegment: HP,
  earliestStartMin: 8 * 60,
  latestStartMin: 8 * 60 + 40,
  stepMin: 10,
});
console.log('findDoctorSegmentSlot:', r);
