import { describe, it, expect, afterAll } from 'vitest';
import { GET as LIST_OFFICES, POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { prisma } from '@/lib/db';

const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    try { await prisma.office.delete({ where: { id } }); } catch { /* ignore */ }
  }
  await prisma.$disconnect();
});

describe('GET /api/offices', () => {
  it('should return list of offices from database', async () => {
    const res = await LIST_OFFICES();
    expect(res.status).toBe(200);
    const offices = await res.json();
    expect(Array.isArray(offices)).toBe(true);
  });
});

describe('POST /api/offices', () => {
  it('should create office in database', async () => {
    const payload = {
      name: 'API Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['MONDAY', 'TUESDAY'],
      providers: [
        {
          name: 'Dr. API Test',
          role: 'Doctor',
          operatories: ['OP1'],
          workingHours: { start: '08:00', end: '17:00' },
          dailyGoal: 4000,
          color: '#3b82f6',
        },
      ],
      blockTypes: [
        {
          label: 'HP',
          description: 'High Production',
          minimumAmount: 1200,
          role: 'Doctor',
          duration: 90,
        },
      ],
      rules: {
        npModel: 'doctor_only',
        npBlocksPerDay: 1,
        doubleBooking: false,
        matrixing: false,
      },
    };

    const res = await CREATE_OFFICE(
      new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(201);
    const office = await res.json();
    expect(office.id).toBeDefined();
    expect(office.name).toBe('API Test Office');
    expect(office.providers).toHaveLength(1);
    createdIds.push(office.id);
  });
});
