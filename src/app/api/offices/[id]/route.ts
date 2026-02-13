import { NextResponse } from 'next/server';
import { mockOffices, smileCascadeOffice } from '@/lib/mock-data';

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

  // For other offices, return summary data
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

    // Find the office
    const office = mockOffices.find(o => o.id === id);
    
    if (!office) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // Update office fields
    const updatedOffice = {
      ...office,
      ...body,
      id, // Preserve ID
      updatedAt: new Date().toISOString(),
      // Recalculate aggregates if providers changed
      providerCount: body.providers?.length || office.providerCount,
      totalDailyGoal: body.providers?.reduce((sum: number, p: any) => sum + (p.dailyGoal || 0), 0) || office.totalDailyGoal,
    };

    // In a real app, save to database
    // For now, just return the updated office
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
 * DELETE /api/offices/:id
 * Delete (archive) an office
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Find the office
    const office = mockOffices.find(o => o.id === id);
    
    if (!office) {
      return NextResponse.json(
        { error: 'Office not found' },
        { status: 404 }
      );
    }

    // In a real app, soft delete in database
    // For now, just return success
    return NextResponse.json({ 
      success: true, 
      message: `Office ${id} archived successfully` 
    });
  } catch (error) {
    console.error('Error deleting office:', error);
    return NextResponse.json(
      { error: 'Failed to delete office' },
      { status: 500 }
    );
  }
}
