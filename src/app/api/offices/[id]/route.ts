import { NextResponse } from 'next/server';
import { getOfficeById, updateOffice, deleteOffice } from '@/lib/data-access';

/**
 * GET /api/offices/:id
 * Get a single office with full details from database
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const office = await getOfficeById(id);
    
    if (!office) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(office);
  } catch (error) {
    console.error('Error fetching office:', error);
    return NextResponse.json(
      { error: 'Failed to fetch office' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/offices/:id
 * Update an office in database
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const office = await getOfficeById(id);
    if (!office) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // Update office in database
    const updatedOffice = await updateOffice(id, {
      name: body.name,
      dpmsSystem: body.dpmsSystem,
      workingDays: body.workingDays,
      timeIncrement: body.timeIncrement,
      feeModel: body.feeModel,
      providers: body.providers,
      blockTypes: body.blockTypes,
      rules: body.rules,
      schedulingRules: body.schedulingRules,
      alternateWeekEnabled: body.alternateWeekEnabled,
      rotationEnabled: body.rotationEnabled,
      rotationWeeks: body.rotationWeeks,
    });

    if (!updatedOffice) {
      return NextResponse.json(
        { error: 'Failed to update office' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedOffice);
  } catch (error) {
    console.error('Error updating office:', error);
    return NextResponse.json(
      { error: 'Failed to update office' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/offices/:id
 * Partially update an office
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

/**
 * DELETE /api/offices/:id
 * Delete an office from database (cascade deletes all related data)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const deleted = await deleteOffice(id);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Office not found or failed to delete' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: `Office ${id} deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting office:', error);
    return NextResponse.json(
      { error: 'Failed to delete office' },
      { status: 500 }
    );
  }
}
