import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const MAX_VERSIONS = 20;

/**
 * GET /api/offices/:id/schedule-versions?day=MONDAY&week=A
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const day = url.searchParams.get('day');
    const week = url.searchParams.get('week') ?? 'A';

    const versions = await prisma.scheduleVersion.findMany({
      where: {
        officeId: id,
        ...(day ? { dayOfWeek: day } : {}),
        weekType: week,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(versions.map(v => ({
      id: v.id,
      label: v.label || `Saved ${new Date(v.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      dayOfWeek: v.dayOfWeek,
      weekType: v.weekType,
      createdAt: v.createdAt.toISOString(),
    })));
  } catch (error) {
    console.error('Error fetching schedule versions:', error);
    return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 });
  }
}

/**
 * POST /api/offices/:id/schedule-versions
 * Create a new version snapshot (auto-prune to MAX_VERSIONS)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { dayOfWeek, weekType = 'A', slots, productionSummary, label } = body;

    if (!dayOfWeek) {
      return NextResponse.json({ error: 'dayOfWeek is required' }, { status: 400 });
    }

    // Create the new version
    const version = await prisma.scheduleVersion.create({
      data: {
        officeId: id,
        dayOfWeek,
        weekType,
        slotsJson: JSON.stringify(slots ?? []),
        summaryJson: JSON.stringify(productionSummary ?? []),
        label: label ?? '',
      },
    });

    // Auto-prune: keep only the most recent MAX_VERSIONS per office+day+week
    const allVersions = await prisma.scheduleVersion.findMany({
      where: { officeId: id, dayOfWeek, weekType },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (allVersions.length > MAX_VERSIONS) {
      const toDelete = allVersions.slice(MAX_VERSIONS).map(v => v.id);
      await prisma.scheduleVersion.deleteMany({ where: { id: { in: toDelete } } });
    }

    return NextResponse.json({
      id: version.id,
      label: version.label || `Saved ${new Date(version.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      dayOfWeek: version.dayOfWeek,
      weekType: version.weekType,
      createdAt: version.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating schedule version:', error);
    return NextResponse.json({ error: 'Failed to create version' }, { status: 500 });
  }
}
