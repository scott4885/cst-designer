import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sequence = await db.treatmentSequence.findUnique({ where: { id } });
    if (!sequence) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(sequence);
  } catch (err) {
    console.error('GET /api/sequences/[id]', err);
    return NextResponse.json({ error: 'Failed to fetch sequence' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const seq = await db.treatmentSequence.findUnique({ where: { id } });
    if (!seq) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (seq.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot edit built-in sequences' }, { status: 403 });
    }

    const body = await req.json();
    const updated = await db.treatmentSequence.update({
      where: { id },
      data: {
        name: body.name ?? seq.name,
        description: body.description ?? seq.description,
        stepsJson: body.stepsJson ?? seq.stepsJson,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH /api/sequences/[id]', err);
    return NextResponse.json({ error: 'Failed to update sequence' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const seq = await db.treatmentSequence.findUnique({ where: { id } });
    if (!seq) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (seq.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in sequences' }, { status: 403 });
    }
    await db.treatmentSequence.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/sequences/[id]', err);
    return NextResponse.json({ error: 'Failed to delete sequence' }, { status: 500 });
  }
}
