/**
 * Sprint 5 — GET /api/offices/:id/advisory/markdown
 * Returns the latest persisted advisory rendered as Markdown text.
 * Content-Disposition: attachment, filename `{officeSlug}-advisory-YYYY-MM-DD.md`.
 */

import { NextResponse } from 'next/server';
import { getOfficeById } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import { renderAdvisoryMarkdown } from '@/lib/engine/advisory/markdown';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    const latest = await prisma.templateAdvisory.findFirst({
      where: { officeId: office.id },
      orderBy: { generatedAt: 'desc' },
    });
    if (!latest) throw new ApiError(404, 'No advisory generated yet — POST /advisory first');

    const document = JSON.parse(latest.documentJson);
    const score = JSON.parse(latest.scoreJson);
    const reviewPlan = JSON.parse(latest.reviewPlanJson);
    const variants = latest.variantsJson ? JSON.parse(latest.variantsJson) : undefined;

    const md = renderAdvisoryMarkdown(document, score, reviewPlan, variants ?? undefined);
    const date = latest.generatedAt.toISOString().slice(0, 10);
    const filename = `${slugify(office.name)}-advisory-${date}.md`;

    return new NextResponse(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
