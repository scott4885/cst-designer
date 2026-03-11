import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
    const { officeIds, doctorGoal, hygienistGoal } = body as {
      officeIds: string[];
      doctorGoal: number | null;
      hygienistGoal: number | null;
    };

    if (!Array.isArray(officeIds) || officeIds.length === 0) {
      return NextResponse.json(
        { error: 'officeIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (doctorGoal === null && hygienistGoal === null) {
      return NextResponse.json(
        { error: 'At least one of doctorGoal or hygienistGoal must be provided' },
        { status: 400 }
      );
    }

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
    console.error('Error in bulk-goals PATCH:', error);
    return NextResponse.json(
      { error: 'Failed to update provider goals' },
      { status: 500 }
    );
  }
}
