import type Database from "better-sqlite3";
import { loadConfig } from "../config.js";
import { consolidateCommitMilestones, listMilestones } from "../ingest/milestones.js";
import { buildReport, findProjectId, type ProjectRollup } from "../report/queries.js";
import { displayModel, localDateFromIso, nowIso } from "../util/format.js";
import type {
  ProjectEfficiency,
  Recommendation,
  RecommendReport,
} from "./types.js";

export interface CommitRow {
  project: string;
  cost: number;
  model: string;
  effort: string;
  provider: string;
  subject: string;
}

function isOpusModel(model: string): boolean {
  return /opus/i.test(model);
}

function commitsInRange(
  db: Database.Database,
  from: string,
  to: string,
  projectId?: number,
  timezone?: string,
): CommitRow[] {
  const raw = listMilestones(db, {
    kind: "git_commit",
    projectId,
    limit: 300,
  }) as Array<Record<string, unknown>>;

  const consolidated = consolidateCommitMilestones(raw as never);
  const out: CommitRow[] = [];

  for (const row of consolidated) {
    const day = localDateFromIso(String(row.occurredAt), timezone);
    if (!day || day < from || day > to) continue;
    const cost = Number(row.apiEquivalentCost) || 0;
    if (cost <= 0 && !row.gitSubject && !row.gitSha) continue;
    out.push({
      project: String(row.projectName ?? "Unassigned"),
      cost,
      model: String(row.model ?? ""),
      effort: String(row.effort ?? ""),
      provider: String(row.provider ?? ""),
      subject: String(row.gitSubject ?? "").slice(0, 120),
    });
  }
  return out;
}

function dominant<T>(items: T[], key: (item: T) => string): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: string | undefined;
  let max = 0;
  for (const [k, n] of counts) {
    if (n > max) {
      max = n;
      best = k;
    }
  }
  return best;
}

