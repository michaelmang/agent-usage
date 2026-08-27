import Database from "better-sqlite3";
export type Provider = "claude" | "codex" | "cursor" | "other";
export declare function ensureDataDirs(): void;
export declare function openDb(path?: string): Database.Database;
export declare function getDb(): Database.Database;
export declare function closeDb(): void;
export declare function setMeta(db: Database.Database, key: string, value: string): void;
export declare function getMeta(db: Database.Database, key: string): string | undefined;
