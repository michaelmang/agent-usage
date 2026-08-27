export interface ClaudeSessionMeta {
    providerSessionId: string;
    cwd: string | null;
    filePath: string;
    mtimeMs: number;
    size: number;
}
/** Claude project dirs encode absolute paths by replacing `/` and `.` with `-`. */
export declare function encodeClaudeProjectPath(absPath: string): string;
export declare function decodeClaudeProjectDir(encoded: string): string | null;
export declare function clearClaudeProjectDecodeCache(): void;
/**
 * Resolve cwd for a Claude session by scanning early JSONL records.
 * Falls back to decoding the parent project directory name when cwd is stale.
 */
export declare function readClaudeSessionMeta(filePath: string): Promise<ClaudeSessionMeta | null>;
export declare function loadClaudeSessionIndex(known: Map<string, {
    size: number;
    mtimeMs: number;
    cwd: string | null;
}>): Promise<Map<string, ClaudeSessionMeta>>;
