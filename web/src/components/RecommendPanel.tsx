import type { RecommendReport, RecommendationSeverity } from '@/lib/types';
import { formatMoney } from '@/lib/format';

const SEVERITY_STYLES: Record<
  RecommendationSeverity,
  { badge: string; border: string }
> = {
  action: {
    badge: 'bg-red-950/60 text-red-300 border-red-900/50',
    border: 'border-red-900/40',
  },
  watch: {
    badge: 'bg-amber-950/50 text-amber-200 border-amber-900/40',
    border: 'border-amber-900/30',
  },
  info: {
    badge: 'bg-stone-800/80 text-stone-300 border-stone-700',
    border: 'border-stone-800',
  },
};

export function RecommendPanel({
  report,
  loading,
}: {
  report: RecommendReport | null;
  loading?: boolean;
}) {
  if (loading && !report) {
    return (
      <section className="rounded-xl border border-stone-800 bg-stone-900/20 p-8">
        <p className="text-sm text-stone-500">Loading recommendations…</p>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="rounded-xl border border-dashed border-stone-800 bg-stone-900/20 p-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-500">
          Recommendations
        </h2>
        <p className="mt-3 text-sm text-stone-500">
          Click <strong className="text-stone-400">Get recommendations</strong> for heuristic
          model/effort tips (no API cost). Uses today&apos;s usage and commit milestones.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="border-b border-stone-800/80 px-5 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-stone-500">
          Recommendations
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          {report.range.from}
          {report.range.to !== report.range.from ? ` → ${report.range.to}` : ''} ·{' '}
          {report.commitCount} commits · {formatMoney(report.totalCost)}
          {report.costPerCommit != null && (
            <> · {formatMoney(report.costPerCommit)}/commit avg</>
          )}
          <span className="text-stone-600"> · heuristic, no LLM</span>
        </p>
      </div>

      {report.projects.length > 0 && (
        <div className="border-b border-stone-800/80 px-5 py-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-stone-500">
            Leaderboard (commits per $100)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="pb-2 pr-4">Project</th>
                  <th className="pb-2 pr-4 text-right">Commits</th>
                  <th className="pb-2 pr-4 text-right">Spend</th>
                  <th className="pb-2 pr-4 text-right">$/commit</th>
                  <th className="pb-2 text-right">per $100</th>
                </tr>
              </thead>
              <tbody className="text-stone-300">
                {report.projects.map((p) => (
                  <tr key={p.project} className="border-t border-stone-800/50">
                    <td className="py-2 pr-4 font-medium text-stone-200">{p.project}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{p.commits}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-amber-400/90">
                      {formatMoney(p.cost)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-stone-400">
                      {p.costPerCommit != null ? formatMoney(p.costPerCommit) : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums text-stone-400">
                      {p.commitsPer100Dollars != null
                        ? p.commitsPer100Dollars.toFixed(2)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="px-5 py-4">
        {report.recommendations.length === 0 ? (
          <p className="text-sm text-stone-500">
            No heuristic flags for today. Use <strong className="text-stone-400">Generate review</strong>{' '}
            for LLM narrative feedback.
          </p>
        ) : (
          <ul className="space-y-3">
            {report.recommendations.map((r, i) => {
              const styles = SEVERITY_STYLES[r.severity];
              return (
                <li
                  key={`${r.severity}-${r.title}-${i}`}
                  className={`rounded-lg border px-4 py-3 ${styles.border} bg-stone-950/30`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${styles.badge}`}
                    >
                      {r.severity}
                    </span>
                    {r.project && (
                      <span className="text-xs text-stone-500">{r.project}</span>
                    )}
                    <span className="text-sm font-medium text-stone-200">{r.title}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-400">{r.detail}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
