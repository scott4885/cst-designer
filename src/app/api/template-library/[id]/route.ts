import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';

/**
 * DELETE /api/template-library/:id
 * Delete a custom (non-built-in) template
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const item = await prisma.templateLibraryItem.findUnique({ where: { id } });

    if (!item) {
      throw new ApiError(404, 'Template not found');
    }
    if (item.isBuiltIn) {
      throw new ApiError(403, 'Cannot delete built-in templates');
    }

    await prisma.templateLibraryItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
