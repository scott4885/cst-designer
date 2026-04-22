import { NextResponse } from 'next/server';
import { getOfficeById, updateOffice, deleteOffice } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { UpdateOfficeInputSchema } from '@/lib/contracts/api-schemas';

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
      throw new ApiError(404, 'Office not found');
    }

    return NextResponse.json(office);
  } catch (error) {
    return handleApiError(error);
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

    const parsed = UpdateOfficeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    const office = await getOfficeById(id);
    if (!office) {
      throw new ApiError(404, 'Office not found');
    }

    // Build partial update — only include fields that were present in the request body.
    // (Zod transforms normalize casing; anything the user didn't send stays undefined.)
    const updatePayload: Parameters<typeof updateOffice>[1] = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.dpmsSystem !== undefined) updatePayload.dpmsSystem = data.dpmsSystem;
    if (data.workingDays !== undefined) updatePayload.workingDays = data.workingDays as string[];
    if (data.timeIncrement !== undefined) updatePayload.timeIncrement = data.timeIncrement;
    if (data.feeModel !== undefined) updatePayload.feeModel = data.feeModel;
    if (data.providers !== undefined) {
      // Narrow role union (Zod → 'DOCTOR' | 'HYGIENIST'; engine type accepts these)
      updatePayload.providers = data.providers as unknown as Parameters<typeof updateOffice>[1]['providers'];
    }
    if (data.blockTypes !== undefined) {
      updatePayload.blockTypes = data.blockTypes as unknown as Parameters<typeof updateOffice>[1]['blockTypes'];
    }
    if (data.rules !== undefined) {
      updatePayload.rules = data.rules as unknown as Parameters<typeof updateOffice>[1]['rules'];
    }
    if (data.schedulingRules !== undefined) updatePayload.schedulingRules = data.schedulingRules;
    if (data.alternateWeekEnabled !== undefined) updatePayload.alternateWeekEnabled = data.alternateWeekEnabled;
    if (data.rotationEnabled !== undefined) updatePayload.rotationEnabled = data.rotationEnabled;
    if (data.rotationWeeks !== undefined) updatePayload.rotationWeeks = data.rotationWeeks;
    if (data.schedulingWindows !== undefined) {
      updatePayload.schedulingWindows = typeof data.schedulingWindows === 'string'
        ? data.schedulingWindows
        : JSON.stringify(data.schedulingWindows);
    }
    // Sprint 5 — intake V2 blobs pass through as records; data-access layer
    // stringifies on the way into Prisma.
    if (data.intakeGoals !== undefined) {
      updatePayload.intakeGoals = data.intakeGoals as Record<string, unknown>;
    }
    if (data.intakeConstraints !== undefined) {
      updatePayload.intakeConstraints = data.intakeConstraints as Record<string, unknown>;
    }

    const updatedOffice = await updateOffice(id, updatePayload);

    if (!updatedOffice) {
      throw new ApiError(500, 'Failed to update office');
    }

    return NextResponse.json(updatedOffice);
  } catch (error) {
    return handleApiError(error);
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
      throw new ApiError(404, 'Office not found or failed to delete');
    }

    return NextResponse.json({
      success: true,
      message: `Office ${id} deleted successfully`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
