import type Database from "better-sqlite3";
export interface UsageSlice {
    projectId: number | null;
    projectName: string;
    projectPath: string;
    client: string | null;
    contractValue: number | null;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreateTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    apiEquivalentCost: number;
}
export interface ProjectRollup {
    projectId: number | null;
    name: string;
    path: string;
    client: string | null;
    contractValue: number | null;
    totalTokens: number;
    apiEquivalentCost: number;
    providers: ProviderRollup[];
}
export interface ProviderRollup {
    provider: string;
    totalTokens: number;
    apiEquivalentCost: number;
    models: ModelRollup[];
}
export interface ModelRollup {
    model: string;
    totalTokens: number;
    apiEquivalentCost: number;
}
export interface ReportPayload {
    title: string;
    range: {
        from: string;
        to: string;
    };
    updatedAt: string;
    projects: ProjectRollup[];
    totals: {
        totalTokens: number;
        apiEquivalentCost: number;
    };
}
export declare function buildReport(title: string, from: string, to: string, opts?: {
    projectId?: number;
    db?: Database.Database;
}): ReportPayload;
export declare function rangeToday(tz?: string): {
    from: string;
    to: string;
};
export declare function rangeYesterday(tz?: string): {
    from: string;
    to: string;
};
export declare function rangeWeek(tz?: string): {
    from: string;
    to: string;
};
export declare function rangeMonth(tz?: string): {
    from: string;
    to: string;
};
export declare function findProjectId(db: Database.Database, query: string): number | undefined;
export declare function listProjectsSummary(db?: Database.Database): Array<{
    name: string;
    path: string;
    today: number;
    week: number;
    month: number;
}>;
export declare function listModelsSummary(from: string, to: string, db?: Database.Database): Array<{
    model: string;
    totalTokens: number;
    apiEquivalentCost: number;
}>;
export declare function lifetimeForProject(projectId: number, db?: Database.Database): {
    totalTokens: number;
    apiEquivalentCost: number;
    providers: ProviderRollup[];
};
