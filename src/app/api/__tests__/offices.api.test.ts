import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '../offices/route';
import { createdOffices } from '@/lib/office-data-store';
import { mockOffices } from '@/lib/mock-data';

describe('GET /api/offices', () => {
  beforeEach(() => {
    // Clear created offices before each test
    createdOffices.length = 0;
  });

  it('should return mock offices when no offices are created', async () => {
    const response = await GET();
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(mockOffices.length);
  });

  it('should combine mock and created offices', async () => {
    // Add a created office
    const newOfficeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      providers: [{
        name: 'Dr. Test',
        role: 'Doctor',
        operatories: ['OP1'],
        workingHours: { start: '07:00', end: '18:00' },
        lunchBreak: { start: '13:00', end: '14:00' },
        dailyGoal: 5000,
        color: '#ec8a1b',
      }],
      blockTypes: [{
        label: 'HP',
        description: 'High Production',
        minimumAmount: 1200,
        role: 'Doctor',
        duration: 60,
      }],
      rules: {
        npModel: 'doctor_only',
        hpPlacement: 'morning',
        doubleBooking: false,
        matrixing: true,
      },
    };

    await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(newOfficeData),
    }));

    const response = await GET();
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.length).toBe(mockOffices.length + 1);
  });

  it('should return all offices in proper format', async () => {
    const response = await GET();
    const data = await response.json();
    
    // Check that all offices have required fields
    data.forEach((office: any) => {
      expect(office).toHaveProperty('id');
      expect(office).toHaveProperty('name');
      expect(office).toHaveProperty('dpmsSystem');
      expect(office).toHaveProperty('workingDays');
    });
  });
});

describe('POST /api/offices', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should create a new office with valid data', async () => {
    const officeData = {
      name: 'New Dental Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      providers: [{
        name: 'Dr. Smith',
        role: 'Doctor',
        operatories: ['OP1'],
        workingHours: { start: '07:00', end: '18:00' },
        lunchBreak: { start: '13:00', end: '14:00' },
        dailyGoal: 5000,
        color: '#ec8a1b',
      }],
      blockTypes: [{
        label: 'HP',
        description: 'High Production',
        minimumAmount: 1200,
        role: 'Doctor',
        duration: 60,
      }],
      rules: {
        npModel: 'doctor_only',
        hpPlacement: 'morning',
        doubleBooking: false,
        matrixing: true,
      },
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    
    expect(response.status).toBe(201);
    expect(data).toHaveProperty('id');
    expect(data.name).toBe('New Dental Office');
    expect(data.dpmsSystem).toBe('DENTRIX');
    expect(data.providers).toHaveLength(1);
    expect(data.providers[0].name).toBe('Dr. Smith');
  });

  it('should normalize provider roles to uppercase', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [{
        name: 'Dr. Test',
        role: 'Doctor',
        dailyGoal: 5000,
        color: '#ec8a1b',
      }],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.providers[0].role).toBe('DOCTOR');
  });

  it('should normalize hygienist role correctly', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [{
        name: 'Hygienist Test',
        role: 'Hygienist',
        dailyGoal: 2500,
        color: '#87bcf3',
      }],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.providers[0].role).toBe('HYGIENIST');
  });

  it('should normalize working days to uppercase', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon', 'Tue', 'Wed'],
      providers: [],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.workingDays).toEqual(['MONDAY', 'TUESDAY', 'WEDNESDAY']);
  });

  it('should normalize DPMS system names', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Open Dental',
      workingDays: ['Mon'],
      providers: [],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.dpmsSystem).toBe('OPEN_DENTAL');
  });

  it('should calculate provider count correctly', async () => {
    const officeData = {
      name: 'Multi-Provider Office',
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
        {
          name: 'Hygienist One',
          role: 'Hygienist',
          dailyGoal: 2500,
          color: '#87bcf3',
        },
      ],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.providerCount).toBe(3);
  });

  it('should calculate total daily goal correctly', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        { name: 'Dr. One', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
        { name: 'Dr. Two', role: 'Doctor', dailyGoal: 3000, color: '#ff0000' },
        { name: 'Hygienist', role: 'Hygienist', dailyGoal: 2500, color: '#87bcf3' },
      ],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.totalDailyGoal).toBe(10500);
  });

  it('should return 400 if name is missing', async () => {
    const invalidData = {
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(invalidData),
    }));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Missing required fields');
  });

  it('should return 400 if dpmsSystem is missing', async () => {
    const invalidData = {
      name: 'Test Office',
      workingDays: ['Mon'],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(invalidData),
    }));

    expect(response.status).toBe(400);
  });

  it('should return 400 if workingDays is missing', async () => {
    const invalidData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(invalidData),
    }));

    expect(response.status).toBe(400);
  });

  it('should handle office with no providers', async () => {
    const officeData = {
      name: 'Empty Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data.providerCount).toBe(0);
    expect(data.totalDailyGoal).toBe(0);
  });

  it('should assign IDs to providers', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        { name: 'Dr. Test', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
      ],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.providers[0]).toHaveProperty('id');
    expect(data.providers[0].id).toBeTruthy();
  });

  it('should assign IDs to block types', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
      blockTypes: [
        { label: 'HP', description: 'High Production', role: 'Doctor', duration: 60 },
      ],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.blockTypes[0]).toHaveProperty('id');
    expect(data.blockTypes[0].id).toBeTruthy();
  });

  it('should set default values for optional provider fields', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        { name: 'Dr. Minimal', role: 'Doctor' },
      ],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    const provider = data.providers[0];
    
    expect(provider.operatories).toEqual(['OP1']);
    expect(provider.workingStart).toBe('07:00');
    expect(provider.workingEnd).toBe('18:00');
    expect(provider.lunchStart).toBe('13:00');
    expect(provider.lunchEnd).toBe('14:00');
    expect(provider.dailyGoal).toBe(0);
    expect(provider.color).toBe('#666');
  });

  it('should normalize block type roles', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
      blockTypes: [
        { label: 'HP', role: 'Doctor', duration: 60 },
        { label: 'PP', role: 'Hygienist', duration: 60 },
      ],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.blockTypes[0].appliesToRole).toBe('DOCTOR');
    expect(data.blockTypes[1].appliesToRole).toBe('HYGIENIST');
  });

  it('should normalize schedule rules', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
      rules: {
        npModel: 'hygienist_only',
        hpPlacement: 'afternoon',
        doubleBooking: true,
        matrixing: false,
      },
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.rules.npModel).toBe('HYGIENIST_ONLY');
    expect(data.rules.hpPlacement).toBe('AFTERNOON');
    expect(data.rules.doubleBooking).toBe(true);
    expect(data.rules.matrixing).toBe(false);
  });

  it('should set default rule values', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data.rules.npModel).toBe('DOCTOR_ONLY');
    expect(data.rules.hpPlacement).toBe('MORNING');
    expect(data.rules.doubleBooking).toBe(false);
    expect(data.rules.matrixing).toBe(true);
    expect(data.rules.emergencyHandling).toBe('ACCESS_BLOCKS');
  });

  it('should store office in createdOffices array', async () => {
    const officeData = {
      name: 'Stored Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const initialCount = createdOffices.length;

    await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    expect(createdOffices.length).toBe(initialCount + 1);
    expect(createdOffices[createdOffices.length - 1].name).toBe('Stored Office');
  });

  it('should include updatedAt timestamp', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const response = await POST(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));

    const data = await response.json();
    expect(data).toHaveProperty('updatedAt');
    expect(new Date(data.updatedAt).getTime()).toBeGreaterThan(0);
  });
});
