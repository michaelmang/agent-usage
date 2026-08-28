import { NextResponse } from 'next/server';

import { getJitHarness } from '@/lib/agent-usage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const data = await getJitHarness(id);
    return NextResponse.json({
      ok: true,
      record: data.record,
      compilation: data.compilation,
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
