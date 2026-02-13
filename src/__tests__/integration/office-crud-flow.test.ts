import { describe, it, expect, beforeEach } from 'vitest';
import { GET as LIST_OFFICES, POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { GET as GET_OFFICE, PUT as UPDATE_OFFICE, DELETE as DELETE_OFFICE } from '@/app/api/offices/[id]/route';
import { createdOffices } from '@/lib/office-data-store';

/**
 * Integration tests for complete Office CRUD flow
 * Tests the full lifecycle: Create → Read → Update → Delete
 */
describe('Office CRUD Flow Integration', () => {
  beforeEach(() => {
    createdOffices.length = 0;
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

    expect(created.name).toBe('Integration Test Office');
    expect(created.providers).toHaveLength(2);
    expect(created.blockTypes).toHaveLength(2);
    expect(created.providerCount).toBe(2);
    expect(created.totalDailyGoal).toBe(7500);

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

    // Should include our created office plus mock offices
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
          workingHours: { start: '08:00', end: '17:00' },
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
    expect(updated.providerCount).toBe(1);
    expect(updated.totalDailyGoal).toBe(6000);

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

  it('should handle multiple offices independently', async () => {
    // Create office 1
    const office1 = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Office One',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [{ name: 'Dr. One', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' }],
      }),
    }));
    const office1Data = await office1.json();

    // Create office 2
    const office2 = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Office Two',
        dpmsSystem: 'Open Dental',
        workingDays: ['Tue'],
        providers: [{ name: 'Dr. Two', role: 'Doctor', dailyGoal: 6000, color: '#ff0000' }],
      }),
    }));
    const office2Data = await office2.json();

    // Both should exist
    const list = await LIST_OFFICES();
    const offices = await list.json();
    
    expect(offices.find((o: any) => o.id === office1Data.id)).toBeDefined();
    expect(offices.find((o: any) => o.id === office2Data.id)).toBeDefined();

    // Update office 1
    const update1Params = Promise.resolve({ id: office1Data.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${office1Data.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Office One' }),
      }),
      { params: update1Params }
    );

    // Verify only office 1 changed
    const get1Params = Promise.resolve({ id: office1Data.id });
    const get1 = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${office1Data.id}`),
      { params: get1Params }
    );
    const updated1 = await get1.json();
    expect(updated1.name).toBe('Updated Office One');

    const get2Params = Promise.resolve({ id: office2Data.id });
    const get2 = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${office2Data.id}`),
      { params: get2Params }
    );
    const unchanged2 = await get2.json();
    expect(unchanged2.name).toBe('Office Two');

    // Delete office 1
    const delete1Params = Promise.resolve({ id: office1Data.id });
    await DELETE_OFFICE(
      new Request(`http://localhost/api/offices/${office1Data.id}`, {
        method: 'DELETE',
      }),
      { params: delete1Params }
    );

    // Verify office 1 gone, office 2 still there
    const get1AfterParams = Promise.resolve({ id: office1Data.id });
    const get1After = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${office1Data.id}`),
      { params: get1AfterParams }
    );
    expect(get1After.status).toBe(404);

    const get2AfterParams = Promise.resolve({ id: office2Data.id });
    const get2After = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${office2Data.id}`),
      { params: get2AfterParams }
    );
    expect(get2After.status).toBe(200);
  });

  it('should maintain data integrity through updates', async () => {
    // Create office with complex data
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Integrity Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon', 'Tue', 'Wed'],
        providers: [
          { name: 'Dr. One', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
          { name: 'Dr. Two', role: 'Doctor', dailyGoal: 4000, color: '#ff0000' },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
          { label: 'MP', role: 'Doctor', duration: 30 },
        ],
        rules: {
          npModel: 'doctor_only',
          hpPlacement: 'morning',
        },
      }),
    }));
    const officeData = await office.json();

    // Update only name
    const updateParams = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name Only' }),
      }),
      { params: updateParams }
    );

    // Verify all other data unchanged
    const getParams = Promise.resolve({ id: officeData.id });
    const get = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`),
      { params: getParams }
    );
    const updated = await get.json();

    expect(updated.name).toBe('Updated Name Only');
    expect(updated.providers).toHaveLength(2);
    expect(updated.blockTypes).toHaveLength(2);
    expect(updated.rules.npModel).toBe('DOCTOR_ONLY');
    expect(updated.workingDays).toEqual(['MONDAY', 'TUESDAY', 'WEDNESDAY']);
  });
});
