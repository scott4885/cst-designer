import { describe, it, expect, beforeEach } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { GET as GET_OFFICE } from '@/app/api/offices/[id]/route';
import { POST as GENERATE } from '@/app/api/offices/[id]/generate/route';
import { createdOffices } from '@/lib/office-data-store';

/**
 * Integration tests for Intake Form → Generate Schedule flow
 * This is the CRITICAL flow that had the original bug:
 * User fills out intake form → submits → generates schedule
 * The bug was that newly created offices weren't visible to generate endpoint
 */
describe('Intake to Generation Flow Integration', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should complete full intake form → generate flow (THE BUG TEST)', async () => {
    // ========== STEP 1: User fills out intake form (all 4 tabs) ==========
    
    // Tab 1: Practice Foundation
    const tab1Data = {
      name: 'New Dental Practice',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    };

    // Tab 2: Providers
    const tab2Data = {
      providers: [
        {
          name: 'Dr. Sarah Johnson',
          role: 'Doctor',
          operatories: ['OP1', 'OP2'],
          workingHours: { start: '07:00', end: '18:00' },
          lunchBreak: { start: '13:00', end: '14:00' },
          dailyGoal: 5000,
          color: '#ec8a1b',
        },
        {
          name: 'Emily Smith RDH',
          role: 'Hygienist',
          operatories: ['HYG1'],
          workingHours: { start: '07:00', end: '18:00' },
          lunchBreak: { start: '13:00', end: '14:00' },
          dailyGoal: 2500,
          color: '#87bcf3',
        },
      ],
    };

    // Tab 3: Clinical Timing (procedures/block types)
    const tab3Data = {
      blockTypes: [
        {
          label: 'HP',
          description: 'High Production - crowns, implants',
          minimumAmount: 1200,
          role: 'Doctor',
          duration: 60,
          durationMax: 90,
        },
        {
          label: 'MP',
          description: 'Medium Production - fillings',
          minimumAmount: 300,
          role: 'Doctor',
          duration: 30,
          durationMax: 60,
        },
        {
          label: 'PP',
          description: 'Perio Procedure',
          minimumAmount: 500,
          role: 'Hygienist',
          duration: 60,
        },
      ],
    };

    // Tab 4: Schedule Rules
    const tab4Data = {
      rules: {
        npModel: 'doctor_only',
        npBlocksPerDay: 2,
        srpBlocksPerDay: 2,
        hpPlacement: 'morning',
        doubleBooking: false,
        matrixing: true,
      },
    };

    // Combine all tabs into submission data
    const intakeFormData = {
      ...tab1Data,
      ...tab2Data,
      ...tab3Data,
      ...tab4Data,
    };

    // ========== STEP 2: Submit intake form (POST /api/offices) ==========
    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(intakeFormData),
    }));

    expect(createResponse.status).toBe(201);
    const createdOffice = await createResponse.json();
    const officeId = createdOffice.id;

    // Verify office was created with all data
    expect(createdOffice.name).toBe('New Dental Practice');
    expect(createdOffice.providers).toHaveLength(2);
    expect(createdOffice.providers[0].name).toBe('Dr. Sarah Johnson');
    expect(createdOffice.providers[1].name).toBe('Emily Smith RDH');
    expect(createdOffice.blockTypes).toHaveLength(3);
    expect(createdOffice.rules).toBeDefined();

    // ========== STEP 3: User redirected to /offices/[id] page ==========
    const getParams = Promise.resolve({ id: officeId });
    const getResponse = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${officeId}`),
      { params: getParams }
    );

    expect(getResponse.status).toBe(200);
    const office = await getResponse.json();

    // Verify all data is accessible
    expect(office.providers).toHaveLength(2);
    expect(office.blockTypes).toHaveLength(3);
    expect(office.rules).toBeDefined();

    // ========== STEP 4: User clicks "Generate Monday" button ==========
    // THIS IS WHERE THE BUG OCCURRED - Generate endpoint couldn't find the office
    const generateParams = Promise.resolve({ id: officeId });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${officeId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );

    // THE BUG: This used to return 404 or "no providers" error
    expect(generateResponse.status).toBe(200);
    const generated = await generateResponse.json();

    // Verify schedule was generated successfully
    expect(generated.officeId).toBe(officeId);
    expect(generated.schedules).toHaveLength(1);
    expect(generated.schedules[0].dayOfWeek).toBe('MONDAY');
    
    // Verify providers were found and scheduled
    const schedule = generated.schedules[0];
    expect(schedule.slots).toBeDefined();
    expect(schedule.slots.length).toBeGreaterThan(0);
    
    // Verify production summary includes both providers
    expect(schedule.productionSummary).toHaveLength(2);
    const drSarah = schedule.productionSummary.find((p: any) => p.providerName === 'Dr. Sarah Johnson');
    const emily = schedule.productionSummary.find((p: any) => p.providerName === 'Emily Smith RDH');
    expect(drSarah).toBeDefined();
    expect(emily).toBeDefined();
    expect(drSarah.dailyGoal).toBe(5000);
    expect(emily.dailyGoal).toBe(2500);
  });

  it('should generate all working days successfully', async () => {
    // Create office
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'All Days Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
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

    // Generate all days
    const params = Promise.resolve({ id: officeData.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }),
      }),
      { params }
    );

    const generated = await response.json();
    
    expect(response.status).toBe(200);
    expect(generated.schedules).toHaveLength(5);
    expect(generated.schedules[0].dayOfWeek).toBe('MONDAY');
    expect(generated.schedules[1].dayOfWeek).toBe('TUESDAY');
    expect(generated.schedules[2].dayOfWeek).toBe('WEDNESDAY');
    expect(generated.schedules[3].dayOfWeek).toBe('THURSDAY');
    expect(generated.schedules[4].dayOfWeek).toBe('FRIDAY');

    // Each day should have schedules
    generated.schedules.forEach((schedule: any) => {
      expect(schedule.slots.length).toBeGreaterThan(0);
      expect(schedule.productionSummary.length).toBeGreaterThan(0);
    });
  });

  it('should handle multiple providers with different roles', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Multi-Provider Practice',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. Alpha',
            role: 'Doctor',
            operatories: ['OP1'],
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
          {
            name: 'Dr. Beta',
            role: 'Doctor',
            operatories: ['OP2'],
            dailyGoal: 5000,
            color: '#ff0000',
          },
          {
            name: 'Hygienist Gamma',
            role: 'Hygienist',
            operatories: ['HYG1'],
            dailyGoal: 2500,
            color: '#87bcf3',
          },
          {
            name: 'Hygienist Delta',
            role: 'Hygienist',
            operatories: ['HYG2'],
            dailyGoal: 2500,
            color: '#44f2ce',
          },
        ],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60, minimumAmount: 1200 },
          { label: 'PP', role: 'Hygienist', duration: 60, minimumAmount: 500 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    const params = Promise.resolve({ id: officeData.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const generated = await response.json();
    
    expect(response.status).toBe(200);
    
    // Should have production summary for all 4 providers
    const summary = generated.schedules[0].productionSummary;
    expect(summary).toHaveLength(4);
    
    const drAlpha = summary.find((p: any) => p.providerName === 'Dr. Alpha');
    const drBeta = summary.find((p: any) => p.providerName === 'Dr. Beta');
    const hygGamma = summary.find((p: any) => p.providerName === 'Hygienist Gamma');
    const hygDelta = summary.find((p: any) => p.providerName === 'Hygienist Delta');
    
    expect(drAlpha).toBeDefined();
    expect(drBeta).toBeDefined();
    expect(hygGamma).toBeDefined();
    expect(hygDelta).toBeDefined();
  });

  it('should apply schedule rules during generation', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Rules Test Practice',
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
          { label: 'HP', role: 'Doctor', duration: 60, minimumAmount: 1200 },
          { label: 'MP', role: 'Doctor', duration: 30, minimumAmount: 300 },
        ],
        rules: {
          npModel: 'doctor_only',
          npBlocksPerDay: 3,
          hpPlacement: 'afternoon',
          doubleBooking: true,
          matrixing: false,
        },
      }),
    }));
    const officeData = await office.json();

    const params = Promise.resolve({ id: officeData.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const generated = await response.json();
    
    expect(response.status).toBe(200);
    expect(generated.schedules[0].slots).toBeDefined();
    
    // Schedule should be generated with rules applied
    // (Detailed rule verification would be in generator.test.ts)
  });

  it('should handle edge case: empty providers', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'No Providers Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
        ],
      }),
    }));
    const officeData = await office.json();

    const params = Promise.resolve({ id: officeData.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.error).toContain('provider');
  });

  it('should handle edge case: empty block types', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'No BlockTypes Office',
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
        blockTypes: [],
      }),
    }));
    const officeData = await office.json();

    const params = Promise.resolve({ id: officeData.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.error).toContain('block type');
  });

  it('should persist provider data through the flow', async () => {
    // This test specifically validates the fix for the original bug:
    // Provider data must persist from CREATE → GET → GENERATE
    
    const providerData = {
      name: 'Dr. Persistence Test',
      role: 'Doctor',
      operatories: ['OP1', 'OP2'],
      workingHours: { start: '07:00', end: '18:00' },
      lunchBreak: { start: '13:00', end: '14:00' },
      dailyGoal: 5500,
      color: '#ff00ff',
    };

    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Persistence Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [providerData],
        blockTypes: [
          { label: 'HP', role: 'Doctor', duration: 60 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const created = await office.json();

    // Verify provider in CREATE response
    expect(created.providers[0].name).toBe('Dr. Persistence Test');
    expect(created.providers[0].dailyGoal).toBe(5500);

    // Verify provider in GET response
    const getParams = Promise.resolve({ id: created.id });
    const getResponse = await GET_OFFICE(
      new Request(`http://localhost/api/offices/${created.id}`),
      { params: getParams }
    );
    const retrieved = await getResponse.json();
    expect(retrieved.providers[0].name).toBe('Dr. Persistence Test');
    expect(retrieved.providers[0].dailyGoal).toBe(5500);

    // Verify provider in GENERATE response
    const generateParams = Promise.resolve({ id: created.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    const generated = await generateResponse.json();
    
    const providerSummary = generated.schedules[0].productionSummary[0];
    expect(providerSummary.providerName).toBe('Dr. Persistence Test');
    expect(providerSummary.dailyGoal).toBe(5500);
  });
});
