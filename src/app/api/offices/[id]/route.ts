import { NextResponse } from 'next/server';
import { mockOffices, smileCascadeOffice } from '@/lib/mock-data';
import { getOfficeById, updateOffice, deleteOffice } from '@/lib/office-data-store';

/**
 * GET /api/offices/:id
 * Get a single office with full details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // For Smile Cascade (id=1), return full detailed data
  if (id === '1') {
    return NextResponse.json(smileCascadeOffice);
  }

  // Check created offices first
  const createdOffice = getOfficeById(id);
  if (createdOffice) {
    return NextResponse.json(createdOffice);
  }

  // Fall back to mock offices
  const office = mockOffices.find(o => o.id === id);
  
  if (!office) {
    return NextResponse.json(
      { error: 'Office not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(office);
}

/**
 * PUT /api/offices/:id
 * Update an office
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Check created offices first
    let office = getOfficeById(id);
    
    // Fall back to mock offices (read-only)
    if (!office) {
      office = mockOffices.find(o => o.id === id);
    }
    
    if (!office) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // Recalculate aggregates if providers changed
    const updates = {
      ...body,
      providerCount: body.providers?.length || office.providerCount,
      totalDailyGoal: body.providers?.reduce((sum: number, p: any) => sum + (p.dailyGoal || 0), 0) || office.totalDailyGoal,
    };

    // Try to update in created offices
    const updatedOffice = updateOffice(id, updates);
    
    if (updatedOffice) {
      return NextResponse.json(updatedOffice);
    }

    // Mock offices are read-only, return updated data without persisting
    return NextResponse.json({
      ...office,
      ...updates,
      id,
      updatedAt: new Date().toISOString(),
    });
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
 * Delete (archive) an office
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try to delete from created offices
    const deleted = deleteOffice(id);
    
    if (deleted) {
      return NextResponse.json({ 
        success: true, 
        message: `Office ${id} deleted successfully` 
      });
    }

    // Check if it exists in mock offices
    const mockOffice = mockOffices.find(o => o.id === id);
    
    if (!mockOffice) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // Mock offices cannot be deleted, but return success anyway
    return NextResponse.json({ 
      success: true, 
      message: `Office ${id} is a demo office and cannot be deleted` 
    });
  } catch (error) {
    console.error('Error deleting office:', error);
    return NextResponse.json(
      { error: 'Failed to delete office' },
      { status: 500 }
    );
  }
}
