import type { ReportPayload } from '@/lib/types';
import {
  displayModel,
  displayProvider,
  formatMoney,
  formatTokens,
} from '@/lib/format';

export function ReportView({ report }: { report: ReportPayload }) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-panel-border bg-panel/60 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            API-equivalent
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-teal-accent">
            {formatMoney(report.totals.apiEquivalentCost)}
          </p>
        </div>
        <div className="rounded-xl border border-panel-border bg-panel/60 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Total tokens
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            {formatTokens(report.totals.totalTokens)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {report.projects.map((project) => (
          <article
            key={project.name}
            className="rounded-xl border border-panel-border bg-panel/40 overflow-hidden"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-panel-border px-5 py-4">
              <h2 className="text-lg font-medium text-foreground">{project.name}</h2>
              <span className="text-lg font-semibold tabular-nums text-amber-accent">
                {formatMoney(project.apiEquivalentCost)}
              </span>
            </div>
            <div className="px-5 py-3">
              {project.providers.map((provider) => (
                <div key={provider.provider} className="mb-4 last:mb-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                    {displayProvider(provider.provider)}
                  </p>
                  <ul className="space-y-1">
                    {provider.models.map((model) => (
                      <li
                        key={`${model.model}-${model.effort ?? ''}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="text-slate-300">
                          {displayModel(model.model, model.effort)}
                        </span>
                        <span className="tabular-nums text-muted">
                          {formatTokens(model.totalTokens)} tokens
                          <span className="ml-3 text-slate-200">
                            {formatMoney(model.apiEquivalentCost)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
