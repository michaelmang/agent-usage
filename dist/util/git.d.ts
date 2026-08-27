import type { AppConfig } from "../config.js";
export declare function resolveGitRoot(cwd: string | null | undefined): string | null;
export interface ResolvedProject {
    canonicalPath: string;
    name: string;
    cwd: string | null;
    unassigned: boolean;
}
/**
 * Resolve project identity for a session cwd.
 * Config path keys and aliases win; then git root; else Unassigned.
 */
export declare function resolveProjectIdentity(cwd: string | null | undefined, config?: AppConfig): ResolvedProject;
export declare function clearGitRootCache(): void;
