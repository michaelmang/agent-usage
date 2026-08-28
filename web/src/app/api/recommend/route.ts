import { NextResponse } from 'next/server';

import { fetchRecommendReport } from '@/lib/agent-usage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { report, durationMs } = await fetchRecommendReport({ sync: false });
    return NextResponse.json({ ok: true, report, durationMs });
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

export async function POST() {
  try {
    const { report, durationMs } = await fetchRecommendReport({ sync: true });
    return NextResponse.json({
      ok: true,
      message: 'Recommendations updated',
      report,
      durationMs,
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
