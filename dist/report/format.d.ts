import type { ReportPayload } from "./queries.js";
export declare function formatReportText(report: ReportPayload): string;
export declare function formatProjectsTable(rows: Array<{
    name: string;
    today: number;
    week: number;
    month: number;
}>): string;
export declare function formatModelsTable(rows: Array<{
    model: string;
    effort: string;
    totalTokens: number;
    apiEquivalentCost: number;
}>): string;
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
export declare function formatMilestonesTable(rows: MilestoneRow[]): string;
