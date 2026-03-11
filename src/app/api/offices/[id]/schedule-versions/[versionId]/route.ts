import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/offices/:id/schedule-versions/:versionId
 * Returns full slot data for a specific version (for restore)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;

    const version = await prisma.scheduleVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: version.id,
      label: version.label || `Saved ${new Date(version.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      dayOfWeek: version.dayOfWeek,
      weekType: version.weekType,
      slots: JSON.parse(version.slotsJson),
      productionSummary: JSON.parse(version.summaryJson),
      createdAt: version.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error fetching schedule version:', error);
    return NextResponse.json({ error: 'Failed to fetch version' }, { status: 500 });
  }
}

/**
 * PATCH /api/offices/:id/schedule-versions/:versionId
 * Update the label of a version
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const { label } = await request.json();

    const version = await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { label: label ?? '' },
    });

    return NextResponse.json({ id: version.id, label: version.label });
  } catch (error) {
    console.error('Error updating version label:', error);
    return NextResponse.json({ error: 'Failed to update version' }, { status: 500 });
  }
}

/**
 * DELETE /api/offices/:id/schedule-versions/:versionId
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    await prisma.scheduleVersion.delete({ where: { id: versionId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting version:', error);
    return NextResponse.json({ error: 'Failed to delete version' }, { status: 500 });
  }
}
