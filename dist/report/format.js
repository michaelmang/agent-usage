import { displayModel, displayProvider, formatClock, formatMoney, formatTokens, } from "../util/format.js";
function padRight(s, n) {
    if (s.length >= n)
        return s;
    return s + " ".repeat(n - s.length);
}
function padLeft(s, n) {
    if (s.length >= n)
        return s;
    return " ".repeat(n - s.length) + s;
}
export function formatReportText(report) {
    const lines = [];
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
    lines.push(`${padRight("Total tokens", 20)}${padLeft(formatTokens(report.totals.totalTokens), 26)}`);
    lines.push(`${padRight("API-equivalent", 20)}${padLeft(formatMoney(report.totals.apiEquivalentCost), 26)}`);
    return lines.join("\n");
}
function formatProjectBlock(project) {
    const lines = [];
    lines.push(project.name);
    for (const provider of project.providers) {
        lines.push(`  ${displayProvider(provider.provider)}`);
        for (const model of provider.models) {
            lines.push(`    ${padRight(displayModel(model.model), 18)}${padLeft(formatTokens(model.totalTokens) + " tokens", 14)}  ${padLeft(formatMoney(model.apiEquivalentCost), 10)}`);
        }
    }
    lines.push("  ───────────────────────────────────────────");
    lines.push(`  ${padRight("Project total", 32)}${padLeft(formatMoney(project.apiEquivalentCost), 12)}`);
    return lines;
}
export function formatProjectsTable(rows) {
    const lines = [
        `${padRight("PROJECT", 28)}${padLeft("TODAY", 10)}${padLeft("WEEK", 10)}${padLeft("MONTH", 10)}`,
    ];
    for (const r of rows) {
        lines.push(`${padRight(r.name, 28)}${padLeft(formatMoney(r.today), 10)}${padLeft(formatMoney(r.week), 10)}${padLeft(formatMoney(r.month), 10)}`);
    }
    return lines.join("\n");
}
export function formatModelsTable(rows) {
    const lines = [`${padRight("MODEL", 24)}${padLeft("TOKENS", 12)}${padLeft("API-EQUIV", 12)}`];
    for (const r of rows) {
        lines.push(`${padRight(displayModel(r.model), 24)}${padLeft(formatTokens(r.totalTokens), 12)}${padLeft(formatMoney(r.apiEquivalentCost), 12)}`);
    }
    return lines.join("\n");
}
