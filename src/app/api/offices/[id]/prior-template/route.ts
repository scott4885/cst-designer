/**
 * Sprint 6 Epic P — Prior-template upload + list API.
 *
 * POST /api/offices/:id/prior-template
 *   Body (JSON): { format: "CSV"|"XLSX"|"DOCX"|"FREETEXT", filename: string,
 *                  content: string (CSV/DOCX/FREETEXT text OR base64 XLSX),
 *                  rawText?: string (for FREETEXT fallback) }
 *   Returns: { priorTemplate, parse: { blockCount, matchedCount, failingRows } }
 *   Persists one PriorTemplate row. Existing rows for the office are marked
 *   as superseded (their `supersededBy` is set to the new row's id).
 *
 * GET /api/offices/:id/prior-template
 *   Returns: { priorTemplate: PriorTemplate | null }
 *
 * Note: multipart/form-data would be more standard, but Next.js 16 App
 * Router runs on a Node runtime where multipart parsing requires either
 * the web FormData API (works but file must fit in memory) or a third-party
 * parser. We use JSON with base64 for XLSX — keeps the route self-contained
 * and matches how the front-end serialises the upload.
 *
 * See SPRINT-6-PLAN §4.1 + §4.2.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getOfficeById } from '@/lib/data-access';
import { ApiError, handleApiError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import {
  parsePriorTemplate,
} from '@/lib/engine/advisory/prior-template-parser';
import type {
  PriorTemplateSourceFormat,
  PriorTemplate,
} from '@/lib/engine/advisory/types';

const MAX_CONTENT_BYTES = 2 * 1024 * 1024; // 2 MB per spec §3.1

interface UploadBody {
  format?: PriorTemplateSourceFormat;
  filename?: string;
  content?: string;                        // CSV text OR base64 XLSX OR DOCX text
  rawText?: string;
}

function rowToApi(row: {
  id: string;
  officeId: string;
  uploadedAt: Date;
  filename: string;
  fileHash: string;
  sourceFormat: string;
  parseStatus: string;
  blockCount: number;
  matchedCount: number;
  blocksJson: string;
  rawText: string | null;
  supersededBy: string | null;
}): PriorTemplate {
  return {
    id: row.id,
    officeId: row.officeId,
    uploadedAt: row.uploadedAt.toISOString(),
    filename: row.filename,
    fileHash: row.fileHash,
    sourceFormat: row.sourceFormat as PriorTemplateSourceFormat,
    parseStatus: row.parseStatus as PriorTemplate['parseStatus'],
    blockCount: row.blockCount,
    matchedCount: row.matchedCount,
    blocks: JSON.parse(row.blocksJson),
    rawText: row.rawText,
    supersededBy: row.supersededBy,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as UploadBody;

    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    const format = body.format;
    const filename = (body.filename ?? 'prior-template').slice(0, 200);
    const content = body.content ?? '';

    if (!format) throw new ApiError(400, 'format is required');
    if (!['CSV', 'XLSX', 'DOCX', 'FREETEXT'].includes(format)) {
      throw new ApiError(400, `Unsupported format: ${format}`);
    }
    if (!content && format !== 'FREETEXT') {
      throw new ApiError(400, 'content is required');
    }

    // Size guard — rough byte estimate
    const byteLen = Buffer.byteLength(content, 'utf-8');
    if (byteLen > MAX_CONTENT_BYTES * 1.4) {
      throw new ApiError(413, `File too large — max ${MAX_CONTENT_BYTES} bytes`);
    }

    // Prepare payload + hash
    let payload: string | Buffer;
    let hashInput: string;
    if (format === 'XLSX') {
      try {
        payload = Buffer.from(content, 'base64');
      } catch {
        throw new ApiError(400, 'XLSX content must be base64-encoded');
      }
      if (payload.length > MAX_CONTENT_BYTES) {
        throw new ApiError(413, `XLSX too large — max ${MAX_CONTENT_BYTES} bytes`);
      }
      hashInput = payload.toString('base64');
    } else {
      payload = content;
      hashInput = content;
    }
    const fileHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    // Idempotency — if an identical hash already exists for this office and
    // is not superseded, return it rather than inserting a duplicate.
    const existing = await prisma.priorTemplate.findFirst({
      where: { officeId: office.id, fileHash, supersededBy: null },
    });
    if (existing) {
      return NextResponse.json({
        priorTemplate: rowToApi(existing),
        parse: {
          blockCount: existing.blockCount,
          matchedCount: existing.matchedCount,
          parseStatus: existing.parseStatus,
          idempotent: true,
        },
      });
    }

    // Parse
    const result = await parsePriorTemplate(format, payload);

    // Persist — new row, mark older rows as superseded by it.
    const created = await prisma.priorTemplate.create({
      data: {
        officeId: office.id,
        filename,
        fileHash,
        sourceFormat: result.sourceFormat,
        parseStatus: result.parseStatus,
        blockCount: result.blocks.length,
        matchedCount: result.blocks.filter((b) => b.matchedBlockType).length,
        blocksJson: JSON.stringify(result.blocks),
        rawText: result.rawText ?? body.rawText ?? null,
      },
    });

    await prisma.priorTemplate.updateMany({
      where: {
        officeId: office.id,
        id: { not: created.id },
        supersededBy: null,
      },
      data: { supersededBy: created.id },
    });

    return NextResponse.json({
      priorTemplate: rowToApi(created),
      parse: {
        blockCount: created.blockCount,
        matchedCount: created.matchedCount,
        parseStatus: created.parseStatus,
        failingRows: result.failingRows,
        errorMessage: result.errorMessage,
        idempotent: false,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const office = await getOfficeById(id);
    if (!office) throw new ApiError(404, 'Office not found');

    const row = await prisma.priorTemplate.findFirst({
      where: { officeId: office.id, supersededBy: null },
      orderBy: { uploadedAt: 'desc' },
    });
    if (!row) return NextResponse.json({ priorTemplate: null });
    return NextResponse.json({ priorTemplate: rowToApi(row) });
  } catch (error) {
    return handleApiError(error);
  }
}
