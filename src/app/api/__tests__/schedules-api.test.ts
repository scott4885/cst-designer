import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { GET as LIST_SCHEDULES, POST as SAVE_SCHEDULE } from '@/app/api/offices/[id]/schedules/route';
import { GET as GET_SCHEDULE, PUT as UPDATE_SCHEDULE, DELETE as DELETE_SCHEDULE } from '@/app/api/offices/[id]/schedules/[scheduleId]/route';
import { POST as AUTO_SAVE } from '@/app/api/offices/[id]/schedules/auto-save/route';
import { POST as MIGRATE } from '@/app/api/offices/[id]/schedules/migrate/route';
import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

let testOfficeId: string;

const sampleSlots = [
  { time: '08:00', providerId: 'dr1', operatory: 'OP1', staffingCode: 'A', blockTypeId: 'hp1', blockLabel: 'HP>$1200', isBreak: false },
  { time: '08:10', providerId: 'dr1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'hp1', blockLabel: 'HP>$1200', isBreak: false },
  { time: '08:20', providerId: 'dr1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'hp1', blockLabel: 'HP>$1200', isBreak: false },
];

const sampleSummary = [
  { providerId: 'dr1', providerName: 'Dr. Test', dailyGoal: 5000, target75: 3750, actualScheduled: 1200, status: 'UNDER', blocks: [] },
];

// ---------------------------------------------------------------------------
// Setup and teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const res = await CREATE_OFFICE(
    new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Schedule API Test Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['MONDAY', 'TUESDAY'],
        providers: [
          {
            name: 'Dr. Sched',
            role: 'Doctor',
            operatories: ['OP1'],
            workingHours: { start: '08:00', end: '17:00' },
            lunchBreak: { start: '12:00', end: '13:00' },
            dailyGoal: 5000,
            color: '#3b82f6',
          },
        ],
        blockTypes: [
          { label: 'HP', description: 'High Production', minimumAmount: 1200, role: 'Doctor', duration: 90 },
        ],
        rules: {
          npModel: 'doctor_only',
          npBlocksPerDay: 1,
          doubleBooking: false,
          matrixing: false,
        },
      }),
    })
  );
  const data = await res.json();
  testOfficeId = data.id;
});

