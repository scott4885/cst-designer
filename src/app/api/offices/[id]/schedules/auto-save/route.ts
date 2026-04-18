import { NextResponse } from 'next/server';
import { autoSaveSchedule } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { ScheduleAutoSaveInputSchema } from '@/lib/contracts/api-schemas';
import type { TimeSlotOutput, ProviderProductionSummary } from '@/lib/engine/types';

/**
 * POST /api/offices/:id/schedules/auto-save
 * Debounced auto-save endpoint — upserts a WORKING schedule for the
 * given office+day+week combination. The frontend store calls this
 * on a debounce timer whenever the user edits a schedule interactively.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = ScheduleAutoSaveInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    const schedule = await autoSaveSchedule(id, {
      dayOfWeek: data.dayOfWeek,
      weekType: data.weekType,
      slots: data.slots as unknown as TimeSlotOutput[],
      productionSummary: (data.productionSummary ?? []) as unknown as ProviderProductionSummary[],
      warnings: data.warnings ?? [],
      // Loop 9: round-trip variant tag through persistence.
      variantLabel: (data as typeof data & { variantLabel?: string | null }).variantLabel,
    });

    return NextResponse.json({ id: schedule.id, updatedAt: schedule.updatedAt });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Office not found')) {
      return handleApiError(new ApiError(404, 'Office not found'));
    }
    return handleApiError(error);
  }
}
