import { NextResponse } from 'next/server';
import { mockOffices } from '@/lib/mock-data';
import { randomUUID } from 'crypto';

// In-memory store for created offices
let createdOffices: any[] = [];

/**
 * GET /api/offices
 * Returns list of all offices
 */
export async function GET() {
  // Combine mock offices with created offices
  return NextResponse.json([...mockOffices, ...createdOffices]);
}

/**
 * POST /api/offices
 * Create a new office
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.dpmsSystem || !body.workingDays) {
      return NextResponse.json(
        { error: 'Missing required fields: name, dpmsSystem, workingDays' },
        { status: 400 }
      );
    }

    // Generate UUID for the new office
    const newOfficeId = randomUUID();

    // Map providers to include IDs
    const providers = (body.providers || []).map((p: any) => ({
      id: randomUUID(),
      name: p.name,
      role: p.role === 'Doctor' ? 'DOCTOR' : 'HYGIENIST',
      operatories: p.operatories || ['OP1'],
      workingStart: p.workingHours?.start || '07:00',
      workingEnd: p.workingHours?.end || '18:00',
      lunchStart: p.lunchBreak?.start || '13:00',
      lunchEnd: p.lunchBreak?.end || '14:00',
      dailyGoal: p.dailyGoal || 0,
      color: p.color || '#666',
    }));

    // Map block types
    const blockTypes = (body.blockTypes || []).map((b: any) => ({
      id: randomUUID(),
      label: b.label,
      description: b.description || '',
      minimumAmount: b.minimumAmount || 0,
      appliesToRole: b.role === 'Doctor' ? 'DOCTOR' : b.role === 'Hygienist' ? 'HYGIENIST' : 'BOTH',
      durationMin: b.duration || 30,
      durationMax: b.durationMax || b.duration || 30,
    }));

    // Normalize rules
    const rules = {
      npModel: body.rules?.npModel?.toUpperCase() || 'DOCTOR_ONLY',
      npBlocksPerDay: body.rules?.npBlocksPerDay || 2,
      srpBlocksPerDay: body.rules?.srpBlocksPerDay || 2,
      hpPlacement: body.rules?.hpPlacement?.toUpperCase() || 'MORNING',
      doubleBooking: body.rules?.doubleBooking || false,
      matrixing: body.rules?.matrixing !== false,
      emergencyHandling: 'ACCESS_BLOCKS',
    };

    // Normalize working days
    const workingDays = (body.workingDays || []).map((day: string) => {
      const dayMap: Record<string, string> = {
        Mon: 'MONDAY',
        Tue: 'TUESDAY',
        Wed: 'WEDNESDAY',
        Thu: 'THURSDAY',
        Fri: 'FRIDAY',
      };
      return dayMap[day] || day.toUpperCase();
    });

    // Create new office
    const newOffice = {
      id: newOfficeId,
      name: body.name,
      dpmsSystem: body.dpmsSystem.toUpperCase().replace(' ', '_'),
      workingDays,
      timeIncrement: body.timeIncrement || 10,
      feeModel: body.feeModel || 'UCR',
      providerCount: providers.length,
      totalDailyGoal: providers.reduce((sum: number, p: any) => sum + (p.dailyGoal || 0), 0),
      updatedAt: new Date().toISOString(),
      providers,
      blockTypes,
      rules,
    };

    // Store in memory
    createdOffices.push(newOffice);

    return NextResponse.json(newOffice, { status: 201 });
  } catch (error) {
    console.error('Error creating office:', error);
    return NextResponse.json(
      { error: 'Failed to create office' },
      { status: 500 }
    );
  }
}
