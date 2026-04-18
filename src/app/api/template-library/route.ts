import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { seedBuiltInTemplates } from '@/lib/template-library-seed';
import { ApiError, handleApiError } from '@/lib/api-error';
import { TemplateLibraryCreateInputSchema } from '@/lib/contracts/api-schemas';

/**
 * GET /api/template-library
 * Returns all template library items (seed built-ins if none exist)
 */
export async function GET() {
  try {
    // Seed built-in templates if none exist
    const count = await prisma.templateLibraryItem.count();
    if (count === 0) {
      await seedBuiltInTemplates();
    }

    const items = await prisma.templateLibraryItem.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/template-library
 * Create a new custom template library item
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const parsed = TemplateLibraryCreateInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const { name, description, category, slotsJson } = parsed.data;

    const item = await prisma.templateLibraryItem.create({
      data: {
        name,
        description: description ?? '',
        category: category ?? 'GENERAL',
        isBuiltIn: false,
        slotsJson: typeof slotsJson === 'string' ? slotsJson : JSON.stringify(slotsJson ?? {}),
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
