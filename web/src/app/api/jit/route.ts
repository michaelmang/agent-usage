import { NextResponse } from 'next/server';

import { generateJitHarness, listJitHarnesses } from '@/lib/agent-usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET() {
  try {
    const harnesses = await listJitHarnesses();
    return NextResponse.json({ ok: true, harnesses });
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { task?: string };
    const task = body.task?.trim();
    if (!task) {
      return NextResponse.json({ ok: false, message: 'task is required' }, { status: 400 });
    }
    const result = await generateJitHarness(task);
    return NextResponse.json({
      ok: true,
      harnessId: result.harnessId,
      record: result.record,
      plan: result.plan,
      durationMs: result.durationMs,
      message: `JIT harness ${result.harnessId} generated`,
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
