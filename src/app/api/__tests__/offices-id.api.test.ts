import { describe, it, expect, beforeEach } from 'vitest';
import { GET, PUT, DELETE } from '../offices/[id]/route';
import { POST as CREATE_OFFICE } from '../offices/route';
import { createdOffices } from '@/lib/office-data-store';

describe('GET /api/offices/[id]', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should return Smile Cascade office for id=1', async () => {
    const params = Promise.resolve({ id: '1' });
    const response = await GET(
      new Request('http://localhost/api/offices/1'),
      { params }
    );
    
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.id).toBe('1');
    expect(data.name).toBe('Smile Cascade');
  });

  it('should return newly created office', async () => {
    // Create an office first
    const officeData = {
      name: 'New Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [{
        name: 'Dr. Test',
        role: 'Doctor',
        dailyGoal: 5000,
        color: '#ec8a1b',
      }],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();
    const createdId = created.id;

    // Now retrieve it
    const params = Promise.resolve({ id: createdId });
    const response = await GET(
      new Request(`http://localhost/api/offices/${createdId}`),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.id).toBe(createdId);
    expect(data.name).toBe('New Test Office');
    expect(data.providers).toHaveLength(1);
    expect(data.providers[0].name).toBe('Dr. Test');
  });

  it('should prioritize created offices over mock offices', async () => {
    // Create an office with a predictable ID
    const officeData = {
      name: 'Priority Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    // Retrieve it
    const params = Promise.resolve({ id: created.id });
    const response = await GET(
      new Request(`http://localhost/api/offices/${created.id}`),
      { params }
    );

    const data = await response.json();
    expect(data.name).toBe('Priority Test Office');
  });

  it('should return 404 for non-existent office', async () => {
    const params = Promise.resolve({ id: 'non-existent-id' });
    const response = await GET(
      new Request('http://localhost/api/offices/non-existent-id'),
      { params }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Office not found');
  });

  it('should return office with full data including providers', async () => {
    const officeData = {
      name: 'Full Data Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        { name: 'Dr. One', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
        { name: 'Dr. Two', role: 'Hygienist', dailyGoal: 2500, color: '#87bcf3' },
      ],
      blockTypes: [
        { label: 'HP', role: 'Doctor', duration: 60 },
      ],
      rules: {
        npModel: 'doctor_only',
        hpPlacement: 'morning',
      },
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const params = Promise.resolve({ id: created.id });
    const response = await GET(
      new Request(`http://localhost/api/offices/${created.id}`),
      { params }
    );

    const data = await response.json();
    expect(data.providers).toHaveLength(2);
    expect(data.blockTypes).toHaveLength(1);
    expect(data.rules).toBeDefined();
  });
});

