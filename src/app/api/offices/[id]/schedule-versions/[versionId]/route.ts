import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import { ScheduleVersionUpdateInputSchema } from '@/lib/contracts/api-schemas';

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
      throw new ApiError(404, 'Version not found');
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
    return handleApiError(error);
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
    const body = await request.json();

    const parsed = ScheduleVersionUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const { label } = parsed.data;

    const version = await prisma.scheduleVersion.update({
      where: { id: versionId },
      data: { label: label ?? '' },
    });

    return NextResponse.json({ id: version.id, label: version.label });
  } catch (error) {
    return handleApiError(error);
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
    return handleApiError(error);
  }
}
