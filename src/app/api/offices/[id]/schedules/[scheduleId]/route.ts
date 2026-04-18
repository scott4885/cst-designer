import { NextResponse } from 'next/server';
import { getScheduleById, updateSchedule, deleteSchedule } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { ScheduleUpdateInputSchema } from '@/lib/contracts/api-schemas';
import type { TimeSlotOutput, ProviderProductionSummary } from '@/lib/engine/types';

/**
 * GET /api/offices/:id/schedules/:scheduleId
 * Load a specific schedule with full slot data.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> },
) {
  try {
    const { id, scheduleId } = await params;

    const schedule = await getScheduleById(scheduleId);
    if (!schedule) {
      throw new ApiError(404, 'Schedule not found');
    }

    // Ensure the schedule belongs to the requested office
    if (schedule.officeId !== id) {
      throw new ApiError(404, 'Schedule not found for this office');
    }

    return NextResponse.json(schedule);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/offices/:id/schedules/:scheduleId
 * Update a schedule after interactive edits.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> },
) {
  try {
    const { id, scheduleId } = await params;
    const body = await request.json();

    const parsed = ScheduleUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    // Verify schedule belongs to this office
    const existing = await getScheduleById(scheduleId);
    if (!existing) {
      throw new ApiError(404, 'Schedule not found');
    }
    if (existing.officeId !== id) {
      throw new ApiError(404, 'Schedule not found for this office');
    }

    const updated = await updateSchedule(scheduleId, {
      slots: data.slots as unknown as TimeSlotOutput[],
      productionSummary: data.productionSummary as unknown as ProviderProductionSummary[],
      warnings: data.warnings,
      label: data.label,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/offices/:id/schedules/:scheduleId
 * Delete a saved schedule.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> },
) {
  try {
    const { id, scheduleId } = await params;

    // Verify schedule belongs to this office
    const existing = await getScheduleById(scheduleId);
    if (!existing) {
      throw new ApiError(404, 'Schedule not found');
    }
    if (existing.officeId !== id) {
      throw new ApiError(404, 'Schedule not found for this office');
    }

    await deleteSchedule(scheduleId);

    return NextResponse.json({ success: true, message: `Schedule ${scheduleId} deleted` });
  } catch (error) {
    return handleApiError(error);
  }
}
