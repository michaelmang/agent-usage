import type Database from "better-sqlite3";
export interface SyncResult {
    skipped: boolean;
    fingerprint: string;
    sessionsUpserted: number;
    usageRowsTouched: number;
    projectsUpserted: number;
    durationMs: number;
    message: string;
}
export declare function syncUsage(options?: {
    force?: boolean;
    db?: Database.Database;
}): Promise<SyncResult>;
