import { describe, it, expect, beforeEach } from 'vitest';
import {
  createdOffices,
  addOffice,
  getOfficeById,
  getAllCreatedOffices,
  updateOffice,
  deleteOffice,
} from '../office-data-store';
import type { OfficeData } from '../mock-data';

describe('office-data-store', () => {
  // Helper to create test office
  const createTestOffice = (id: string, name: string): OfficeData => ({
    id,
    name,
    dpmsSystem: 'DENTRIX',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    timeIncrement: 10,
    feeModel: 'UCR',
    providerCount: 1,
    totalDailyGoal: 5000,
    updatedAt: new Date().toISOString(),
    providers: [
      {
        id: `${id}-provider-1`,
        name: 'Dr. Test',
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
    blockTypes: [
      {
        id: `${id}-block-1`,
        label: 'HP',
        description: 'High Production',
        minimumAmount: 1200,
        appliesToRole: 'DOCTOR',
        durationMin: 60,
        durationMax: 90,
      },
    ],
    rules: {
      npModel: 'DOCTOR_ONLY',
      npBlocksPerDay: 2,
      srpBlocksPerDay: 2,
      hpPlacement: 'MORNING',
      doubleBooking: false,
      matrixing: true,
      emergencyHandling: 'ACCESS_BLOCKS',
    },
  });

  // Clear the store before each test
  beforeEach(() => {
    createdOffices.length = 0;
  });

  describe('addOffice', () => {
    it('should add an office to the store', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      expect(createdOffices).toHaveLength(1);
      expect(createdOffices[0]).toEqual(office);
    });

    it('should add multiple offices', () => {
      const office1 = createTestOffice('test-1', 'Test Office 1');
      const office2 = createTestOffice('test-2', 'Test Office 2');
      
      addOffice(office1);
      addOffice(office2);
      
      expect(createdOffices).toHaveLength(2);
      expect(createdOffices[0]).toEqual(office1);
      expect(createdOffices[1]).toEqual(office2);
    });

    it('should preserve all office data including providers', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const stored = createdOffices[0];
      expect(stored.providers).toBeDefined();
      expect(stored.providers).toHaveLength(1);
      expect(stored.providers![0].name).toBe('Dr. Test');
    });

    it('should preserve blockTypes and rules', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const stored = createdOffices[0];
      expect(stored.blockTypes).toBeDefined();
      expect(stored.blockTypes).toHaveLength(1);
      expect(stored.rules).toBeDefined();
      expect(stored.rules!.npModel).toBe('DOCTOR_ONLY');
    });
  });

  describe('getOfficeById', () => {
    it('should retrieve an office by ID', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const retrieved = getOfficeById('test-1');
      expect(retrieved).toEqual(office);
    });

    it('should return undefined for non-existent ID', () => {
      const retrieved = getOfficeById('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should find the correct office among multiple offices', () => {
      const office1 = createTestOffice('test-1', 'Test Office 1');
      const office2 = createTestOffice('test-2', 'Test Office 2');
      const office3 = createTestOffice('test-3', 'Test Office 3');
      
      addOffice(office1);
      addOffice(office2);
      addOffice(office3);
      
      const retrieved = getOfficeById('test-2');
      expect(retrieved).toEqual(office2);
      expect(retrieved!.name).toBe('Test Office 2');
    });

    it('should return office with all nested data', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const retrieved = getOfficeById('test-1');
      expect(retrieved!.providers).toBeDefined();
      expect(retrieved!.blockTypes).toBeDefined();
      expect(retrieved!.rules).toBeDefined();
    });
  });

  describe('getAllCreatedOffices', () => {
    it('should return empty array when no offices exist', () => {
      const offices = getAllCreatedOffices();
      expect(offices).toEqual([]);
    });

    it('should return all offices', () => {
      const office1 = createTestOffice('test-1', 'Test Office 1');
      const office2 = createTestOffice('test-2', 'Test Office 2');
      
      addOffice(office1);
      addOffice(office2);
      
      const offices = getAllCreatedOffices();
      expect(offices).toHaveLength(2);
      expect(offices).toEqual([office1, office2]);
    });
  });

  describe('updateOffice', () => {
    it('should update an existing office', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const updated = updateOffice('test-1', { name: 'Updated Office' });
      
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Office');
      expect(updated!.id).toBe('test-1'); // ID should not change
    });

    it('should preserve ID when updating', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const updated = updateOffice('test-1', { 
        id: 'different-id', // Try to change ID
        name: 'Updated Office' 
      });
      
      expect(updated!.id).toBe('test-1'); // ID should remain unchanged
    });

    it('should update updatedAt timestamp', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const updated = updateOffice('test-1', { name: 'Updated Office' });
      
      // Timestamp should be defined and valid
      expect(updated!.updatedAt).toBeDefined();
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent office', () => {
      const updated = updateOffice('non-existent', { name: 'Updated' });
      expect(updated).toBeUndefined();
    });

    it('should update providers array', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const newProviders = [
        {
          id: 'new-provider-1',
          name: 'Dr. New',
          role: 'DOCTOR' as const,
          operatories: ['OP2'],
          workingStart: '08:00',
          workingEnd: '17:00',
          dailyGoal: 6000,
          color: '#ff0000',
        },
      ];
      
      const updated = updateOffice('test-1', { providers: newProviders });
      
      expect(updated!.providers).toHaveLength(1);
      expect(updated!.providers![0].name).toBe('Dr. New');
    });

    it('should partially update office data', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const updated = updateOffice('test-1', { 
        dpmsSystem: 'OPEN_DENTAL',
        timeIncrement: 15,
      });
      
      expect(updated!.name).toBe('Test Office 1'); // Unchanged
      expect(updated!.dpmsSystem).toBe('OPEN_DENTAL'); // Changed
      expect(updated!.timeIncrement).toBe(15); // Changed
    });
  });

  describe('deleteOffice', () => {
    it('should delete an existing office', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      const deleted = deleteOffice('test-1');
      
      expect(deleted).toBe(true);
      expect(createdOffices).toHaveLength(0);
    });

    it('should return false for non-existent office', () => {
      const deleted = deleteOffice('non-existent');
      expect(deleted).toBe(false);
    });

    it('should delete the correct office among multiple', () => {
      const office1 = createTestOffice('test-1', 'Test Office 1');
      const office2 = createTestOffice('test-2', 'Test Office 2');
      const office3 = createTestOffice('test-3', 'Test Office 3');
      
      addOffice(office1);
      addOffice(office2);
      addOffice(office3);
      
      const deleted = deleteOffice('test-2');
      
      expect(deleted).toBe(true);
      expect(createdOffices).toHaveLength(2);
      expect(getOfficeById('test-1')).toBeDefined();
      expect(getOfficeById('test-2')).toBeUndefined();
      expect(getOfficeById('test-3')).toBeDefined();
    });

    it('should not affect other offices when deleting', () => {
      const office1 = createTestOffice('test-1', 'Test Office 1');
      const office2 = createTestOffice('test-2', 'Test Office 2');
      
      addOffice(office1);
      addOffice(office2);
      
      deleteOffice('test-1');
      
      const remaining = getOfficeById('test-2');
      expect(remaining).toEqual(office2);
    });
  });

  describe('edge cases', () => {
    it('should handle office with no providers', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      office.providers = [];
      office.providerCount = 0;
      
      addOffice(office);
      const retrieved = getOfficeById('test-1');
      
      expect(retrieved!.providers).toEqual([]);
      expect(retrieved!.providerCount).toBe(0);
    });

    it('should handle office with no blockTypes', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      office.blockTypes = [];
      
      addOffice(office);
      const retrieved = getOfficeById('test-1');
      
      expect(retrieved!.blockTypes).toEqual([]);
    });

    it('should handle multiple rapid updates', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      
      updateOffice('test-1', { name: 'Update 1' });
      updateOffice('test-1', { name: 'Update 2' });
      updateOffice('test-1', { name: 'Update 3' });
      
      const final = getOfficeById('test-1');
      expect(final!.name).toBe('Update 3');
    });

    it('should maintain data integrity after delete and re-add', () => {
      const office = createTestOffice('test-1', 'Test Office 1');
      addOffice(office);
      deleteOffice('test-1');
      
      const newOffice = createTestOffice('test-1', 'Re-added Office');
      addOffice(newOffice);
      
      const retrieved = getOfficeById('test-1');
      expect(retrieved!.name).toBe('Re-added Office');
    });
  });
});
