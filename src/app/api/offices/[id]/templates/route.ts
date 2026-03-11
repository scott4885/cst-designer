import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/offices/:id/templates?day=MONDAY
 * List templates for an office, optionally filtered by day
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const day = url.searchParams.get('day');
    const week = url.searchParams.get('week'); // 'A' or 'B'

    const templates = await prisma.scheduleTemplate.findMany({
      where: {
        officeId: id,
        ...(day ? { dayOfWeek: day } : {}),
        ...(week ? { weekType: week } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(
      templates.map((t) => ({
        id: t.id,
        name: t.name,
        dayOfWeek: t.dayOfWeek,
        weekType: (t as any).weekType ?? 'A',
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        slotsJson: t.slotsJson,
        summaryJson: t.summaryJson,
        warningsJson: t.warningsJson,
      }))
    );
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * POST /api/offices/:id/templates
 * Save a schedule as a named version
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { name, dayOfWeek, weekType, slots, productionSummary, warnings } = body;

    if (!name || !dayOfWeek) {
      return NextResponse.json(
        { error: 'Missing required fields: name, dayOfWeek' },
        { status: 400 }
      );
    }

    const template = await prisma.scheduleTemplate.create({
      data: {
        officeId: id,
        name,
        dayOfWeek,
        weekType: weekType ?? 'A',
        slotsJson: JSON.stringify(slots || []),
        summaryJson: JSON.stringify(productionSummary || []),
        warningsJson: JSON.stringify(warnings || []),
        isActive: false,
      },
    });

    return NextResponse.json({
      id: template.id,
      name: template.name,
      dayOfWeek: template.dayOfWeek,
      weekType: (template as any).weekType ?? 'A',
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
