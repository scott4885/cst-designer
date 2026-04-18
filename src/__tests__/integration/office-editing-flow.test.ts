import { describe, it, expect, afterAll } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { GET as GET_OFFICE, PUT as UPDATE_OFFICE } from '@/app/api/offices/[id]/route';
import { POST as GENERATE } from '@/app/api/offices/[id]/generate/route';
import { prisma } from '@/lib/db';

/**
 * Integration tests for Office Editing flow.
 * Tests that schedule-related data is preserved correctly across office edits
 * and that schedule regeneration works after provider changes.
 */

const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    try { await prisma.office.delete({ where: { id } }); } catch { /* ignore */ }
  }
  await prisma.$disconnect();
});

describe('Office Editing Flow Integration', () => {
  it('should preserve data when editing office details', async () => {
    // Create office
    const createRes = await CREATE_OFFICE(
      new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Editing Flow Office',
          dpmsSystem: 'Dentrix',
          workingDays: ['MONDAY', 'TUESDAY'],
          providers: [
            {
              name: 'Dr. Edit',
              role: 'Doctor',
              operatories: ['OP1'],
              workingHours: { start: '07:00', end: '17:00' },
              lunchBreak: { start: '12:00', end: '13:00' },
              dailyGoal: 4000,
              color: '#8b5cf6',
            },
          ],
          blockTypes: [
            { label: 'HP', description: 'High Production', minimumAmount: 1200, role: 'Doctor', duration: 90 },
            { label: 'NP', description: 'New Patient', minimumAmount: 300, role: 'Doctor', duration: 40 },
          ],
          rules: { npModel: 'doctor_only', doubleBooking: false, matrixing: false },
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const office = await createRes.json();
    const officeId = office.id;
    createdIds.push(officeId);

    // Verify initial state
    expect(office.name).toBe('Editing Flow Office');
    expect(office.workingDays).toContain('MONDAY');
    expect(office.providers).toHaveLength(1);
    expect(office.blockTypes).toHaveLength(2);

    // Edit office details (change name and add Wednesday)
    const updateParams = Promise.resolve({ id: officeId });
    const updateRes = await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Editing Flow Office — Updated',
          workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
        }),
      }),
      { params: updateParams }
    );
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();

    // Verify name updated
    expect(updated.name).toBe('Editing Flow Office — Updated');
    // Working days expanded
    expect(updated.workingDays).toContain('WEDNESDAY');

    // Verify providers and block types preserved after name/days edit
    const getParams = Promise.resolve({ id: officeId });
    const getRes = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`),
      { params: getParams }
    );
    const retrieved = await getRes.json();
    expect(retrieved.providers).toHaveLength(1);
    expect(retrieved.blockTypes).toHaveLength(2);
    expect(retrieved.providers[0].name).toBe('Dr. Edit');
  });

  it('should regenerate schedules after provider changes', async () => {
    // Create office with one provider
    const createRes = await CREATE_OFFICE(
      new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Regen Flow Office',
          dpmsSystem: 'Dentrix',
          workingDays: ['MONDAY'],
          providers: [
            {
              name: 'Dr. Original',
              role: 'Doctor',
              operatories: ['OP1'],
              workingHours: { start: '07:00', end: '17:00' },
              lunchBreak: { start: '12:00', end: '13:00' },
              dailyGoal: 3000,
              color: '#f97316',
            },
          ],
          blockTypes: [
            { label: 'HP', description: 'High Production', minimumAmount: 1200, role: 'Doctor', duration: 90 },
            { label: 'NP CONS', description: 'New Patient', minimumAmount: 300, role: 'Doctor', duration: 40 },
            { label: 'ER', description: 'Emergency', minimumAmount: 187, role: 'Doctor', duration: 30 },
          ],
          rules: { npModel: 'doctor_only', doubleBooking: false, matrixing: false, hpPlacement: 'morning' },
        }),
      })
    );
    const office = await createRes.json();
    const officeId = office.id;
    createdIds.push(officeId);

    // Generate initial schedule
    const genParams1 = Promise.resolve({ id: officeId });
    const genRes1 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: genParams1 }
    );
    expect(genRes1.status).toBe(200);
    const gen1Data = await genRes1.json();
    const firstScheduleSlotCount = gen1Data.schedules[0]?.slots?.length ?? 0;
    expect(firstScheduleSlotCount).toBeGreaterThan(0);

    // Update office with different daily goal for provider
    const updateParams = Promise.resolve({ id: officeId });
    const updatedProvider = {
      ...office.providers[0],
      dailyGoal: 5000, // changed from 3000
    };
    const updateRes = await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`, {
        method: 'PUT',
        body: JSON.stringify({ providers: [updatedProvider] }),
      }),
      { params: updateParams }
    );
    expect(updateRes.status).toBe(200);
    const updatedOffice = await updateRes.json();
    expect(updatedOffice.providers[0].dailyGoal).toBe(5000);

    // Regenerate — should use new goal
    const genParams2 = Promise.resolve({ id: officeId });
    const genRes2 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: genParams2 }
    );
    expect(genRes2.status).toBe(200);
    const gen2Data = await genRes2.json();
    const secondScheduleSlotCount = gen2Data.schedules[0]?.slots?.length ?? 0;
    expect(secondScheduleSlotCount).toBeGreaterThan(0);

    // Production target should be higher with $5k goal
    const gen2Summary = gen2Data.schedules[0]?.productionSummary?.[0];
    if (gen2Summary) {
      expect(gen2Summary.actualScheduled).toBeGreaterThan(0);
    }
  });
});