function buildProjectEfficiency(
  project: ProjectRollup,
  commits: CommitRow[],
): ProjectEfficiency {
  const projectCommits = commits.filter((c) => c.project === project.name);
  const cost = project.apiEquivalentCost;
  const commitCount = projectCommits.length;
  const costPerCommit = commitCount > 0 ? cost / commitCount : null;
  const commitsPer100Dollars = cost > 0 ? (commitCount / cost) * 100 : null;

  let opusCost = 0;
  for (const provider of project.providers) {
    for (const model of provider.models) {
      if (isOpusModel(model.model)) opusCost += model.apiEquivalentCost;
    }
  }

  const highEffortCommits = projectCommits.filter((c) => c.effort === "high").length;

  return {
    project: project.name,
    commits: commitCount,
    cost,
    costPerCommit,
    commitsPer100Dollars,
    dominantProvider: dominant(projectCommits, (c) => c.provider),
    dominantModel: dominant(projectCommits, (c) => c.model),
    dominantEffort: dominant(projectCommits, (c) => c.effort),
    opusShare: cost > 0 ? opusCost / cost : undefined,
    highEffortCommitShare:
      commitCount > 0 ? highEffortCommits / commitCount : undefined,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function analyzeProject(
  eff: ProjectEfficiency,
  commits: CommitRow[],
  medianCostPerCommit: number | null,
): Recommendation[] {
  const out: Recommendation[] = [];
  const projectCommits = commits.filter((c) => c.project === eff.project);

  if (eff.cost >= 25 && eff.commits === 0) {
    out.push({
      severity: "action",
      category: "waste",
      project: eff.project,
      title: "Spend without shipped commits",
      detail: `${eff.project} shows ${eff.cost.toFixed(0)} API-equivalent in this period but no git commits in milestones. Review whether sessions were exploratory or attribution is missing.`,
    });
  }

  if (eff.opusShare != null && eff.opusShare >= 0.4 && eff.cost >= 50) {
    out.push({
      severity: "watch",
      category: "model",
      project: eff.project,
      title: "Opus-heavy spend",
      detail: `${Math.round(eff.opusShare * 100)}% of ${eff.project} spend is Opus-tier. For routine edits and commits, try Sonnet (high) as default and reserve Opus for hard refactors.`,
    });
  }

  if (
    eff.highEffortCommitShare != null &&
    eff.highEffortCommitShare >= 0.6 &&
    eff.costPerCommit != null &&
    eff.costPerCommit < 3 &&
    eff.commits >= 3
  ) {
    out.push({
      severity: "watch",
      category: "effort",
      project: eff.project,
      title: "High effort on low-cost commits",
      detail: `Most commits on ${eff.project} used high effort but averaged $${eff.costPerCommit.toFixed(2)}/commit. Try medium effort for iteration loops.`,
    });
  }

  if (medianCostPerCommit != null && medianCostPerCommit > 0) {
    const spikes = projectCommits
      .filter((c) => c.cost > medianCostPerCommit * 3 && c.cost >= 15)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 2);
    for (const c of spikes) {
      out.push({
        severity: "watch",
        category: "efficiency",
        project: eff.project,
        title: `Cost spike commit ($${c.cost.toFixed(2)})`,
        detail: `[${displayModel(c.model)}${c.effort ? ` ${c.effort}` : ""}] ${c.subject || "(no subject)"} — compare to period median $${medianCostPerCommit.toFixed(2)}/commit.`,
      });
    }
  }

  const providers = new Set(projectCommits.map((c) => c.provider));
  if (providers.size >= 2 && eff.commits >= 2) {
    const byProvider = new Map<string, { cost: number; n: number }>();
    for (const c of projectCommits) {
      const cur = byProvider.get(c.provider) ?? { cost: 0, n: 0 };
      cur.cost += c.cost;
      cur.n += 1;
      byProvider.set(c.provider, cur);
    }
    const ranked = [...byProvider.entries()]
      .map(([p, v]) => ({ provider: p, costPerCommit: v.cost / v.n, n: v.n }))
      .filter((r) => r.n >= 1)
      .sort((a, b) => a.costPerCommit - b.costPerCommit);
    if (ranked.length >= 2) {
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      if (worst.costPerCommit > best.costPerCommit * 1.5 && worst.n >= 2) {
        out.push({
          severity: "info",
          category: "delegation",
          project: eff.project,
          title: "Agent cost comparison",
          detail: `On ${eff.project}, ${best.provider} averaged $${best.costPerCommit.toFixed(2)}/commit vs ${worst.provider} at $${worst.costPerCommit.toFixed(2)}. Prefer ${best.provider} for similar tasks when quality allows.`,
        });
      }
    }
  }

  if (
    eff.commitsPer100Dollars != null &&
    eff.commits >= 3 &&
    eff.commitsPer100Dollars >= 0.5
  ) {
    const modelHint = eff.dominantModel
      ? `${displayModel(eff.dominantModel)}${eff.dominantEffort ? ` (${eff.dominantEffort})` : ""}`
      : "current mix";
    out.push({
      severity: "info",
      category: "efficiency",
      project: eff.project,
      title: "Strong commits-per-dollar",
      detail: `${eff.commits} commits / $${eff.cost.toFixed(0)} (${eff.commitsPer100Dollars.toFixed(2)} per $100). ${modelHint} is working well here — reuse for similar work.`,
    });
  }

  return out;
}

export function buildRecommendReport(
  db: Database.Database,
  opts: {
    title: string;
    from: string;
    to: string;
    projectId?: number;
    projectName?: string;
  },
): RecommendReport {
  const config = loadConfig();
  const tz = config.timezone;
  const report = buildReport(opts.title, opts.from, opts.to, {
    db,
    projectId: opts.projectId,
  });

  const commits = commitsInRange(db, opts.from, opts.to, opts.projectId, tz);
  const projects = report.projects
    .filter((p) => p.apiEquivalentCost > 0 || commits.some((c) => c.project === p.name))
    .map((p) => buildProjectEfficiency(p, commits));

  projects.sort((a, b) => (b.commitsPer100Dollars ?? 0) - (a.commitsPer100Dollars ?? 0));

  const allCostPerCommit = projects
    .map((p) => p.costPerCommit)
    .filter((v): v is number => v != null && v > 0);
  const medianCpc = median(allCostPerCommit);

  const recommendations: Recommendation[] = [];
  for (const eff of projects) {
    const projectCommits = commits.filter((c) => c.project === eff.project);
    const projectMedian = median(
      projectCommits.map((c) => c.cost).filter((c) => c > 0),
    );
    recommendations.push(
      ...analyzeProject(eff, commits, projectMedian ?? medianCpc),
    );
  }

  const severityOrder: Record<string, number> = { action: 0, watch: 1, info: 2 };
  recommendations.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  const totalCost = report.totals.apiEquivalentCost;
  const commitCount = commits.length;

  return {
    title: opts.title,
    range: { from: opts.from, to: opts.to },
    generatedAt: nowIso(),
    totalCost,
    commitCount,
    costPerCommit: commitCount > 0 ? totalCost / commitCount : null,
    projects,
    recommendations,
  };
}

export function buildRecommendReportForProject(
  db: Database.Database,
  query: string,
  from: string,
  to: string,
  title: string,
): RecommendReport | null {
  const projectId = findProjectId(db, query);
  if (projectId == null) return null;
  const row = db
    .prepare(`SELECT name FROM projects WHERE id = ?`)
    .get(projectId) as { name: string };
  return buildRecommendReport(db, {
    title,
    from,
    to,
    projectId,
    projectName: row.name,
  });
}
