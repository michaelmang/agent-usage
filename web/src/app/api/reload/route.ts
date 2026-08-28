import { NextResponse } from 'next/server';

import { reloadSnapshot } from '@/lib/agent-usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST() {
  try {
    const result = await reloadSnapshot();
    return NextResponse.json({
      ok: true,
      message: result.message,
      snapshot: result.snapshot,
      durationMs: result.durationMs,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
