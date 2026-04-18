import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';
import { BUILT_IN_SEQUENCES, serializeSteps } from '@/lib/treatment-sequences';
import { ApiError, handleApiError } from '@/lib/api-error';
import { SequenceCreateSchema } from '@/lib/contracts/api-schemas';

// Seed built-in sequences if none exist
async function ensureBuiltIns() {
  const existing = await db.treatmentSequence.count({ where: { isBuiltIn: true } });
  if (existing === 0) {
    for (const seq of BUILT_IN_SEQUENCES) {
      await db.treatmentSequence.create({
        data: {
          id: seq.id,
          name: seq.name,
          description: seq.description,
          isBuiltIn: true,
          stepsJson: serializeSteps(seq.steps),
        },
      });
    }
  }
}

export async function GET() {
  try {
    await ensureBuiltIns();
    const sequences = await db.treatmentSequence.findMany({
      orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json(sequences);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = SequenceCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'Invalid request', parsed.error.flatten());
    }
    const { name, description, stepsJson } = parsed.data;

    const sequence = await db.treatmentSequence.create({
      data: {
        name,
        description: description ?? '',
        isBuiltIn: false,
        stepsJson,
      },
    });

    return NextResponse.json(sequence, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
