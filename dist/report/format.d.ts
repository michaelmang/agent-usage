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
    totalTokens: number;
    apiEquivalentCost: number;
}>): string;
