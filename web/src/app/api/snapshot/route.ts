import { NextResponse } from 'next/server';

import { readLatestSnapshot } from '@/lib/agent-usage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = readLatestSnapshot();
    if (!result) {
      return NextResponse.json({
        snapshot: null,
        error: 'No snapshot found. Run agent-usage snapshot or click Reload.',
      });
    }
    return NextResponse.json({
      snapshot: result.snapshot,
      snapshotPath: result.path,
    });
  } catch (err) {
    return NextResponse.json(
      {
        snapshot: null,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
