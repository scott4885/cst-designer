import { NextResponse } from 'next/server';
import { mockOffices } from '@/lib/mock-data';

/**
 * GET /api/offices
 * Returns list of all offices
 */
export async function GET() {
  return NextResponse.json(mockOffices);
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

    // Create new office
    const newOffice = {
      id: String(mockOffices.length + 1),
      name: body.name,
      dpmsSystem: body.dpmsSystem,
      workingDays: body.workingDays,
      timeIncrement: body.timeIncrement || 10,
      feeModel: body.feeModel || 'UCR',
      providerCount: body.providers?.length || 0,
      totalDailyGoal: body.providers?.reduce((sum: number, p: any) => sum + (p.dailyGoal || 0), 0) || 0,
      updatedAt: new Date().toISOString(),
      providers: body.providers || [],
      blockTypes: body.blockTypes || [],
      rules: body.rules || {
        npModel: 'DOCTOR_ONLY',
        npBlocksPerDay: 2,
        srpBlocksPerDay: 2,
        hpPlacement: 'MORNING',
        doubleBooking: false,
        matrixing: true,
        emergencyHandling: 'ACCESS_BLOCKS',
      },
    };

    // In a real app, save to database
    // For now, just return the created office
    return NextResponse.json(newOffice, { status: 201 });
  } catch (error) {
    console.error('Error creating office:', error);
    return NextResponse.json(
      { error: 'Failed to create office' },
      { status: 500 }
    );
  }
}
