import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getOffices, createOffice } from '@/lib/data-access';

/**
 * GET /api/offices
 * Returns list of all offices from database
 */
export async function GET() {
  try {
    const offices = await getOffices();
    return NextResponse.json(offices);
  } catch (error) {
    console.error('Error fetching offices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch offices' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/offices
 * Create a new office in database
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

    // Map providers to include IDs
    const providers = (body.providers || []).map((p: any) => ({
      id: randomUUID(),
      name: p.name,
      role: (p.role === 'Doctor' ? 'DOCTOR' : 'HYGIENIST') as 'DOCTOR' | 'HYGIENIST',
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
      appliesToRole: (b.role === 'Doctor' ? 'DOCTOR' : b.role === 'Hygienist' ? 'HYGIENIST' : 'BOTH') as 'DOCTOR' | 'HYGIENIST' | 'BOTH',
      durationMin: b.duration || 30,
      durationMax: b.durationMax || b.duration || 30,
    }));

    // Normalize rules
    const rules = {
      npModel: (body.rules?.npModel?.toUpperCase() || 'DOCTOR_ONLY') as 'DOCTOR_ONLY' | 'HYGIENIST_ONLY' | 'EITHER',
      npBlocksPerDay: body.rules?.npBlocksPerDay || 2,
      srpBlocksPerDay: body.rules?.srpBlocksPerDay || 2,
      hpPlacement: (body.rules?.hpPlacement?.toUpperCase() || 'MORNING') as 'MORNING' | 'AFTERNOON' | 'ANY',
      doubleBooking: body.rules?.doubleBooking || false,
      matrixing: body.rules?.matrixing !== false,
      emergencyHandling: 'ACCESS_BLOCKS' as 'DEDICATED' | 'FLEX' | 'ACCESS_BLOCKS',
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

    // Create office in database
    const newOffice = await createOffice({
      name: body.name,
      dpmsSystem: body.dpmsSystem.toUpperCase().replace(' ', '_'),
      workingDays,
      timeIncrement: body.timeIncrement || 10,
      feeModel: body.feeModel || 'UCR',
      providers,
      blockTypes,
      rules,
    });

    return NextResponse.json(newOffice, { status: 201 });
  } catch (error) {
    console.error('Error creating office:', error);
    return NextResponse.json(
      { error: 'Failed to create office' },
      { status: 500 }
    );
  }
}
