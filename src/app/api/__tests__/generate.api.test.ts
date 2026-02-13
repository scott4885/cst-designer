import { describe, it, expect, beforeEach } from 'vitest';
import { POST as GENERATE } from '../offices/[id]/generate/route';
import { POST as CREATE_OFFICE } from '../offices/route';
import { createdOffices } from '@/lib/office-data-store';

describe('POST /api/offices/[id]/generate', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should generate schedule for Smile Cascade (id=1)', async () => {
    const params = Promise.resolve({ id: '1' });
    const response = await GENERATE(
      new Request('http://localhost/api/offices/1/generate', {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.officeId).toBe('1');
    expect(data.officeName).toBe('Smile Cascade');
    expect(data.schedules).toHaveLength(1);
    expect(data.schedules[0].dayOfWeek).toBe('MONDAY');
  });

  it('should generate schedule for newly created office', async () => {
    // Create office with full data
    const officeData = {
      name: 'Test Dental Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon', 'Tue', 'Wed'],
      providers: [
        {
          name: 'Dr. Test',
          role: 'Doctor',
          operatories: ['OP1'],
          workingHours: { start: '07:00', end: '18:00' },
          lunchBreak: { start: '13:00', end: '14:00' },
          dailyGoal: 5000,
          color: '#ec8a1b',
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
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    // Generate schedule
    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.officeId).toBe(created.id);
    expect(data.officeName).toBe('Test Dental Office');
    expect(data.schedules).toHaveLength(1);
  });

  it('should find providers for newly created office', async () => {
    // This is the CRITICAL TEST for the original bug
    const officeData = {
      name: 'Provider Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        {
          name: 'Dr. Provider Test',
          role: 'Doctor',
          operatories: ['OP1'],
          workingHours: { start: '07:00', end: '18:00' },
          lunchBreak: { start: '13:00', end: '14:00' },
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
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    
    // Verify schedule was generated (means providers were found)
    expect(data.schedules[0].slots).toBeDefined();
    expect(data.schedules[0].slots.length).toBeGreaterThan(0);
    
    // Verify production summary includes the provider
    expect(data.schedules[0].productionSummary).toBeDefined();
    expect(data.schedules[0].productionSummary.length).toBeGreaterThan(0);
  });

  it('should generate multiple days when requested', async () => {
    const officeData = {
      name: 'Multi-Day Office',
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
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY', 'TUESDAY', 'WEDNESDAY'] }),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.schedules).toHaveLength(3);
    expect(data.schedules[0].dayOfWeek).toBe('MONDAY');
    expect(data.schedules[1].dayOfWeek).toBe('TUESDAY');
    expect(data.schedules[2].dayOfWeek).toBe('WEDNESDAY');
  });

  it('should use office working days when days not specified', async () => {
    const officeData = {
      name: 'Default Days Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon', 'Tue'],
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
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.schedules).toHaveLength(2);
  });

  it('should return 404 for non-existent office', async () => {
    const params = Promise.resolve({ id: 'non-existent' });
    const response = await GENERATE(
      new Request('http://localhost/api/offices/non-existent/generate', {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Office not found');
  });

  it('should return 400 if office missing providers', async () => {
    const officeData = {
      name: 'No Providers Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('provider');
  });

  it('should return 400 if office missing blockTypes', async () => {
    const officeData = {
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
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('block type');
  });

  it('should include generatedAt timestamp', async () => {
    const officeData = {
      name: 'Timestamp Test Office',
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
      },
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const data = await response.json();
    expect(data.generatedAt).toBeDefined();
    expect(new Date(data.generatedAt).getTime()).toBeGreaterThan(0);
  });

  it('should work with multiple providers', async () => {
    const officeData = {
      name: 'Multi-Provider Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        {
          name: 'Dr. One',
          role: 'Doctor',
          operatories: ['OP1'],
          dailyGoal: 5000,
          color: '#ec8a1b',
        },
        {
          name: 'Dr. Two',
          role: 'Doctor',
          operatories: ['OP2'],
          dailyGoal: 5000,
          color: '#ff0000',
        },
        {
          name: 'Hygienist One',
          role: 'Hygienist',
          operatories: ['HYG1'],
          dailyGoal: 2500,
          color: '#87bcf3',
        },
      ],
      blockTypes: [
        { label: 'HP', role: 'Doctor', duration: 60 },
        { label: 'PP', role: 'Hygienist', duration: 60 },
      ],
      rules: {
        npModel: 'doctor_only',
      },
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    
    // Should have production summary for all providers
    expect(data.schedules[0].productionSummary.length).toBe(3);
  });

  it('should respect schedule rules during generation', async () => {
    const officeData = {
      name: 'Rules Test Office',
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
        hpPlacement: 'morning',
        doubleBooking: false,
        matrixing: true,
      },
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    
    // Schedule should be generated with rules applied
    expect(data.schedules[0].slots).toBeDefined();
    expect(data.schedules[0].slots.length).toBeGreaterThan(0);
  });
});
