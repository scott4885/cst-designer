import { NextResponse } from 'next/server';
import { getSchedules, saveSchedule } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { ScheduleSaveInputSchema } from '@/lib/contracts/api-schemas';
import type { TimeSlotOutput, ProviderProductionSummary } from '@/lib/engine/types';

/**
 * GET /api/offices/:id/schedules
 * List all saved schedules for an office.
 * Query params: ?weekType=A&dayOfWeek=Monday&type=WORKING
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const weekType = url.searchParams.get('weekType') ?? undefined;
    const dayOfWeek = url.searchParams.get('dayOfWeek') ?? undefined;
    const type = url.searchParams.get('type') ?? undefined;

    const schedules = await getSchedules(id, { weekType, dayOfWeek, type });

    return NextResponse.json({ schedules });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Office not found')) {
      return handleApiError(new ApiError(404, 'Office not found'));
    }
    return handleApiError(error);
  }
}

/**
 * POST /api/offices/:id/schedules
 * Save a named schedule snapshot for a day+week.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = ScheduleSaveInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    const schedule = await saveSchedule(id, {
      dayOfWeek: data.dayOfWeek,
      weekType: data.weekType,
      slots: data.slots as unknown as TimeSlotOutput[],
      productionSummary: (data.productionSummary ?? []) as unknown as ProviderProductionSummary[],
      warnings: data.warnings ?? [],
      label: data.label,
      // Loop 9: variant tag through POST path too.
      variantLabel: (data as typeof data & { variantLabel?: string | null }).variantLabel,
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Office not found')) {
      return handleApiError(new ApiError(404, 'Office not found'));
    }
    return handleApiError(error);
  }
}
