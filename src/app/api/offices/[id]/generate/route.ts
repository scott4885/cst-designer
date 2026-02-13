import { NextResponse } from 'next/server';
import { getOfficeById, generateSchedule } from '@/lib/data-access';

/**
 * POST /api/offices/:id/generate
 * Generate schedule for an office and save to database
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Find the office in database
    const office = await getOfficeById(id);
    
    if (!office) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // Validate office has required data
    if (!office.providers || !office.blockTypes || !office.rules) {
      return NextResponse.json(
        { error: 'Office missing required data (providers, blockTypes, or rules)' },
        { status: 400 }
      );
    }

    // Validate arrays are not empty
    if (office.providers.length === 0) {
      return NextResponse.json(
        { error: 'Office must have at least one provider to generate schedules' },
        { status: 400 }
      );
    }

    if (office.blockTypes.length === 0) {
      return NextResponse.json(
        { error: 'Office must have at least one block type to generate schedules' },
        { status: 400 }
      );
    }

    // Get days to generate from request or use office working days
    const daysToGenerate = body.days || office.workingDays;

    // Generate and save schedules to database
    const schedules = await generateSchedule(id, daysToGenerate);

    return NextResponse.json({
      officeId: id,
      officeName: office.name,
      schedules,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating schedule:', error);
    return NextResponse.json(
      { error: 'Failed to generate schedule', details: String(error) },
      { status: 500 }
    );
  }
}
