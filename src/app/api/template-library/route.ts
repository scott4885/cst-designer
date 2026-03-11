import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { seedBuiltInTemplates } from '@/lib/template-library-seed';

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
    console.error('Error fetching template library:', error);
    return NextResponse.json({ error: 'Failed to fetch template library' }, { status: 500 });
  }
}

/**
 * POST /api/template-library
 * Create a new custom template library item
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, category, slotsJson } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

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
    console.error('Error creating template library item:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
