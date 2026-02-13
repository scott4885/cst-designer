import { describe, it, expect, beforeEach } from 'vitest';
import { POST as EXPORT } from '../offices/[id]/export/route';
import { POST as CREATE_OFFICE } from '../offices/route';
import { POST as GENERATE } from '../offices/[id]/generate/route';
import { createdOffices } from '@/lib/office-data-store';

describe('POST /api/offices/[id]/export', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should export schedule for Smile Cascade (id=1)', async () => {
    // First generate a schedule
    const generateParams = Promise.resolve({ id: '1' });
    const generateResponse = await GENERATE(
      new Request('http://localhost/api/offices/1/generate', {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );

    const generatedData = await generateResponse.json();

    // Now export it
    const params = Promise.resolve({ id: '1' });
    const response = await EXPORT(
      new Request('http://localhost/api/offices/1/export', {
        method: 'POST',
        body: JSON.stringify({ schedules: generatedData.schedules }),
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(response.headers.get('Content-Disposition')).toContain('Smile Cascade');
  });

  it('should export schedule for newly created office', async () => {
    // Create office
    const officeData = {
      name: 'Export Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        {
          name: 'Dr. Export Test',
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
        },
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

    // Generate schedule
    const generateParams = Promise.resolve({ id: created.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );

    const generatedData = await generateResponse.json();

    // Export schedule
    const params = Promise.resolve({ id: created.id });
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generatedData.schedules }),
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('Export Test Office');
  });

  it('should return correct filename in Content-Disposition header', async () => {
    const officeData = {
      name: 'Filename Test Office',
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

    const generateParams = Promise.resolve({ id: created.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );

    const generatedData = await generateResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generatedData.schedules }),
      }),
      { params }
    );

    const disposition = response.headers.get('Content-Disposition');
    expect(disposition).toContain('Customized Schedule Template');
    expect(disposition).toContain('Filename Test Office');
    expect(disposition).toContain('.xlsx');
  });

  it('should return 404 for non-existent office', async () => {
    const params = Promise.resolve({ id: 'non-existent' });
    const response = await EXPORT(
      new Request('http://localhost/api/offices/non-existent/export', {
        method: 'POST',
        body: JSON.stringify({ schedules: [] }),
      }),
      { params }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Office not found');
  });

  it('should return 400 if schedules data is missing', async () => {
    const officeData = {
      name: 'Test Office',
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
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Missing schedules data');
  });

  it('should return 400 if schedules is not an array', async () => {
    const officeData = {
      name: 'Test Office',
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
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: 'not-an-array' }),
      }),
      { params }
    );

    expect(response.status).toBe(400);
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
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: [] }),
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
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: [] }),
      }),
      { params }
    );

    expect(response.status).toBe(400);
  });

  it('should export multiple days', async () => {
    const officeData = {
      name: 'Multi-Day Export Office',
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

    const generateParams = Promise.resolve({ id: created.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY', 'TUESDAY', 'WEDNESDAY'] }),
      }),
      { params: generateParams }
    );

    const generatedData = await generateResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generatedData.schedules }),
      }),
      { params }
    );

    expect(response.status).toBe(200);
    
    // Verify it's a valid Excel file by checking the buffer
    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should include Content-Length header', async () => {
    const officeData = {
      name: 'Content Length Test',
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

    const generateParams = Promise.resolve({ id: created.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );

    const generatedData = await generateResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generatedData.schedules }),
      }),
      { params }
    );

    expect(response.headers.get('Content-Length')).toBeDefined();
    const contentLength = parseInt(response.headers.get('Content-Length')!, 10);
    expect(contentLength).toBeGreaterThan(0);
  });

  it('should work with multiple providers in export', async () => {
    const officeData = {
      name: 'Multi-Provider Export',
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

    const generateParams = Promise.resolve({ id: created.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${created.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );

    const generatedData = await generateResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await EXPORT(
      new Request(`http://localhost/api/offices/${created.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generatedData.schedules }),
      }),
      { params }
    );

    expect(response.status).toBe(200);
  });
});
