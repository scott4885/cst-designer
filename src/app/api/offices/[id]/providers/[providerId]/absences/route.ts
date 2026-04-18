import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import { ProviderAbsenceSchema } from '@/lib/contracts/api-schemas';

/**
 * GET /api/offices/:id/providers/:providerId/absences
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; providerId: string }> }
) {
  try {
    const { providerId } = await params;
    const absences = await prisma.providerAbsence.findMany({
      where: { providerId },
      orderBy: { date: 'asc' },
    });
    return NextResponse.json(absences);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/offices/:id/providers/:providerId/absences
 * Mark a provider absent on a specific date
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; providerId: string }> }
) {
  try {
    const { id: officeId, providerId } = await params;
    const body = await request.json();

    const parsed = ProviderAbsenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const { date, reason } = parsed.data;

    // Upsert: if already absent on this date, update the reason
    const existing = await prisma.providerAbsence.findFirst({
      where: { providerId, date },
    });

    if (existing) {
      const updated = await prisma.providerAbsence.update({
        where: { id: existing.id },
        data: { reason: reason ?? '' },
      });
      return NextResponse.json(updated);
    }

    const absence = await prisma.providerAbsence.create({
      data: { providerId, officeId, date, reason: reason ?? '' },
    });

    return NextResponse.json(absence, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/offices/:id/providers/:providerId/absences?date=YYYY-MM-DD
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; providerId: string }> }
) {
  try {
    const { providerId } = await params;
    const url = new URL(request.url);
    const date = url.searchParams.get('date');

    if (!date) {
      throw new ApiError(400, 'date query param required');
    }

    await prisma.providerAbsence.deleteMany({ where: { providerId, date } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
