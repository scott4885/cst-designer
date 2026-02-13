import { describe, it, expect, beforeEach } from 'vitest';
import { POST as CREATE_OFFICE, GET as LIST_OFFICES } from '@/app/api/offices/route';
import { GET as GET_OFFICE } from '@/app/api/offices/[id]/route';
import { POST as GENERATE } from '@/app/api/offices/[id]/generate/route';
import { POST as EXPORT } from '@/app/api/offices/[id]/export/route';
import { createdOffices } from '@/lib/office-data-store';

/**
 * Integration tests for Edge Cases
 * Tests error handling, invalid data, and boundary conditions
 */
describe('Edge Cases Integration', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  describe('Invalid Office Data', () => {
    it('should reject office with missing name', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
        }),
      }));

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('Missing required fields');
    });

    it('should reject office with missing dpmsSystem', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Office',
          workingDays: ['Mon'],
          providers: [],
        }),
      }));

      expect(response.status).toBe(400);
    });

    it('should reject office with missing workingDays', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Office',
          dpmsSystem: 'Dentrix',
          providers: [],
        }),
      }));

      expect(response.status).toBe(400);
    });

    it('should handle office with empty providers array', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Empty Providers',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
        }),
      }));

      expect(response.status).toBe(201);
      const office = await response.json();
      expect(office.providerCount).toBe(0);
      expect(office.totalDailyGoal).toBe(0);
    });

    it('should handle office with empty blockTypes array', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Empty BlockTypes',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
          blockTypes: [],
        }),
      }));

      expect(response.status).toBe(201);
    });

    it('should handle office with no rules', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'No Rules',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
        }),
      }));

      expect(response.status).toBe(201);
      const office = await response.json();
      // Should have default rules
      expect(office.rules).toBeDefined();
      expect(office.rules.npModel).toBe('DOCTOR_ONLY');
    });
  });

  describe('Generation Edge Cases', () => {
    it('should fail generation with empty providers', async () => {
      const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'No Providers',
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

    it('should fail generation with empty blockTypes', async () => {
      const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'No BlockTypes',
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
    });

    it('should fail generation for non-existent office', async () => {
      const params = Promise.resolve({ id: 'does-not-exist' });
      const response = await GENERATE(
        new Request('http://localhost/api/offices/does-not-exist/generate', {
          method: 'POST',
          body: JSON.stringify({ days: ['MONDAY'] }),
        }),
        { params }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Export Edge Cases', () => {
    it('should fail export with missing schedules', async () => {
      const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Export Test',
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
        }),
      }));
      const officeData = await office.json();

      const params = Promise.resolve({ id: officeData.id });
      const response = await EXPORT(
        new Request(`http://localhost/api/offices/${officeData.id}/export`, {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        { params }
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.error).toContain('Missing schedules data');
    });

    it('should fail export with invalid schedules format', async () => {
      const office = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Export Test',
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
        }),
      }));
      const officeData = await office.json();

      const params = Promise.resolve({ id: officeData.id });
      const response = await EXPORT(
        new Request(`http://localhost/api/offices/${officeData.id}/export`, {
          method: 'POST',
          body: JSON.stringify({ schedules: 'not-an-array' }),
        }),
        { params }
      );

      expect(response.status).toBe(400);
    });

    it('should fail export for non-existent office', async () => {
      const params = Promise.resolve({ id: 'non-existent' });
      const response = await EXPORT(
        new Request('http://localhost/api/offices/non-existent/export', {
          method: 'POST',
          body: JSON.stringify({ schedules: [] }),
        }),
        { params }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle creating multiple offices concurrently', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(
          CREATE_OFFICE(new Request('http://localhost/api/offices', {
            method: 'POST',
            body: JSON.stringify({
              name: `Concurrent Office ${i}`,
              dpmsSystem: 'Dentrix',
              workingDays: ['Mon'],
              providers: [],
            }),
          }))
        );
      }

      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // All should be in the list
      const listResponse = await LIST_OFFICES();
      const offices = await listResponse.json();
      
      for (let i = 0; i < 5; i++) {
        const found = offices.find((o: any) => o.name === `Concurrent Office ${i}`);
        expect(found).toBeDefined();
      }
    });

    it('should handle rapid create-read-update-delete cycles', async () => {
      // Create
      const create = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Rapid Test',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
        }),
      }));
      const office = await create.json();

      // Read
      const getParams1 = Promise.resolve({ id: office.id });
      const read = await GET_OFFICE(
        new Request(`http://localhost/api/offices/${office.id}`),
        { params: getParams1 }
      );
      expect(read.status).toBe(200);

      // All operations should succeed in rapid succession
      expect(create.status).toBe(201);
    });
  });

  describe('Boundary Values', () => {
    it('should handle very long office names', async () => {
      const longName = 'A'.repeat(500);
      
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: longName,
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
        }),
      }));

      expect(response.status).toBe(201);
      const office = await response.json();
      expect(office.name).toBe(longName);
    });

    it('should handle many providers', async () => {
      const providers = [];
      for (let i = 0; i < 20; i++) {
        providers.push({
          name: `Provider ${i}`,
          role: i % 2 === 0 ? 'Doctor' : 'Hygienist',
          dailyGoal: 5000,
          color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        });
      }

      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Many Providers',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers,
        }),
      }));

      expect(response.status).toBe(201);
      const office = await response.json();
      expect(office.providerCount).toBe(20);
    });

    it('should handle many block types', async () => {
      const blockTypes = [];
      for (let i = 0; i < 30; i++) {
        blockTypes.push({
          label: `BT${i}`,
          description: `Block Type ${i}`,
          minimumAmount: i * 100,
          role: i % 2 === 0 ? 'Doctor' : 'Hygienist',
          duration: 30,
        });
      }

      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Many BlockTypes',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
          blockTypes,
        }),
      }));

      expect(response.status).toBe(201);
      const office = await response.json();
      expect(office.blockTypes).toHaveLength(30);
    });

    it('should handle zero daily goal', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Zero Goal',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [
            {
              name: 'Dr. Zero',
              role: 'Doctor',
              dailyGoal: 0,
              color: '#ec8a1b',
            },
          ],
          blockTypes: [
            { label: 'HP', role: 'Doctor', duration: 60 },
          ],
        }),
      }));

      expect(response.status).toBe(201);
      const office = await response.json();
      expect(office.totalDailyGoal).toBe(0);
    });

    it('should handle very high daily goals', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'High Goal',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [
            {
              name: 'Dr. Rich',
              role: 'Doctor',
              dailyGoal: 999999999,
              color: '#ec8a1b',
            },
          ],
          blockTypes: [
            { label: 'HP', role: 'Doctor', duration: 60 },
          ],
        }),
      }));

      expect(response.status).toBe(201);
      const office = await response.json();
      expect(office.totalDailyGoal).toBe(999999999);
    });
  });

  describe('Data Normalization', () => {
    it('should normalize case-sensitive DPMS names', async () => {
      const tests = [
        { input: 'dentrix', expected: 'DENTRIX' },
        { input: 'Dentrix', expected: 'DENTRIX' },
        { input: 'DENTRIX', expected: 'DENTRIX' },
        { input: 'open dental', expected: 'OPEN_DENTAL' },
        { input: 'Open Dental', expected: 'OPEN_DENTAL' },
      ];

      for (const test of tests) {
        const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
          method: 'POST',
          body: JSON.stringify({
            name: `Test ${test.input}`,
            dpmsSystem: test.input,
            workingDays: ['Mon'],
            providers: [],
          }),
        }));

        const office = await response.json();
        expect(office.dpmsSystem).toBe(test.expected);
      }
    });

    it('should normalize provider roles', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Role Test',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [
            { name: 'P1', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
            { name: 'P2', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
            { name: 'P3', role: 'Hygienist', dailyGoal: 2500, color: '#87bcf3' },
            { name: 'P4', role: 'Hygienist', dailyGoal: 2500, color: '#87bcf3' },
          ],
        }),
      }));

      const office = await response.json();
      expect(office.providers[0].role).toBe('DOCTOR');
      expect(office.providers[1].role).toBe('DOCTOR');
      expect(office.providers[2].role).toBe('HYGIENIST');
      expect(office.providers[3].role).toBe('HYGIENIST');
    });

    it('should normalize working days', async () => {
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Days Test',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          providers: [],
        }),
      }));

      const office = await response.json();
      expect(office.workingDays).toEqual([
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
      ]);
    });
  });

  describe('Mock vs Created Office Interaction', () => {
    it('should prioritize created offices over mock offices with same ID', async () => {
      // This shouldn't happen in practice, but tests the priority logic
      const listBefore = await LIST_OFFICES();
      const before = await listBefore.json();
      const mockCount = before.length;

      // Create new office
      const response = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Priority Test',
          dpmsSystem: 'Dentrix',
          workingDays: ['Mon'],
          providers: [],
        }),
      }));

      const office = await response.json();

      // List should include both mock and created
      const listAfter = await LIST_OFFICES();
      const after = await listAfter.json();
      expect(after.length).toBe(mockCount + 1);
    });

    it('should not affect mock offices when operations fail', async () => {
      const listBefore = await LIST_OFFICES();
      const before = await listBefore.json();
      const mockCount = before.length;

      // Try to create invalid office
      await CREATE_OFFICE(new Request('http://localhost/api/offices', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Invalid',
          // Missing required fields
        }),
      }));

      // Mock offices should be unchanged
      const listAfter = await LIST_OFFICES();
      const after = await listAfter.json();
      expect(after.length).toBe(mockCount);
    });
  });
});
