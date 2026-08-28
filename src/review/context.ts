import type Database from "better-sqlite3";
import { formatReportText } from "../report/format.js";
import { buildReport, rangeToday, rangeWeek } from "../report/queries.js";
import { displayModelEffort, localDateFromIso, pickCommitSubject } from "../util/format.js";
import { consolidateCommitMilestones, listMilestones } from "../ingest/milestones.js";
import type { ReviewCommit, ReviewContext } from "./types.js";

export function buildReviewContext(
  db: Database.Database,
  date: string,
  timezone?: string,
): ReviewContext {
  const report = buildReport(`Agent Usage — ${date}`, date, date);
  const week = buildReport("Week context", rangeWeek(timezone).from, rangeWeek(timezone).to);

  const rawCommits = listMilestones(db, {
    kind: "git_commit",
    limit: 40,
  }) as Array<Record<string, unknown>>;

  const commits: ReviewCommit[] = consolidateCommitMilestones(rawCommits as never)
    .filter((row) => localDateFromIso(String(row.occurredAt), timezone) === date)
    .map((row) => ({
      project: String(row.projectName ?? ""),
      sha: row.gitSha ? String(row.gitSha).slice(0, 7) : "",
      subject: pickCommitSubject(row.gitSubject),
      model: row.model ? displayModelEffort(String(row.model), row.effort) : "",
      effort: String(row.effort ?? ""),
      cost: Number(row.apiEquivalentCost) || 0,
      provider: String(row.provider),
    }));

  return {
    date,
    usageText: formatReportText(report),
    todayTotal: report.totals.apiEquivalentCost,
    weekTotal: week.totals.apiEquivalentCost,
    commits,
  };
}

export function formatReviewUserMessage(ctx: ReviewContext): string {
  const commitLines =
    ctx.commits.length === 0
      ? "No git commits recorded today."
      : ctx.commits
          .map(
            (c) =>
              `- [${c.sha || "—"}] ${c.project} · ${c.model || c.provider} · $${c.cost.toFixed(2)} — ${c.subject || "(no message)"}`,
          )
          .join("\n");

  return [
    `Date: ${ctx.date}`,
    `Today API-equivalent total: $${ctx.todayTotal.toFixed(2)}`,
    `Week-to-date API-equivalent: $${ctx.weekTotal.toFixed(2)}`,
    "",
    "=== Usage breakdown ===",
    ctx.usageText,
    "",
    "=== Commits today (with model/effort and attributed cost since previous commit) ===",
    commitLines,
  ].join("\n");
}
