import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';
import { ApiError, handleApiError } from '@/lib/api-error';
import { SequenceUpdateSchema } from '@/lib/contracts/api-schemas';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sequence = await db.treatmentSequence.findUnique({ where: { id } });
    if (!sequence) throw new ApiError(404, 'Not found');
    return NextResponse.json(sequence);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const seq = await db.treatmentSequence.findUnique({ where: { id } });
    if (!seq) throw new ApiError(404, 'Not found');
    if (seq.isBuiltIn) {
      throw new ApiError(403, 'Cannot edit built-in sequences');
    }

    const body = await req.json();

    const parsed = SequenceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const data = parsed.data;

    const updated = await db.treatmentSequence.update({
      where: { id },
      data: {
        name: data.name ?? seq.name,
        description: data.description ?? seq.description,
        stepsJson: data.stepsJson ?? seq.stepsJson,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const seq = await db.treatmentSequence.findUnique({ where: { id } });
    if (!seq) throw new ApiError(404, 'Not found');
    if (seq.isBuiltIn) {
      throw new ApiError(403, 'Cannot delete built-in sequences');
    }
    await db.treatmentSequence.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
