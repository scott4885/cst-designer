import { NextResponse } from 'next/server';
import { getOfficeById, generateSchedule, autoSaveSchedule } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { GenerateInputSchema } from '@/lib/contracts/api-schemas';

/**
 * POST /api/offices/:id/generate
 * Generate schedule for an office.
 * Optional query param: ?autoApplyStagger=true — auto-saves generated
 * schedules as WORKING copies in the database.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Body may be empty — default to {} so safeParse still runs.
    const parsed = GenerateInputSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const parsedBody = parsed.data;

    const url = new URL(request.url);
    const autoApplyStaggerParam = url.searchParams.get('autoApplyStagger');
    // Stagger resolver defaults ON — only disable if explicitly set to 'false'.
    const autoApplyStagger = autoApplyStaggerParam !== 'false';
    // Legacy behavior: the same flag also triggers auto-saving the generated
    // schedules as WORKING copies. Preserve the opt-in shape (must be 'true').
    const autoSaveGenerated = autoApplyStaggerParam === 'true';

    // Find the office in database
    const office = await getOfficeById(id);

    if (!office) {
      throw new ApiError(404, 'Office not found');
    }

    // Validate office has required data
    if (!office.providers || !office.blockTypes || !office.rules) {
      throw new ApiError(400, 'Office missing required data (providers, blockTypes, or rules)');
    }
    if (office.providers.length === 0) {
      throw new ApiError(400, 'Office must have at least one provider to generate schedules');
    }
    if (office.blockTypes.length === 0) {
      throw new ApiError(400, 'Office must have at least one block type to generate schedules');
    }

    // Get days to generate from request or use office working days
    const daysToGenerate = parsedBody.days || office.workingDays;
    const weekType = parsedBody.weekType || 'A';

    // Generate schedules via the engine (stagger resolver runs by default)
    const schedules = await generateSchedule(id, daysToGenerate, weekType, {
      autoApplyStagger,
    });

    // Optionally auto-save each generated result as a WORKING schedule.
    // Saves are independent across days, so run in parallel to cut the
    // request lifecycle from N sequential round-trips to one Promise.all
    // batch (~5x faster for a 5-day generate).
    if (autoSaveGenerated) {
      await Promise.all(
        schedules.map((result) =>
          autoSaveSchedule(id, {
            dayOfWeek: result.dayOfWeek,
            weekType,
            slots: result.slots,
            productionSummary: result.productionSummary ?? [],
            warnings: result.warnings ?? [],
          }),
        ),
      );
    }

    return NextResponse.json({
      officeId: id,
      officeName: office.name,
      schedules,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
