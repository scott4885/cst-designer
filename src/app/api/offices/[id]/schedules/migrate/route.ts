import { NextResponse } from 'next/server';
import { migrateLocalStorageSchedules } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { ScheduleMigrateInputSchema } from '@/lib/contracts/api-schemas';
import type { TimeSlotOutput, ProviderProductionSummary } from '@/lib/engine/types';

/**
 * POST /api/offices/:id/schedules/migrate
 * One-time migration of localStorage schedule data into the database.
 * The frontend calls this once per office when it detects data in
 * localStorage that has not yet been persisted.
 *
 * Body:
 * {
 *   schedules: Record<dayOfWeek, { slots, productionSummary, warnings }>,
 *   weekType: string
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parsed = ScheduleMigrateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    // Normalize schedule entries so downstream has stable slots/productionSummary/warnings.
    const schedules: Record<string, { slots: unknown; productionSummary: unknown; warnings: unknown }> = {};
    for (const [day, entry] of Object.entries(data.schedules)) {
      schedules[day] = {
        slots: (entry.slots ?? []) as unknown as TimeSlotOutput[],
        productionSummary: (entry.productionSummary ?? []) as unknown as ProviderProductionSummary[],
        warnings: entry.warnings ?? [],
      };
    }

    const result = await migrateLocalStorageSchedules(id, {
      schedules,
      weekType: data.weekType,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Office not found')) {
      return handleApiError(new ApiError(404, 'Office not found'));
    }
    return handleApiError(error);
  }
}