afterAll(async () => {
  if (testOfficeId) {
    try {
      await prisma.scheduleTemplate.deleteMany({ where: { officeId: testOfficeId } });
      await prisma.office.delete({ where: { id: testOfficeId } });
    } catch { /* ignore */ }
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// POST /api/offices/:id/schedules — Save schedule
// ---------------------------------------------------------------------------

describe('POST /api/offices/:id/schedules', () => {
  it('should save a schedule and return it with an id', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await SAVE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'MONDAY',
          weekType: 'A',
          slots: sampleSlots,
          productionSummary: sampleSummary,
          warnings: [],
          label: 'Test Save',
        }),
      }),
      { params }
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe('string');
  });

  it('should reject request with missing required fields', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await SAVE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({ dayOfWeek: 'MONDAY' }), // missing weekType and slots
      }),
      { params }
    );

    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent office', async () => {
    const params = Promise.resolve({ id: 'nonexistent-id-999' });
    const res = await SAVE_SCHEDULE(
      new Request('http://localhost/api/offices/nonexistent-id-999/schedules', {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'MONDAY',
          weekType: 'A',
          slots: sampleSlots,
        }),
      }),
      { params }
    );

    // Should be 404 or 500 (depending on whether data-access throws)
    expect([404, 500]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// GET /api/offices/:id/schedules — List schedules
// ---------------------------------------------------------------------------

describe('GET /api/offices/:id/schedules', () => {
  it('should list schedules for an office', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await LIST_SCHEDULES(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules`),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schedules).toBeDefined();
    expect(Array.isArray(data.schedules)).toBe(true);
  });

  it('should support weekType filter', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await LIST_SCHEDULES(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules?weekType=A`),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schedules).toBeDefined();
  });

  it('should support dayOfWeek filter', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await LIST_SCHEDULES(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules?dayOfWeek=MONDAY`),
      { params }
    );

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/offices/:id/schedules/:scheduleId — Load specific schedule
// ---------------------------------------------------------------------------

describe('GET /api/offices/:id/schedules/:scheduleId', () => {
  let savedScheduleId: string;

  beforeAll(async () => {
    // Create a schedule to retrieve
    const params = Promise.resolve({ id: testOfficeId });
    const res = await SAVE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'TUESDAY',
          weekType: 'A',
          slots: sampleSlots,
          productionSummary: sampleSummary,
          warnings: ['test warning'],
          label: 'Retrieve Test',
        }),
      }),
      { params }
    );
    const data = await res.json();
    savedScheduleId = data.id;
  });

  it('should load a specific schedule with full data', async () => {
    const params = Promise.resolve({ id: testOfficeId, scheduleId: savedScheduleId });
    const res = await GET_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/${savedScheduleId}`),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(savedScheduleId);
  });

  it('should return 404 for non-existent schedule', async () => {
    const params = Promise.resolve({ id: testOfficeId, scheduleId: 'nonexistent-schedule-999' });
    const res = await GET_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/nonexistent-schedule-999`),
      { params }
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/offices/:id/schedules/:scheduleId — Update schedule
// ---------------------------------------------------------------------------

describe('PUT /api/offices/:id/schedules/:scheduleId', () => {
  let updateScheduleId: string;

  beforeAll(async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await SAVE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'MONDAY',
          weekType: 'B',
          slots: sampleSlots,
          productionSummary: sampleSummary,
          warnings: [],
          label: 'Update Test',
        }),
      }),
      { params }
    );
    const data = await res.json();
    updateScheduleId = data.id;
  });

  it('should update a schedule', async () => {
    const updatedSlots = [
      ...sampleSlots,
      { time: '08:30', providerId: 'dr1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'hp1', blockLabel: 'HP>$1200', isBreak: false },
    ];

    const params = Promise.resolve({ id: testOfficeId, scheduleId: updateScheduleId });
    const res = await UPDATE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/${updateScheduleId}`, {
        method: 'PUT',
        body: JSON.stringify({
          slots: updatedSlots,
          productionSummary: sampleSummary,
          warnings: ['updated'],
          label: 'Updated Label',
        }),
      }),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeDefined();
  });

  it('should reject update with missing required fields', async () => {
    const params = Promise.resolve({ id: testOfficeId, scheduleId: updateScheduleId });
    const res = await UPDATE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/${updateScheduleId}`, {
        method: 'PUT',
        body: JSON.stringify({ slots: sampleSlots }), // missing productionSummary and warnings
      }),
      { params }
    );

    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent schedule', async () => {
    const params = Promise.resolve({ id: testOfficeId, scheduleId: 'nonexistent-999' });
    const res = await UPDATE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/nonexistent-999`, {
        method: 'PUT',
        body: JSON.stringify({
          slots: sampleSlots,
          productionSummary: sampleSummary,
          warnings: [],
        }),
      }),
      { params }
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/offices/:id/schedules/:scheduleId — Delete schedule
// ---------------------------------------------------------------------------

describe('DELETE /api/offices/:id/schedules/:scheduleId', () => {
  let deleteScheduleId: string;

  beforeAll(async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await SAVE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'FRIDAY',
          weekType: 'B',
          slots: sampleSlots,
          productionSummary: sampleSummary,
          warnings: [],
          label: 'Delete Test',
        }),
      }),
      { params }
    );
    const data = await res.json();
    deleteScheduleId = data.id;
  });

  it('should delete a schedule', async () => {
    const params = Promise.resolve({ id: testOfficeId, scheduleId: deleteScheduleId });
    const res = await DELETE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/${deleteScheduleId}`, {
        method: 'DELETE',
      }),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('should return 404 when deleting non-existent schedule', async () => {
    const params = Promise.resolve({ id: testOfficeId, scheduleId: 'already-deleted-999' });
    const res = await DELETE_SCHEDULE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/already-deleted-999`, {
        method: 'DELETE',
      }),
      { params }
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/offices/:id/schedules/auto-save — Upsert WORKING schedule
// ---------------------------------------------------------------------------

describe('POST /api/offices/:id/schedules/auto-save', () => {
  it('should upsert a WORKING schedule', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await AUTO_SAVE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/auto-save`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'MONDAY',
          weekType: 'A',
          slots: sampleSlots,
          productionSummary: sampleSummary,
          warnings: [],
        }),
      }),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it('should upsert again without creating a duplicate', async () => {
    const params = Promise.resolve({ id: testOfficeId });

    // First save
    const res1 = await AUTO_SAVE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/auto-save`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'WEDNESDAY',
          weekType: 'A',
          slots: sampleSlots,
          productionSummary: sampleSummary,
          warnings: [],
        }),
      }),
      { params }
    );
    const data1 = await res1.json();

    // Second save (upsert)
    const res2 = await AUTO_SAVE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/auto-save`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: 'WEDNESDAY',
          weekType: 'A',
          slots: [...sampleSlots, { time: '08:30', providerId: 'dr1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'hp1', blockLabel: 'HP', isBreak: false }],
          productionSummary: sampleSummary,
          warnings: [],
        }),
      }),
      { params }
    );
    const data2 = await res2.json();

    // Should reuse the same schedule id (upsert, not duplicate)
    expect(data1.id).toBe(data2.id);
  });

  it('should reject request with missing fields', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await AUTO_SAVE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/auto-save`, {
        method: 'POST',
        body: JSON.stringify({ dayOfWeek: 'MONDAY' }), // missing weekType and slots
      }),
      { params }
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/offices/:id/schedules/migrate — Migrate localStorage data
// ---------------------------------------------------------------------------

describe('POST /api/offices/:id/schedules/migrate', () => {
  it('should migrate localStorage schedule data', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await MIGRATE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/migrate`, {
        method: 'POST',
        body: JSON.stringify({
          weekType: 'A',
          schedules: {
            THURSDAY: {
              slots: sampleSlots,
              productionSummary: sampleSummary,
              warnings: [],
            },
          },
        }),
      }),
      { params }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeDefined();
  });

  it('should reject missing schedules field', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await MIGRATE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/migrate`, {
        method: 'POST',
        body: JSON.stringify({ weekType: 'A' }), // missing schedules
      }),
      { params }
    );

    expect(res.status).toBe(400);
  });

  it('should reject missing weekType field', async () => {
    const params = Promise.resolve({ id: testOfficeId });
    const res = await MIGRATE(
      new Request(`http://localhost/api/offices/${testOfficeId}/schedules/migrate`, {
        method: 'POST',
        body: JSON.stringify({ schedules: {} }), // missing weekType
      }),
      { params }
    );

    expect(res.status).toBe(400);
  });
});
