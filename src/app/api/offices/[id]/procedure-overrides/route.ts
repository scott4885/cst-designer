import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import {
  ProcedureOverrideCreateSchema,
  ProcedureOverrideUpdateSchema,
} from '@/lib/contracts/api-schemas';

/**
 * Sprint 3 — ProcedureOverride CRUD (PRD-V4 FR-6).
 *
 * One row per `(officeId, blockTypeId)` — the unique composite key. The
 * x-segment fields (asstPreMin / doctorMin / asstPostMin) are nullable:
 * null/undefined means "no override for this segment — inherit the base
 * BlockType value". The coordinator merges overrides once per generation
 * in `mergeProcedureOverrides()` at the top of `generateSchedule()`, so
 * there is no per-block DB read on the hot path.
 *
 * TODO(auth-P5): PRD-V4 §NFR-Security requires per-office authorisation on
 * every `/api/offices/[id]/*` route. Before production cutover, install the
 * session middleware and verify `session.user` has access to `params.id`.
 * The existing `blockType.officeId !== id` check guards ownership of the
 * target row but does NOT authenticate the caller. Owner: API lead.
 * See .cst-rebuild-v3/logs/code-review-report.md P0-3.
 */

function serialize(row: {
  id: string;
  officeId: string;
  blockTypeId: string;
  asstPreMin: number | null;
  doctorMin: number | null;
  asstPostMin: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    officeId: row.officeId,
    blockTypeId: row.blockTypeId,
    asstPreMin: row.asstPreMin,
    doctorMin: row.doctorMin,
    asstPostMin: row.asstPostMin,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * GET /api/offices/:id/procedure-overrides
 * List every override for this office.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rows = await prisma.procedureOverride.findMany({
      where: { officeId: id },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(rows.map(serialize));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/offices/:id/procedure-overrides
 * Upsert an override for `(officeId, blockTypeId)`. If a row already exists
 * it is updated — keeps the UI idempotent and avoids uniqueness errors when
 * the same row is submitted twice.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = ProcedureOverrideCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }

    const { blockTypeId, asstPreMin, doctorMin, asstPostMin } = parsed.data;

    // Guard: block type must belong to this office
    const blockType = await prisma.blockType.findUnique({
      where: { id: blockTypeId },
      select: { officeId: true },
    });
    if (!blockType || blockType.officeId !== id) {
      throw new ApiError(404, 'BlockType not found in this office');
    }

    const row = await prisma.procedureOverride.upsert({
      where: { unique_office_block_override: { officeId: id, blockTypeId } },
      update: {
        asstPreMin: asstPreMin ?? null,
        doctorMin: doctorMin ?? null,
        asstPostMin: asstPostMin ?? null,
      },
      create: {
        officeId: id,
        blockTypeId,
        asstPreMin: asstPreMin ?? null,
        doctorMin: doctorMin ?? null,
        asstPostMin: asstPostMin ?? null,
      },
    });

    return NextResponse.json(serialize(row), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/offices/:id/procedure-overrides?blockTypeId=...
 * Update existing override fields (nullable — null means clear override).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const blockTypeId = url.searchParams.get('blockTypeId');
    if (!blockTypeId) {
      throw new ApiError(400, 'blockTypeId query parameter is required');
    }

    const body = await request.json();
    const parsed = ProcedureOverrideUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    const existing = await prisma.procedureOverride.findUnique({
      where: { unique_office_block_override: { officeId: id, blockTypeId } },
    });
    if (!existing) {
      throw new ApiError(404, 'Override not found');
    }

    const updated = await prisma.procedureOverride.update({
      where: { unique_office_block_override: { officeId: id, blockTypeId } },
      data: {
        ...(data.asstPreMin !== undefined && { asstPreMin: data.asstPreMin }),
        ...(data.doctorMin !== undefined && { doctorMin: data.doctorMin }),
        ...(data.asstPostMin !== undefined && { asstPostMin: data.asstPostMin }),
      },
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/offices/:id/procedure-overrides?blockTypeId=...
 * Remove an override — block type will fall back to its base x-segment.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const blockTypeId = url.searchParams.get('blockTypeId');
    if (!blockTypeId) {
      throw new ApiError(400, 'blockTypeId query parameter is required');
    }

    // Swallow P2025 (not found) — DELETE is idempotent
    try {
      await prisma.procedureOverride.delete({
        where: { unique_office_block_override: { officeId: id, blockTypeId } },
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        // no-op — already deleted
      } else {
        throw err;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
