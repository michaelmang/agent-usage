import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_PROJECTS_DIR, CODEX_SESSIONS_DIR } from "../paths.js";
function walkFiles(root, pred, out = []) {
    if (!existsSync(root))
        return out;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const full = join(root, entry.name);
        if (entry.isDirectory()) {
            walkFiles(full, pred, out);
        }
        else if (entry.isFile() && pred(entry.name)) {
            out.push(full);
        }
    }
    return out;
}
/** Cheap fingerprint of source logs so we can skip ccusage when nothing changed. */
export function sourceFingerprint() {
    const files = [
        ...walkFiles(CLAUDE_PROJECTS_DIR, (n) => n.endsWith(".jsonl")),
        ...walkFiles(CODEX_SESSIONS_DIR, (n) => n.endsWith(".jsonl")),
    ].sort();
    const hash = createHash("sha1");
    hash.update(`count:${files.length}\n`);
    for (const f of files) {
        try {
            const st = statSync(f);
            hash.update(`${f}|${st.size}|${Math.floor(st.mtimeMs)}\n`);
        }
        catch {
            hash.update(`${f}|missing\n`);
        }
    }
    return hash.digest("hex");
}
export function listClaudeSessionFiles() {
    return walkFiles(CLAUDE_PROJECTS_DIR, (n) => n.endsWith(".jsonl")).filter((f) => !f.includes("/subagents/") && !f.includes("/memory/"));
}
export function listCodexSessionFiles() {
    return walkFiles(CODEX_SESSIONS_DIR, (n) => n.endsWith(".jsonl"));
}
