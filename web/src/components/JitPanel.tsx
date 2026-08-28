'use client';

import { useCallback, useEffect, useState } from 'react';

import type {
  JitDetailResponse,
  JitGenerateResponse,
  JitHarnessRecord,
  JitListResponse,
} from '@/lib/types';

function levelBadge(level: string): string {
  if (level === 'full') return 'bg-amber-950/50 text-amber-200 border-amber-900/40';
  if (level === 'lite') return 'bg-stone-800 text-stone-300 border-stone-700';
  return 'bg-stone-900/50 text-stone-500 border-stone-800';
}

function ControlList({
  title,
  items,
  symbol,
}: {
  title: string;
  items: Array<{ label: string }>;
  symbol: string;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-stone-400">
        {items.map((c) => (
          <li key={c.label}>
            <span className="text-stone-500">{symbol}</span> {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HarnessDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<JitDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/jit/${id}`)
      .then((r) => r.json())
      .then((data: JitDetailResponse) => {
        if (!cancelled) setDetail(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <p className="mt-3 text-sm text-stone-500">Loading harness detail…</p>;
  }
  if (!detail?.ok || !detail.record) {
    return <p className="mt-3 text-sm text-red-300">Could not load harness.</p>;
  }

  const rec = detail.record;
  const plan = detail.compilation?.plan;

  return (
    <div className="mt-4 space-y-4 border-t border-stone-800/80 pt-4">
      {rec.taskRecommendation && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
            Recommendation reasoning
          </p>
          <ul className="mt-2 space-y-1 text-sm text-stone-400">
            {rec.taskRecommendation.reasoning.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-stone-500">
            JIT: {rec.taskRecommendation.jit.level} (
            {rec.taskRecommendation.jit.confidence.toFixed(2)}) —{' '}
            {rec.taskRecommendation.jit.reason}
          </p>
        </div>
      )}

      {rec.generation && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
            Generation thought process
          </p>
          <p className="mt-2 text-sm text-stone-300">{rec.generation.rationale}</p>
          <p className="mt-1 text-xs text-stone-500">
            {rec.generation.model} · {(rec.generation.durationMs / 1000).toFixed(1)}s
            {rec.generation.actualCost != null &&
              ` · $${rec.generation.actualCost.toFixed(4)} actual`}
          </p>
        </div>
      )}

      {plan && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">
            Compiled controls
          </p>
          <ControlList title="Native" items={plan.controls.native} symbol="✓" />
          <ControlList title="Prompt-enforced" items={plan.controls.promptEnforced} symbol="~" />
          <ControlList title="Wrapper-enforced" items={plan.controls.wrapperEnforced} symbol="✓" />
          <ControlList title="Unsupported" items={plan.controls.unsupported} symbol="×" />
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-stone-950/60 p-3 text-xs text-stone-400 whitespace-pre-wrap">
            {plan.generatedInstructions}
          </pre>
        </div>
      )}
    </div>
  );
}

export function JitPanel() {
  const [harnesses, setHarnesses] = useState<JitHarnessRecord[]>([]);
  const [task, setTask] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/jit');
    const data = (await res.json()) as JitListResponse;
    if (data.ok && data.harnesses) setHarnesses(data.harnesses);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    const trimmed = task.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/jit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: trimmed }),
      });
      const data = (await res.json()) as JitGenerateResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? 'JIT generation failed');
      }
      await load();
      if (data.harnessId) setExpandedId(data.harnessId);
      setTask('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="border-b border-stone-800/80 px-5 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-500">
          JIT harness log
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Task-specific execution harnesses with recommendation reasoning and generation notes.
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe a task to generate a JIT harness…"
            className="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600"
            disabled={loading}
          />
          <button
            type="button"
            disabled={loading || !task.trim()}
            onClick={generate}
            className="rounded-lg bg-stone-700 px-4 py-2 text-sm font-medium text-stone-100 hover:bg-stone-600 disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate JIT'}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-300">{error}</p>
        )}

        {harnesses.length === 0 ? (
          <p className="mt-6 text-sm text-stone-500">No JIT harnesses yet.</p>
        ) : (
          <ul className="mt-6 divide-y divide-stone-800/80">
            {harnesses.map((h) => (
              <li key={h.id} className="py-4">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-stone-500">{h.id}</span>
                    <span
                      className={`rounded border px-2 py-0.5 text-xs ${levelBadge(h.jitLevel)}`}
                    >
                      {h.jitLevel}
                    </span>
                    <span className="text-xs text-stone-500">
                      {h.spec.runtime.agent}/{h.spec.runtime.model}
                      {h.spec.runtime.effort ? `/${h.spec.runtime.effort}` : ''}
                    </span>
                    <span className="text-xs text-stone-600">{h.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-stone-300">{h.spec.task.text}</p>
                  {h.generation?.rationale && expandedId !== h.id && (
                    <p className="mt-1 text-xs text-stone-500 line-clamp-2">
                      {h.generation.rationale}
                    </p>
                  )}
                </button>
                {expandedId === h.id && <HarnessDetail id={h.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
