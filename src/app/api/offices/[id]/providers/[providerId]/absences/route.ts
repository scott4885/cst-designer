import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
    console.error('Error fetching absences:', error);
    return NextResponse.json({ error: 'Failed to fetch absences' }, { status: 500 });
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
    const { date, reason } = await request.json();

    if (!date) {
      return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 });
    }

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
    console.error('Error creating absence:', error);
    return NextResponse.json({ error: 'Failed to create absence' }, { status: 500 });
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
      return NextResponse.json({ error: 'date query param required' }, { status: 400 });
    }

    await prisma.providerAbsence.deleteMany({ where: { providerId, date } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting absence:', error);
    return NextResponse.json({ error: 'Failed to delete absence' }, { status: 500 });
  }
}
