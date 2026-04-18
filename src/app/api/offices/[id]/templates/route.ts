import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import { TemplateCreateInputSchema } from '@/lib/contracts/api-schemas';

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
        weekType: t.weekType ?? 'A',
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        slotsJson: t.slotsJson,
        summaryJson: t.summaryJson,
        warningsJson: t.warningsJson,
      }))
    );
  } catch (error) {
    return handleApiError(error);
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

    const parsed = TemplateCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const { name, dayOfWeek, weekType, slots, productionSummary, warnings } = parsed.data;

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
      weekType: template.weekType ?? 'A',
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
