import { NextResponse } from 'next/server';
import { mockOffices, smileCascadeOffice } from '@/lib/mock-data';
import { generateSchedule } from '@/lib/engine/generator';
import { GenerationInput } from '@/lib/engine/types';
import { getOfficeById } from '@/lib/office-data-store';

/**
 * POST /api/offices/:id/generate
 * Generate schedule for an office using the schedule engine
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Find the office - check created offices first
    let office = getOfficeById(id);
    
    // Fall back to mock offices
    if (!office) {
      office = mockOffices.find(o => o.id === id);
    }
    
    // For Smile Cascade, use full data
    if (id === '1') {
      office = smileCascadeOffice;
    }
    
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

    // Get days to generate from request or use office working days
    const daysToGenerate = body.days || office.workingDays;

    // Generate schedules for each day
    const schedules = [];
    
    for (const dayOfWeek of daysToGenerate) {
      const input: GenerationInput = {
        providers: office.providers,
        blockTypes: office.blockTypes,
        rules: office.rules,
        timeIncrement: office.timeIncrement,
        dayOfWeek: dayOfWeek,
      };

      const result = generateSchedule(input);
      schedules.push(result);
    }

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