describe('PUT /api/offices/[id]', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should update a created office', async () => {
    // Create office
    const officeData = {
      name: 'Original Name',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    // Update it
    const updates = {
      name: 'Updated Name',
      dpmsSystem: 'OPEN_DENTAL',
    };

    const params = Promise.resolve({ id: created.id });
    const response = await PUT(
      new Request(`http://localhost/api/offices/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.name).toBe('Updated Name');
    expect(data.dpmsSystem).toBe('OPEN_DENTAL');
  });

  it('should preserve ID when updating', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();
    const originalId = created.id;

    const updates = {
      id: 'different-id',
      name: 'Updated Name',
    };

    const params = Promise.resolve({ id: originalId });
    const response = await PUT(
      new Request(`http://localhost/api/offices/${originalId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    const data = await response.json();
    expect(data.id).toBe(originalId);
  });

  it('should update updatedAt timestamp', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();
    const originalTimestamp = created.updatedAt;

    const updates = { name: 'Updated Name' };

    const params = Promise.resolve({ id: created.id });
    const response = await PUT(
      new Request(`http://localhost/api/offices/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    const data = await response.json();
    expect(data.updatedAt).toBeDefined();
    expect(new Date(data.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it('should update providers array', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        { name: 'Dr. Original', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
      ],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const updates = {
      providers: [
        { name: 'Dr. New', role: 'Doctor', dailyGoal: 6000, color: '#ff0000' },
      ],
    };

    const params = Promise.resolve({ id: created.id });
    const response = await PUT(
      new Request(`http://localhost/api/offices/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    const data = await response.json();
    expect(data.providers).toHaveLength(1);
    expect(data.providers[0].name).toBe('Dr. New');
  });

  it('should recalculate providerCount when providers change', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        { name: 'Dr. One', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
      ],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const updates = {
      providers: [
        { name: 'Dr. One', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
        { name: 'Dr. Two', role: 'Doctor', dailyGoal: 5000, color: '#ff0000' },
        { name: 'Hygienist', role: 'Hygienist', dailyGoal: 2500, color: '#87bcf3' },
      ],
    };

    const params = Promise.resolve({ id: created.id });
    const response = await PUT(
      new Request(`http://localhost/api/offices/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    const data = await response.json();
    expect(data.providerCount).toBe(3);
  });

  it('should recalculate totalDailyGoal when providers change', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [
        { name: 'Dr. One', role: 'Doctor', dailyGoal: 5000, color: '#ec8a1b' },
      ],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const updates = {
      providers: [
        { name: 'Dr. One', role: 'Doctor', dailyGoal: 3000, color: '#ec8a1b' },
        { name: 'Dr. Two', role: 'Doctor', dailyGoal: 4000, color: '#ff0000' },
      ],
    };

    const params = Promise.resolve({ id: created.id });
    const response = await PUT(
      new Request(`http://localhost/api/offices/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    const data = await response.json();
    expect(data.totalDailyGoal).toBe(7000);
  });

  it('should return 404 for non-existent office', async () => {
    const params = Promise.resolve({ id: 'non-existent' });
    const response = await PUT(
      new Request('http://localhost/api/offices/non-existent', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      }),
      { params }
    );

    expect(response.status).toBe(404);
  });

  it('should allow partial updates', async () => {
    const officeData = {
      name: 'Test Office',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
      timeIncrement: 10,
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    const updates = {
      timeIncrement: 15,
    };

    const params = Promise.resolve({ id: created.id });
    const response = await PUT(
      new Request(`http://localhost/api/offices/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    const data = await response.json();
    expect(data.name).toBe('Test Office'); // Unchanged
    expect(data.timeIncrement).toBe(15); // Changed
  });

  it('should handle updating mock offices (read-only)', async () => {
    // Try to update Smile Cascade (id=1)
    const updates = {
      name: 'Updated Smile Cascade',
    };

    const params = Promise.resolve({ id: '1' });
    const response = await PUT(
      new Request('http://localhost/api/offices/1', {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
      { params }
    );

    // Should return updated data but not persist it
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('Updated Smile Cascade');
  });
});

describe('DELETE /api/offices/[id]', () => {
  beforeEach(() => {
    createdOffices.length = 0;
  });

  it('should delete a created office', async () => {
    // Create office
    const officeData = {
      name: 'To Be Deleted',
      dpmsSystem: 'Dentrix',
      workingDays: ['Mon'],
      providers: [],
    };

    const createResponse = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify(officeData),
    }));
    
    const created = await createResponse.json();

    // Delete it
    const params = Promise.resolve({ id: created.id });
    const response = await DELETE(
      new Request(`http://localhost/api/offices/${created.id}`, {
        method: 'DELETE',
      }),
      { params }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify it's deleted
    expect(createdOffices.length).toBe(0);
  });

  it('should return 404 for non-existent office', async () => {
    const params = Promise.resolve({ id: 'non-existent' });
    const response = await DELETE(
      new Request('http://localhost/api/offices/non-existent', {
        method: 'DELETE',
      }),
      { params }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Office not found');
  });

  it('should handle deleting mock offices gracefully', async () => {
    // Try to delete Smile Cascade (id=1)
    const params = Promise.resolve({ id: '1' });
    const response = await DELETE(
      new Request('http://localhost/api/offices/1', {
        method: 'DELETE',
      }),
      { params }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('demo office');
  });

  it('should only delete the specified office', async () => {
    // Create multiple offices
    const office1 = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Office 1',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [],
      }),
    }));
    
    const office2 = await CREATE_OFFICE(new Request('http://localhost/api/offices', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Office 2',
        dpmsSystem: 'Dentrix',
        workingDays: ['Mon'],
        providers: [],
      }),
    }));

    const created1 = await office1.json();
    const created2 = await office2.json();

    // Delete office 1
    const params = Promise.resolve({ id: created1.id });
    await DELETE(
      new Request(`http://localhost/api/offices/${created1.id}`, {
        method: 'DELETE',
      }),
      { params }
    );

    // Verify only office 1 is deleted
    expect(createdOffices.length).toBe(1);
    expect(createdOffices[0].id).toBe(created2.id);
  });
});
