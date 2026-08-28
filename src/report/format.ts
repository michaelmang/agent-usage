import {
  displayModelEffort,
  displayProvider,
  formatClock,
  formatMoney,
  formatTokens,
  pickCommitSubject,
  truncateText,
} from "../util/format.js";
import type { ProjectRollup, ReportPayload } from "./queries.js";

function padRight(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  if (s.length >= n) return s;
  return " ".repeat(n - s.length) + s;
}

export function formatReportText(report: ReportPayload): string {
  const lines: string[] = [];
  lines.push(report.title);
  lines.push(`Updated ${formatClock(new Date(report.updatedAt))}`);
  lines.push("");

  if (report.projects.length === 0) {
    lines.push("No usage recorded for this period.");
    return lines.join("\n");
  }

  for (const project of report.projects) {
    lines.push(...formatProjectBlock(project));
    lines.push("");
  }

  lines.push("══════════════════════════════════════════════");
  lines.push(
    `${padRight("Total tokens", 20)}${padLeft(formatTokens(report.totals.totalTokens), 26)}`,
  );
  lines.push(
    `${padRight("API-equivalent", 20)}${padLeft(formatMoney(report.totals.apiEquivalentCost), 26)}`,
  );
  return lines.join("\n");
}

function formatProjectBlock(project: ProjectRollup): string[] {
  const lines: string[] = [];
  lines.push(project.name);
  for (const provider of project.providers) {
    lines.push(`  ${displayProvider(provider.provider)}`);
    for (const model of provider.models) {
      lines.push(
        `    ${padRight(displayModelEffort(model.model, model.effort), 26)}${padLeft(formatTokens(model.totalTokens) + " tokens", 14)}  ${padLeft(formatMoney(model.apiEquivalentCost), 10)}`,
      );
    }
  }
  lines.push("  ───────────────────────────────────────────");
  lines.push(
    `  ${padRight("Project total", 32)}${padLeft(formatMoney(project.apiEquivalentCost), 12)}`,
  );
  return lines;
}

export function formatProjectsTable(
  rows: Array<{ name: string; today: number; week: number; month: number }>,
): string {
  const lines = [
    `${padRight("PROJECT", 28)}${padLeft("TODAY", 10)}${padLeft("WEEK", 10)}${padLeft("MONTH", 10)}`,
  ];
  for (const r of rows) {
    lines.push(
      `${padRight(r.name, 28)}${padLeft(formatMoney(r.today), 10)}${padLeft(formatMoney(r.week), 10)}${padLeft(formatMoney(r.month), 10)}`,
    );
  }
  return lines.join("\n");
}

export function formatModelsTable(
  rows: Array<{ model: string; effort: string; totalTokens: number; apiEquivalentCost: number }>,
): string {
  const lines = [
    `${padRight("MODEL", 30)}${padLeft("TOKENS", 12)}${padLeft("API-EQUIV", 12)}`,
  ];
  for (const r of rows) {
    lines.push(
      `${padRight(displayModelEffort(r.model, r.effort), 30)}${padLeft(formatTokens(r.totalTokens), 12)}${padLeft(formatMoney(r.apiEquivalentCost), 12)}`,
    );
  }
  return lines.join("\n");
}

export interface MilestoneRow {
  occurredAt: string;
  kind: string;
  gitSha?: string | null;
  gitBranch?: string | null;
  gitSubject?: string | null;
  model?: string | null;
  effort?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  apiEquivalentCost?: number | null;
  projectName?: string | null;
  provider: string;
}

export function formatMilestonesTable(rows: MilestoneRow[]): string {
  const subjectWidth = 44;
  const lines = [
    `${padRight("WHEN", 20)}${padRight("PROJECT", 16)}${padRight("SHA", 8)}${padLeft("COST", 9)}  ${padRight("MODEL/EFFORT", 26)}  ${padRight("COMMIT", subjectWidth)}`,
  ];
  for (const row of rows) {
    const when = String(row.occurredAt).slice(0, 19).replace("T", " ");
    const sha = row.gitSha ? String(row.gitSha).slice(0, 7) : "—";
    const model = row.model ? displayModelEffort(String(row.model), row.effort) : "";
    const cost =
      row.apiEquivalentCost != null && row.apiEquivalentCost > 0
        ? formatMoney(Number(row.apiEquivalentCost))
        : "";
    const subject = truncateText(pickCommitSubject(row.gitSubject), subjectWidth);
    lines.push(
      `${padRight(when, 20)}${padRight(truncateText(String(row.projectName ?? ""), 16), 16)}${padRight(sha, 8)}${padLeft(cost, 9)}  ${padRight(truncateText(model, 26), 26)}  ${subject}`,
    );
  }
  return lines.join("\n");
}
