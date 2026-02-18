import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GET as LIST_OFFICES, POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { GET as GET_OFFICE, PUT as UPDATE_OFFICE, DELETE as DELETE_OFFICE } from '@/app/api/offices/[id]/route';
import { prisma } from '@/lib/db';

/**
 * Integration tests for complete Office CRUD flow
 * Tests the full lifecycle: Create → Read → Update → Delete
 * 
 * Note: These tests use the actual database and clean up after themselves
 */
describe('Office CRUD Flow Integration', () => {
  // Track created office IDs for cleanup
  const createdOfficeIds: string[] = [];

  beforeEach(async () => {
    // Clean up any offices created in previous tests
    for (const id of createdOfficeIds) {
      try {
        await prisma.office.delete({ where: { id } });
      } catch (e) {
        // Ignore if already deleted
      }
    }
    createdOfficeIds.length = 0;
  });

  afterAll(async () => {
    // Final cleanup
    for (const id of createdOfficeIds) {
      try {
        await prisma.office.delete({ where: { id } });
      } catch (e) {
        // Ignore if already deleted
      }
    }
    if (prisma) await prisma.$disconnect();
  });

  it('should complete full CRUD cycle successfully', async () => {
    // ========== CREATE ==========
    const newOffice = {
      name: 'Integration Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      providers: [
        {
          name: 'Dr. Integration',
          role: 'Doctor',
          operatories: ['OP1', 'OP2'],
          workingHours: { start: '07:00', end: '18:00' },
          lunchBreak: { start: '13:00', end: '14:00' },
          dailyGoal: 5000,
          color: '#ec8a1b',
        },
        {
          name: 'Hygienist Integration',
          role: 'Hygienist',
          operatories: ['HYG1'],
          workingHours: { start: '07:00', end: '18:00' },
          lunchBreak: { start: '13:00', end: '14:00' },
          dailyGoal: 2500,
          color: '#87bcf3',
        },
      ],
      blockTypes: [
        {
          label: 'HP',
          description: 'High Production',
          minimumAmount: 1200,
          role: 'Doctor',
          duration: 60,
          durationMax: 90,
        },
        {
          label: 'PP',
          description: 'Perio Procedure',
          minimumAmount: 500,
          role: 'Hygienist',
          duration: 60,
        },
      ],
      rules: {
        npModel: 'doctor_only',
        npBlocksPerDay: 2,
        srpBlocksPerDay: 2,
        hpPlacement: 'morning',
        doubleBooking: false,
        matrixing: true,
      },
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(newOffice),
    }));

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    const officeId = created.id;
    createdOfficeIds.push(officeId);

    expect(created.name).toBe('Integration Test Office');
    expect(created.providers).toHaveLength(2);
    expect(created.blockTypes).toHaveLength(2);

    // ========== READ (Single) ==========
    const getParams = Promise.resolve({ id: officeId });
    const getResponse = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`),
      { params: getParams }
    );

    expect(getResponse.status).toBe(200);
    const retrieved = await getResponse.json();

    expect(retrieved.id).toBe(officeId);
    expect(retrieved.name).toBe('Integration Test Office');
    expect(retrieved.providers).toHaveLength(2);
    expect(retrieved.providers[0].name).toBe('Dr. Integration');
    expect(retrieved.blockTypes).toHaveLength(2);
    expect(retrieved.rules.npModel).toBe('DOCTOR_ONLY');

    // ========== READ (List) ==========
    const listResponse = await LIST_OFFICES();
    const offices = await listResponse.json();

    // Should include our created office plus seeded offices
    const foundOffice = offices.find((o: any) => o.id === officeId);
    expect(foundOffice).toBeDefined();
    expect(foundOffice.name).toBe('Integration Test Office');

    // ========== UPDATE ==========
    const updates = {
      name: 'Updated Integration Office',
      dpmsSystem: 'OPEN_DENTAL',
      providers: [
        {
          name: 'Dr. Updated',
          role: 'Doctor',
          operatories: ['OP1'],
          workingStart: '08:00',
          workingEnd: '17:00',
          dailyGoal: 6000,
          color: '#ff0000',
        },
      ],
      timeIncrement: 15,
    };

    const updateParams = Promise.resolve({ id: officeId });
    const updateResponse = await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params: updateParams }
    );

    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();

    expect(updated.id).toBe(officeId);
    expect(updated.name).toBe('Updated Integration Office');
    expect(updated.dpmsSystem).toBe('OPEN_DENTAL');
    expect(updated.providers).toHaveLength(1);
    expect(updated.providers[0].name).toBe('Dr. Updated');
    expect(updated.timeIncrement).toBe(15);

    // Verify update persisted
    const getAfterUpdateParams = Promise.resolve({ id: officeId });
    const getAfterUpdate = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`),
      { params: getAfterUpdateParams }
    );

    const persistedUpdate = await getAfterUpdate.json();
    expect(persistedUpdate.name).toBe('Updated Integration Office');

    // ========== DELETE ==========
    const deleteParams = Promise.resolve({ id: officeId });
    const deleteResponse = await DELETE_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`, {
        method: 'DELETE',
      }),
      { params: deleteParams }
    );

    expect(deleteResponse.status).toBe(200);
    const deleteResult = await deleteResponse.json();
    expect(deleteResult.success).toBe(true);

    // Verify deletion
    const getAfterDeleteParams = Promise.resolve({ id: officeId });
    const getAfterDelete = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`),
      { params: getAfterDeleteParams }
    );

    expect(getAfterDelete.status).toBe(404);

    // Verify not in list
    const listAfterDelete = await LIST_OFFICES();
    const officesAfterDelete = await listAfterDelete.json();
    const deletedOffice = officesAfterDelete.find((o: any) => o.id === officeId);
    expect(deletedOffice).toBeUndefined();
  });
});
