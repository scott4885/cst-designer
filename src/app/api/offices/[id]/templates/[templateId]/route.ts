import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/offices/:id/templates/:templateId
 * Get a single template with full slots data
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { templateId } = await params;

    const template = await prisma.scheduleTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: template.id,
      name: template.name,
      dayOfWeek: template.dayOfWeek,
      isActive: template.isActive,
      slots: JSON.parse(template.slotsJson),
      productionSummary: JSON.parse(template.summaryJson),
      warnings: JSON.parse(template.warningsJson),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

/**
 * PUT /api/offices/:id/templates/:templateId
 * Rename or set as active
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id, templateId } = await params;
    const body = await request.json();

    // If setting active, deactivate all other templates for this office+day first
    if (body.isActive === true) {
      const template = await prisma.scheduleTemplate.findUnique({ where: { id: templateId } });
      if (template) {
        await prisma.scheduleTemplate.updateMany({
          where: { officeId: id, dayOfWeek: template.dayOfWeek },
          data: { isActive: false },
        });
      }
    }

    const updated = await prisma.scheduleTemplate.update({
      where: { id: templateId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      dayOfWeek: updated.dayOfWeek,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

/**
 * DELETE /api/offices/:id/templates/:templateId
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { templateId } = await params;

    await prisma.scheduleTemplate.delete({ where: { id: templateId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
