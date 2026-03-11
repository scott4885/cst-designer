import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { GET as GET_OFFICE, PUT as UPDATE_OFFICE, DELETE as DELETE_OFFICE } from '@/app/api/offices/[id]/route';
import { prisma } from '@/lib/db';

let testOfficeId: string;

beforeAll(async () => {
  const res = await CREATE_OFFICE(
    new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'ID API Test Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['MONDAY'],
        providers: [
          { name: 'Dr. IDTest', role: 'Doctor', operatories: ['OP1'], workingHours: { start: '08:00', end: '17:00' }, dailyGoal: 4000, color: '#6366f1' },
        ],
        blockTypes: [],
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

describe('GET /api/offices/[id]', () => {
  it('should get office by ID from database', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${testOfficeId}`),
      { params }
    );
    expect(res.status).toBe(200);
    const office = await res.json();
    expect(office.id).toBe(testOfficeId);
    expect(office.name).toBe('ID API Test Office');
  });
});

describe('PUT /api/offices/[id]', () => {
  it('should update office in database', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${testOfficeId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated ID Test Office' }),
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const office = await res.json();
    expect(office.name).toBe('Updated ID Test Office');
  });
});

describe('DELETE /api/offices/[id]', () => {
  it('should delete office from database', async () => {
    // Create a dedicated office just for deletion
    const createRes = await CREATE_OFFICE(
      new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Office To Delete',
          dpmsSystem: 'Dentrix',
          workingDays: ['MONDAY'],
          providers: [],
          blockTypes: [],
          rules: {},
        }),
      })
    );
    const toDelete = await createRes.json();

    const params = Promise.resolve({ id: toDelete.id });
    const res = await DELETE_OFFICE(
      new Request(`http://localhost/api/offices/${toDelete.id}`, { method: 'DELETE' }),
      { params }
    );
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.success).toBe(true);

    // Verify gone
    const getParams = Promise.resolve({ id: toDelete.id });
    const getRes = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${toDelete.id}`),
      { params: getParams }
    );
    expect(getRes.status).toBe(404);
  });
});
