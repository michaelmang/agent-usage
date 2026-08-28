import { formatMoney } from "../util/format.js";
import type { RecommendReport } from "./types.js";

function padRight(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

const SEVERITY_LABEL: Record<string, string> = {
  action: "ACTION",
  watch: "WATCH",
  info: "INFO",
};

export function formatRecommendText(report: RecommendReport): string {
  const lines: string[] = [];
  lines.push(report.title);
  lines.push(
    `${report.range.from} → ${report.range.to} · ${report.commitCount} commits · ${formatMoney(report.totalCost)} total`,
  );
  if (report.costPerCommit != null) {
    lines.push(`Avg $/commit (period): ${formatMoney(report.costPerCommit)}`);
  }
  lines.push("");

  if (report.projects.length > 0) {
    lines.push("LEADERBOARD (commits per $100 spend)");
    for (const p of report.projects) {
      const ratio =
        p.commitsPer100Dollars != null ? p.commitsPer100Dollars.toFixed(2) : "—";
      const cpc = p.costPerCommit != null ? formatMoney(p.costPerCommit) : "—";
      lines.push(
        `  ${padRight(p.project, 24)} ${String(p.commits).padStart(3)} commits  ${formatMoney(p.cost).padStart(8)}  ${cpc}/commit  ${ratio}/$100`,
      );
    }
    lines.push("");
  }

  if (report.recommendations.length === 0) {
    lines.push("No heuristic flags for this period. Run `agent-usage review` for LLM narrative.");
    return lines.join("\n");
  }

  lines.push("RECOMMENDATIONS");
  for (const r of report.recommendations) {
    const label = SEVERITY_LABEL[r.severity] ?? r.severity.toUpperCase();
    const prefix = r.project ? `${r.project}: ` : "";
    lines.push(`  [${label}] ${prefix}${r.title}`);
    lines.push(`    ${r.detail}`);
  }

  return lines.join("\n");
}
