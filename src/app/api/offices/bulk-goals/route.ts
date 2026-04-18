import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import { BulkGoalsInputSchema } from '@/lib/contracts/api-schemas';

/**
 * PATCH /api/offices/bulk-goals
 *
 * Update provider daily goals by role across multiple offices.
 *
 * Body:
 *   {
 *     officeIds: string[];        // offices to update
 *     doctorGoal: number | null;  // new goal for all DOCTORs (null = skip)
 *     hygienistGoal: number | null; // new goal for all HYGIENISTs (null = skip)
 *   }
 *
 * Returns:
 *   { updatedProviders: number; updatedOffices: number }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    const parsed = BulkGoalsInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const { officeIds, doctorGoal, hygienistGoal } = parsed.data;

    let updatedProviders = 0;

    // Update in a transaction
    await prisma.$transaction(async (tx) => {
      if (doctorGoal !== null && doctorGoal >= 0) {
        const result = await tx.provider.updateMany({
          where: {
            officeId: { in: officeIds },
            role: 'DOCTOR',
          },
          data: { dailyGoal: doctorGoal },
        });
        updatedProviders += result.count;
      }

      if (hygienistGoal !== null && hygienistGoal >= 0) {
        const result = await tx.provider.updateMany({
          where: {
            officeId: { in: officeIds },
            role: 'HYGIENIST',
          },
          data: { dailyGoal: hygienistGoal },
        });
        updatedProviders += result.count;
      }

      // Touch updatedAt on affected offices
      await tx.office.updateMany({
        where: { id: { in: officeIds } },
        data: { updatedAt: new Date() },
      });
    });

    return NextResponse.json({
      updatedProviders,
      updatedOffices: officeIds.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
