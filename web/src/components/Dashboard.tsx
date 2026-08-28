'use client';

import { useCallback, useEffect, useState } from 'react';

import { ReportView } from '@/components/ReportView';
import { RecommendPanel } from '@/components/RecommendPanel';
import { JitPanel } from '@/components/JitPanel';
import { ReviewPanel } from '@/components/ReviewPanel';
import { Logo } from '@/components/Logo';
import type {
  ActionResponse,
  RecommendReport,
  RecommendResponse,
  SnapshotPayload,
  SnapshotResponse,
} from '@/lib/types';
import { formatClock } from '@/lib/format';

type LoadingAction = 'reload' | 'review' | 'recommend' | null;

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [recommend, setRecommend] = useState<RecommendReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingAction | 'initial'>(null);

  const loadSnapshot = useCallback(async () => {
    const res = await fetch('/api/snapshot');
    const data = (await res.json()) as SnapshotResponse;
    if (data.error && !data.snapshot) setError(data.error);
    setSnapshot(data.snapshot ?? null);
  }, []);

  const loadRecommend = useCallback(async () => {
    const res = await fetch('/api/recommend');
    const data = (await res.json()) as RecommendResponse;
    if (data.ok && data.report) setRecommend(data.report);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading('initial');
    setError(null);
    try {
      await Promise.all([loadSnapshot(), loadRecommend()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [loadSnapshot, loadRecommend]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function runAction(action: 'reload' | 'review' | 'recommend') {
    setLoading(action);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/${action}`, { method: 'POST' });
      const data = (await res.json()) as ActionResponse & RecommendResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? `Request failed (${res.status})`);
      }
      const mergedSnapshot =
        data.snapshot && data.review
          ? { ...data.snapshot, review: data.review }
          : data.snapshot;
      if (mergedSnapshot) {
        setSnapshot(mergedSnapshot);
      } else if (action === 'review' && data.review) {
        setSnapshot((prev) => (prev ? { ...prev, review: data.review } : prev));
      }
      if (data.report) setRecommend(data.report);
      if (action === 'reload') await loadRecommend();
      const seconds = data.durationMs ? ` (${(data.durationMs / 1000).toFixed(1)}s)` : '';
      setStatus(`${data.message}${seconds}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }

  const isBusy = loading !== null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-10 flex flex-col items-center text-center">
        <Logo size={112} className="ring-amber-accent/40 shadow-teal-accent/20" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-teal-accent">
          agent-usage
        </p>
        <p className="mt-2 max-w-md text-sm text-muted">
          Local Claude Code & Codex analytics — by project, with review, recommendations, and JIT
          harnesses.
        </p>
      </div>

      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {snapshot?.report.title ?? 'Daily report'}
          </h1>
          {snapshot && (
            <p className="mt-2 text-sm text-muted">
              Snapshot {snapshot.snapshotDate} · updated {formatClock(snapshot.capturedAt)}
              {snapshot.sync?.message ? ` · ${snapshot.sync.message}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => runAction('reload')}
            className="rounded-lg border border-panel-border bg-panel px-4 py-2 text-sm font-medium text-foreground transition hover:border-teal-accent/40 hover:bg-panel/80 disabled:opacity-50"
          >
            {loading === 'reload' ? 'Reloading…' : 'Reload snapshot'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => runAction('recommend')}
            className="rounded-lg border border-teal-accent/30 bg-teal-accent/10 px-4 py-2 text-sm font-medium text-teal-accent transition hover:border-teal-accent/50 hover:bg-teal-accent/20 disabled:opacity-50"
          >
            {loading === 'recommend' ? 'Analyzing…' : 'Get recommendations'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => runAction('review')}
            className="rounded-lg bg-amber-accent px-4 py-2 text-sm font-medium text-background transition hover:bg-amber-accent/90 disabled:opacity-50"
          >
            {loading === 'review' ? 'Generating…' : 'Generate review'}
          </button>
        </div>
      </header>

      {loading === 'initial' && (
        <p className="mb-6 text-sm text-muted">Loading report…</p>
      )}

      {status && (
        <div className="mb-6 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {status}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {snapshot ? (
        <div className="space-y-8">
          <ReportView report={snapshot.report} />
          <RecommendPanel report={recommend} loading={loading === 'recommend'} />
          <JitPanel />
          <ReviewPanel review={snapshot.review} />
        </div>
      ) : !loading && !error ? (
        <div className="rounded-xl border border-dashed border-panel-border bg-panel/40 p-10 text-center text-muted">
          No snapshot yet. Click <strong className="text-foreground">Reload snapshot</strong> to
          sync and capture today&apos;s usage.
        </div>
      ) : null}
    </div>
  );
}
