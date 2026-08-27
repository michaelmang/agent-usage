export declare function resolveAgentPingBin(): string | null;
export declare function notifyUsageSnapshot(opts?: {
    date?: string;
    file?: string;
    quiet?: boolean;
}): {
    ok: boolean;
    message: string;
};
export declare function launchdPathEnv(): string;
export declare function ntfyEnvForLaunchd(): Record<string, string>;
