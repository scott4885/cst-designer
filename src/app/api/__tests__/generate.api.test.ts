import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { POST as GENERATE } from '@/app/api/offices/[id]/generate/route';
import { prisma } from '@/lib/db';

let testOfficeId: string;

beforeAll(async () => {
  const res = await CREATE_OFFICE(
    new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Generate API Test Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['MONDAY'],
        providers: [
          {
            name: 'Dr. Generate',
            role: 'Doctor',
            operatories: ['OP1'],
            workingHours: { start: '07:00', end: '17:00' },
            lunchBreak: { start: '12:00', end: '13:00' },
            dailyGoal: 3000,
            color: '#10b981',
          },
        ],
        blockTypes: [
          { label: 'HP', description: 'High Production', minimumAmount: 1200, role: 'Doctor', duration: 90 },
          { label: 'NP CONS', description: 'New Patient', minimumAmount: 300, role: 'Doctor', duration: 40 },
          { label: 'ER', description: 'Emergency', minimumAmount: 187, role: 'Doctor', duration: 30 },
        ],
        rules: {
          npModel: 'doctor_only',
          npBlocksPerDay: 1,
          doubleBooking: false,
          matrixing: false,
          hpPlacement: 'morning',
        },
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

describe('POST /api/offices/[id]/generate', () => {
  it('should generate and save schedule to database', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await GENERATE(
      new Request(`http://localhost/api/offices/${testOfficeId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schedules).toBeDefined();
    expect(Array.isArray(data.schedules)).toBe(true);
    expect(data.schedules.length).toBeGreaterThan(0);

    const mondaySchedule = data.schedules.find((s: { dayOfWeek: string }) => s.dayOfWeek === 'MONDAY');
    expect(mondaySchedule).toBeDefined();
    expect(mondaySchedule.slots).toBeDefined();
    expect(Array.isArray(mondaySchedule.slots)).toBe(true);
    expect(mondaySchedule.slots.length).toBeGreaterThan(0);
  });
});
