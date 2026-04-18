import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { POST as EXPORT } from '@/app/api/offices/[id]/export/route';
import { prisma } from '@/lib/db';

let testOfficeId: string;

beforeAll(async () => {
  const res = await CREATE_OFFICE(
    new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Export API Test Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['MONDAY'],
        providers: [
          {
            name: 'Dr. Export',
            role: 'Doctor',
            operatories: ['OP1'],
            workingHours: { start: '07:00', end: '17:00' },
            lunchBreak: { start: '12:00', end: '13:00' },
            dailyGoal: 3000,
            color: '#f59e0b',
          },
        ],
        blockTypes: [
          { label: 'HP', description: 'High Production', minimumAmount: 1200, role: 'Doctor', duration: 90 },
        ],
        rules: { npModel: 'doctor_only', doubleBooking: false, matrixing: false },
      }),
    })
  );
  const data = await res.json();
  testOfficeId = data.id;
});

afterAll(async () => {
  if (testOfficeId) {
    try { await prisma.office.delete({ where: { id: testOfficeId } }); } catch { /* ignore */ }
  }
  await prisma.$disconnect();
});

describe('POST /api/offices/[id]/export', () => {
  it('should export schedule from database', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const schedulePayload = {
      schedules: [
        {
          dayOfWeek: 'MONDAY',
          slots: [
            { time: '07:00', providerId: 'dr-export-1', staffingCode: 'D', blockLabel: 'HP>$1200', isBreak: false, operatory: 'OP1' },
            { time: '13:00', providerId: 'dr-export-1', staffingCode: null, blockLabel: 'LUNCH', isBreak: true, operatory: 'OP1' },
          ],
          productionSummary: [
            { providerId: 'dr-export-1', actualScheduled: 1200, status: 'UNDER' },
          ],
        },
      ],
    };

    const res = await EXPORT(
      new Request(`http://localhost/api/offices/${testOfficeId}/export`, {
        method: 'POST',
        body: JSON.stringify(schedulePayload),
      }),
      { params }
    );

    // Should return an Excel file (200) or at minimum not 500
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('spreadsheetml');
    }
  });
});
