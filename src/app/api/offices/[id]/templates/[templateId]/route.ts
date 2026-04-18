import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import { TemplateUpdateInputSchema } from '@/lib/contracts/api-schemas';

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
      throw new ApiError(404, 'Template not found');
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
    return handleApiError(error);
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

    const parsed = TemplateUpdateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    // If setting active, deactivate all other templates for this office+day first
    if (data.isActive === true) {
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
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
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
    return handleApiError(error);
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
    return handleApiError(error);
  }
}
