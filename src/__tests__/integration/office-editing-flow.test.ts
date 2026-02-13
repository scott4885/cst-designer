import { describe, it, expect, beforeEach } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { PUT as UPDATE_OFFICE } from '@/app/api/offices/[id]/route';
import { POST as GENERATE } from '@/app/api/offices/[id]/generate/route';
import { createdOffices } from '@/lib/office-data-store';

/**
 * Integration tests for Office Editing → Regeneration flow
 * Tests that editing an office correctly affects schedule generation
 */
describe('Office Editing Flow Integration', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should regenerate with updated provider data', async () => {
    // Create office
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Edit Test Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. Original',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    // Generate schedule with original provider
    const generateParams1 = Promise.resolve({ id: officeData.id });
    const generate1 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams1 }
    );
    const generated1 = await generate1.json();
    
    expect(generated1.schedules[0].productionSummary[0].providerName).toBe('Dr. Original');
    expect(generated1.schedules[0].productionSummary[0].dailyGoal).toBe(5000);

    // Update provider
    const updateParams = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          providers: [
            {
              id: 'updated-provider-1',
              name: 'Dr. Updated',
              role: 'DOCTOR',
              operatories: ['OP1'],
              workingStart: '07:00',
              workingEnd: '18:00',
              lunchStart: '13:00',
              lunchEnd: '14:00',
              dailyGoal: 6000,
              color: '#ff0000',
            },
          ],
        }),
      }),
      { params: updateParams }
    );

    // Regenerate schedule
    const generateParams2 = Promise.resolve({ id: officeData.id });
    const generate2 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams2 }
    );
    const generated2 = await generate2.json();

    // Should use updated provider data
    expect(generated2.schedules[0].productionSummary[0].providerName).toBe('Dr. Updated');
    expect(generated2.schedules[0].productionSummary[0].dailyGoal).toBe(6000);
  });

  it('should regenerate with added providers', async () => {
    // Create office with 1 provider
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Add Provider Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. One',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
          { label: 'PP', role: 'Hygienist', duration: 60 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    // Generate with 1 provider
    const generateParams1 = Promise.resolve({ id: officeData.id });
    const generate1 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams1 }
    );
    const generated1 = await generate1.json();
    
    expect(generated1.schedules[0].productionSummary).toHaveLength(1);

    // Add second provider
    const updateParams = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          providers: [
            {
              id: 'provider-one',
              name: 'Dr. One',
              role: 'DOCTOR',
              operatories: ['OP1'],
              workingStart: '07:00',
              workingEnd: '18:00',
              lunchStart: '13:00',
              lunchEnd: '14:00',
              dailyGoal: 5000,
              color: '#ec8a1b',
            },
            {
              id: 'provider-two',
              name: 'Hygienist Two',
              role: 'HYGIENIST',
              operatories: ['HYG1'],
              workingStart: '07:00',
              workingEnd: '18:00',
              lunchStart: '13:00',
              lunchEnd: '14:00',
              dailyGoal: 2500,
              color: '#87bcf3',
            },
          ],
        }),
      }),
      { params: updateParams }
    );

    // Regenerate with 2 providers
    const generateParams2 = Promise.resolve({ id: officeData.id });
    const generate2 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams2 }
    );
    const generated2 = await generate2.json();

    // Should now have 2 providers
    expect(generated2.schedules[0].productionSummary).toHaveLength(2);
    const hygienist = generated2.schedules[0].productionSummary.find(
      (p: any) => p.providerName === 'Hygienist Two'
    );
    expect(hygienist).toBeDefined();
    expect(hygienist.dailyGoal).toBe(2500);
  });

  it('should regenerate with removed providers', async () => {
    // Create office with 2 providers
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Remove Provider Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. One',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
          {
            name: 'Dr. Two',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ff0000',
          },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    // Generate with 2 providers
    const generateParams1 = Promise.resolve({ id: officeData.id });
    const generate1 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams1 }
    );
    const generated1 = await generate1.json();
    
    expect(generated1.schedules[0].productionSummary).toHaveLength(2);

    // Remove one provider
    const updateParams = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          providers: [
            {
              id: 'provider-one',
              name: 'Dr. One',
              role: 'DOCTOR',
              operatories: ['OP1'],
              workingStart: '07:00',
              workingEnd: '18:00',
              lunchStart: '13:00',
              lunchEnd: '14:00',
              dailyGoal: 5000,
              color: '#ec8a1b',
            },
          ],
        }),
      }),
      { params: updateParams }
    );

    // Regenerate with 1 provider
    const generateParams2 = Promise.resolve({ id: officeData.id });
    const generate2 = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams2 }
    );
    const generated2 = await generate2.json();

    // Should only have 1 provider
    expect(generated2.schedules[0].productionSummary).toHaveLength(1);
    expect(generated2.schedules[0].productionSummary[0].providerName).toBe('Dr. One');
  });

  it('should regenerate with updated block types', async () => {
    // Create office
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'BlockType Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. Test',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
        ],
        blockTypes: [
          {
            label: 'HP',
            minimumAmount: 1200,
            role: 'Doctor',
            duration: 60,
          },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    // Add more block types
    const updateParams = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          blockTypes: [
            {
              label: 'HP',
              minimumAmount: 1200,
              role: 'Doctor',
              duration: 60,
            },
            {
              label: 'MP',
              minimumAmount: 300,
              role: 'Doctor',
              duration: 30,
            },
            {
              label: 'NP CONS',
              minimumAmount: 150,
              role: 'Doctor',
              duration: 30,
            },
          ],
        }),
      }),
      { params: updateParams }
    );

    // Regenerate
    const generateParams = Promise.resolve({ id: officeData.id });
    const generate = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    
    expect(generate.status).toBe(200);
    // Schedule should generate with updated block types
  });

  it('should regenerate with updated rules', async () => {
    // Create office
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Rules Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. Test',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
        ],
        rules: {
          npModel: 'doctor_only',
          hpPlacement: 'morning',
          doubleBooking: false,
          matrixing: true,
        },
      }),
    }));
    const officeData = await office.json();

    // Update rules
    const updateParams = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          rules: {
            npModel: 'hygienist_only',
            hpPlacement: 'afternoon',
            doubleBooking: true,
            matrixing: false,
          },
        }),
      }),
      { params: updateParams }
    );

    // Regenerate with updated rules
    const generateParams = Promise.resolve({ id: officeData.id });
    const generate = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    
    expect(generate.status).toBe(200);
    // Schedule should generate with updated rules applied
  });

  it('should update working days and generate accordingly', async () => {
    // Create office with Mon-Wed
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Working Days Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon', 'Tue', 'Wed'],
        providers: [
          {
            name: 'Dr. Test',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    // Update to Mon-Fri
    const updateParams = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        }),
      }),
      { params: updateParams }
    );

    // Generate all days
    const generateParams = Promise.resolve({ id: officeData.id });
    const generate = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({}), // Uses office working days
      }),
      { params: generateParams }
    );
    
    const generated = await generate.json();
    
    // Should generate 5 days
    expect(generated.schedules).toHaveLength(5);
  });

  it('should handle multiple edits in succession', async () => {
    // Create office
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Original Name',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. Original',
            role: 'Doctor',
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    // Edit 1: Change name
    const update1Params = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'First Edit' }),
      }),
      { params: update1Params }
    );

    // Edit 2: Change provider
    const update2Params = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          providers: [
            {
              id: 'provider-edit-2',
              name: 'Dr. Second Edit',
              role: 'DOCTOR',
              operatories: ['OP1'],
              workingStart: '07:00',
              workingEnd: '18:00',
              lunchStart: '13:00',
              lunchEnd: '14:00',
              dailyGoal: 6000,
              color: '#ff0000',
            },
          ],
        }),
      }),
      { params: update2Params }
    );

    // Edit 3: Change time increment
    const update3Params = Promise.resolve({ id: officeData.id });
    await UPDATE_OFFICE(
      new Request(`http://localhost/api/offices/${officeData.id}`, {
        method: 'PUT',
        body: JSON.stringify({ timeIncrement: 15 }),
      }),
      { params: update3Params }
    );

    // Generate after all edits
    const generateParams = Promise.resolve({ id: officeData.id });
    const generate = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    
    const generated = await generate.json();
    
    expect(generate.status).toBe(200);
    expect(generated.officeName).toBe('First Edit');
    expect(generated.schedules[0].productionSummary[0].providerName).toBe('Dr. Second Edit');
  });
});
