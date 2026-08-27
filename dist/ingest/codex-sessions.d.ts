export interface CodexSessionMeta {
    /** Matches ccusage period, e.g. 2026/08/12/rollout-... */
    providerSessionId: string;
    threadId: string | null;
    cwd: string | null;
    filePath: string;
    mtimeMs: number;
    size: number;
}
/**
 * Read only the first JSONL record (session_meta) for cwd.
 * First lines can be multi-megabyte due to base_instructions — stream one line.
 */
export declare function readCodexSessionMeta(filePath: string): Promise<CodexSessionMeta | null>;
export declare function loadCodexSessionIndex(known: Map<string, {
    size: number;
    mtimeMs: number;
    cwd: string | null;
}>): Promise<Map<string, CodexSessionMeta>>;
