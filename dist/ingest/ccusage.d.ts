export interface ModelBreakdown {
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    cost: number;
}
export interface CcusageSession {
    agent: string;
    period: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    modelBreakdowns: ModelBreakdown[];
    metadata?: {
        lastActivity?: string;
        reasoningOutputTokens?: number;
    };
}
export interface CcusageSessionReport {
    session: CcusageSession[];
}
export declare function resolveCcusageBin(): {
    cmd: string;
    argsPrefix: string[];
};
export declare function runCcusageSessionJson(opts?: {
    offline?: boolean;
    since?: string;
}): Promise<CcusageSessionReport>;
export declare function cachePath(fingerprint: string): string;
export declare function readCachedReport(fingerprint: string): CcusageSessionReport | null;
export declare function writeCachedReport(fingerprint: string, report: CcusageSessionReport): void;
