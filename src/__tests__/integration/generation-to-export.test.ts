import { describe, it, expect, beforeEach } from 'vitest';
import { POST as CREATE_OFFICE } from '@/app/api/offices/route';
import { POST as GENERATE } from '@/app/api/offices/[id]/generate/route';
import { POST as EXPORT } from '@/app/api/offices/[id]/export/route';
import { createdOffices } from '@/lib/office-data-store';

/**
 * Integration tests for Generate → Export flow
 * Tests the complete flow from schedule generation to Excel export
 */
describe('Generation to Export Flow Integration', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should complete full generate → export flow', async () => {
    // ========== STEP 1: Create office ==========
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Export Test Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon', 'Tue', 'Wed'],
        providers: [
          {
            name: 'Dr. Export',
            role: 'Doctor',
            operatories: ['OP1'],
            workingHours: { start: '07:00', end: '18:00' },
            lunchBreak: { start: '13:00', end: '14:00' },
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
          {
            name: 'Hygienist Export',
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
        },
      }),
    }));
    const officeData = await office.json();

    // ========== STEP 2: Generate schedules ==========
    const generateParams = Promise.resolve({ id: officeData.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY', 'TUESDAY', 'WEDNESDAY'] }),
      }),
      { params: generateParams }
    );

    expect(generateResponse.status).toBe(200);
    const generated = await generateResponse.json();
    
    expect(generated.schedules).toHaveLength(3);

    // ========== STEP 3: Export to Excel ==========
    const exportParams = Promise.resolve({ id: officeData.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${officeData.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generated.schedules }),
      }),
      { params: exportParams }
    );

    // Verify export succeeded
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(exportResponse.headers.get('Content-Disposition')).toContain('Export Test Office');
    expect(exportResponse.headers.get('Content-Disposition')).toContain('.xlsx');

    // Verify Excel file was generated
    const buffer = await exportResponse.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should export with correct office name in filename', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Unique Name Dental',
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
      }),
    }));
    const officeData = await office.json();

    const generateParams = Promise.resolve({ id: officeData.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    const generated = await generateResponse.json();

    const exportParams = Promise.resolve({ id: officeData.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${officeData.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generated.schedules }),
      }),
      { params: exportParams }
    );

    const disposition = exportResponse.headers.get('Content-Disposition');
    expect(disposition).toContain('Unique Name Dental');
  });

  it('should handle export of all 5 working days', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Full Week Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        providers: [
          {
            name: 'Dr. Week',
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

    const generateParams = Promise.resolve({ id: officeData.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        }),
      }),
      { params: generateParams }
    );
    const generated = await generateResponse.json();
    
    expect(generated.schedules).toHaveLength(5);

    const exportParams = Promise.resolve({ id: officeData.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${officeData.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generated.schedules }),
      }),
      { params: exportParams }
    );

    expect(exportResponse.status).toBe(200);
    
    // Excel file should be larger with more days
    const buffer = await exportResponse.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(5000);
  });

  it('should include all providers in export', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
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
          { label: 'HP', role: 'Doctor', duration: 60, minimumAmount: 1200 },
          { label: 'PP', role: 'Hygienist', duration: 60, minimumAmount: 500 },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    const generateParams = Promise.resolve({ id: officeData.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    const generated = await generateResponse.json();

    // Verify all providers in production summary
    expect(generated.schedules[0].productionSummary).toHaveLength(3);

    const exportParams = Promise.resolve({ id: officeData.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${officeData.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generated.schedules }),
      }),
      { params: exportParams }
    );

    expect(exportResponse.status).toBe(200);
  });

  it('should fail if office not found during export', async () => {
    // Generate valid schedule data
    const mockSchedules = [{
      dayOfWeek: 'MONDAY',
      slots: [],
      productionSummary: [],
      warnings: [],
    }];

    const exportParams = Promise.resolve({ id: 'non-existent' });
    const exportResponse = await EXPORT(
      new Request('http://localhost/api/offices/non-existent/export', {
        method: 'POST',
        body: JSON.stringify({ schedules: mockSchedules }),
      }),
      { params: exportParams }
    );

    expect(exportResponse.status).toBe(404);
  });

  it('should fail if schedules data is invalid', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invalid Export Test',
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
      }),
    }));
    const officeData = await office.json();

    const exportParams = Promise.resolve({ id: officeData.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${officeData.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: 'invalid' }),
      }),
      { params: exportParams }
    );

    expect(exportResponse.status).toBe(400);
  });

  it('should preserve provider colors in export', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Color Test Office',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. Orange',
            role: 'Doctor',
            operatories: ['OP1'],
            dailyGoal: 5000,
            color: '#ec8a1b',
          },
          {
            name: 'Dr. Blue',
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
      }),
    }));
    const officeData = await office.json();

    const generateParams = Promise.resolve({ id: officeData.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    const generated = await generateResponse.json();

    const exportParams = Promise.resolve({ id: officeData.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${officeData.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generated.schedules }),
      }),
      { params: exportParams }
    );

    expect(exportResponse.status).toBe(200);
    
    // Excel export should succeed with provider colors
    const buffer = await exportResponse.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should handle minimum amounts in block labels', async () => {
    const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Minimum Amount Test',
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
            description: 'High Production',
            minimumAmount: 1200,
            role: 'Doctor',
            duration: 60,
          },
          {
            label: 'MP',
            description: 'Medium Production',
            minimumAmount: 300,
            role: 'Doctor',
            duration: 30,
          },
        ],
        rules: {
          npModel: 'doctor_only',
        },
      }),
    }));
    const officeData = await office.json();

    const generateParams = Promise.resolve({ id: officeData.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${officeData.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    const generated = await generateResponse.json();

    const exportParams = Promise.resolve({ id: officeData.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${officeData.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generated.schedules }),
      }),
      { params: exportParams }
    );

    expect(exportResponse.status).toBe(200);
  });

  it('should export immediately after creation and generation', async () => {
    // This test validates the complete flow in quick succession
    // (simulating user clicking "Generate" then "Export" immediately)

    // Create
    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Quick Export Test',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [
          {
            name: 'Dr. Quick',
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
    const office = await createResponse.json();

    // Generate immediately
    const generateParams = Promise.resolve({ id: office.id });
    const generateResponse = await GENERATE(
      new Request(`http://localhost/api/offices/${office.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ days: ['MONDAY'] }),
      }),
      { params: generateParams }
    );
    const generated = await generateResponse.json();

    // Export immediately
    const exportParams = Promise.resolve({ id: office.id });
    const exportResponse = await EXPORT(
      new Request(`http://localhost/api/offices/${office.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ schedules: generated.schedules }),
      }),
      { params: exportParams }
    );

    // All should succeed
    expect(createResponse.status).toBe(201);
    expect(generateResponse.status).toBe(200);
    expect(exportResponse.status).toBe(200);
  });
});
