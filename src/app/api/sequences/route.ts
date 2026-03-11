import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { BUILT_IN_SEQUENCES, serializeSteps } from '@/lib/treatment-sequences';

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
    console.error('GET /api/sequences', err);
    return NextResponse.json({ error: 'Failed to fetch sequences' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, stepsJson } = body as {
      name: string;
      description?: string;
      stepsJson: string;
    };

    if (!name || !stepsJson) {
      return NextResponse.json({ error: 'name and stepsJson are required' }, { status: 400 });
    }

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
    console.error('POST /api/sequences', err);
    return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
  }
}
