import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (item.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in templates' }, { status: 403 });
    }

    await prisma.templateLibraryItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
