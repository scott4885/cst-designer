import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    version: process.env.npm_package_version ?? 'unknown',
  });
}
