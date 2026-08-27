import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { UNASSIGNED_NAME, UNASSIGNED_PATH } from "../paths.js";
const gitRootCache = new Map();
export function resolveGitRoot(cwd) {
    if (!cwd)
        return null;
    const abs = resolve(cwd);
    if (gitRootCache.has(abs)) {
        return gitRootCache.get(abs) ?? null;
    }
    if (!existsSync(abs)) {
        gitRootCache.set(abs, null);
        return null;
    }
    try {
        const root = execFileSync("git", ["-C", abs, "rev-parse", "--show-toplevel"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 5000,
        }).trim();
        gitRootCache.set(abs, root);
        return root;
    }
    catch {
        gitRootCache.set(abs, null);
        return null;
    }
}
/**
 * Resolve project identity for a session cwd.
 * Config path keys and aliases win; then git root; else Unassigned.
 */
export function resolveProjectIdentity(cwd, config) {
    if (!cwd) {
        return {
            canonicalPath: UNASSIGNED_PATH,
            name: UNASSIGNED_NAME,
            cwd: null,
            unassigned: true,
        };
    }
    const abs = resolve(cwd);
    if (config) {
        if (config.projects[abs]) {
            const cfg = config.projects[abs];
            return {
                canonicalPath: abs,
                name: cfg.name ?? basename(abs),
                cwd: abs,
                unassigned: false,
            };
        }
        for (const [path, cfg] of Object.entries(config.projects)) {
            if (cfg.aliases?.includes(abs) || cfg.aliases?.includes(cwd)) {
                return {
                    canonicalPath: path,
                    name: cfg.name ?? basename(path),
                    cwd: abs,
                    unassigned: false,
                };
            }
        }
    }
    const root = resolveGitRoot(abs);
    if (root) {
        if (config?.projects[root]) {
            const cfg = config.projects[root];
            return {
                canonicalPath: root,
                name: cfg.name ?? basename(root),
                cwd: abs,
                unassigned: false,
            };
        }
        return {
            canonicalPath: root,
            name: basename(root),
            cwd: abs,
            unassigned: false,
        };
    }
    return {
        canonicalPath: abs,
        name: UNASSIGNED_NAME,
        cwd: abs,
        unassigned: true,
    };
}
export function clearGitRootCache() {
    gitRootCache.clear();
}
