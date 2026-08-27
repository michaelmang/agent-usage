import { createReadStream, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { CODEX_SESSIONS_DIR } from "../paths.js";
import { listCodexSessionFiles } from "../util/fingerprint.js";
function periodFromPath(filePath) {
    const marker = "/sessions/";
    const idx = filePath.lastIndexOf(marker);
    const rel = idx >= 0 ? filePath.slice(idx + marker.length) : filePath.slice(CODEX_SESSIONS_DIR.length + 1);
    return rel.replace(/\.jsonl$/, "");
}
/**
 * Read only the first JSONL record (session_meta) for cwd.
 * First lines can be multi-megabyte due to base_instructions — stream one line.
 */
export async function readCodexSessionMeta(filePath) {
    if (!existsSync(filePath))
        return null;
    const st = statSync(filePath);
    const providerSessionId = periodFromPath(filePath);
    const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let cwd = null;
    let threadId = null;
    try {
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const obj = JSON.parse(line);
                if (obj.type === "session_meta" && obj.payload) {
                    cwd = obj.payload.cwd ?? null;
                    threadId = obj.payload.session_id ?? obj.payload.id ?? null;
                }
            }
            catch {
                // First line may still be incomplete for extremely huge lines; give up.
            }
            break; // only need first record
        }
    }
    finally {
        rl.close();
        stream.destroy();
    }
    return {
        providerSessionId,
        threadId,
        cwd,
        filePath,
        mtimeMs: st.mtimeMs,
        size: st.size,
    };
}
export async function loadCodexSessionIndex(known) {
    const result = new Map();
    for (const file of listCodexSessionFiles()) {
        const id = periodFromPath(file);
        let st;
        try {
            const s = statSync(file);
            st = { size: s.size, mtimeMs: s.mtimeMs };
        }
        catch {
            continue;
        }
        const prev = known.get(id);
        if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) {
            result.set(id, {
                providerSessionId: id,
                threadId: null,
                cwd: prev.cwd,
                filePath: file,
                mtimeMs: st.mtimeMs,
                size: st.size,
            });
            continue;
        }
        const meta = await readCodexSessionMeta(file);
        if (meta)
            result.set(meta.providerSessionId, meta);
    }
    return result;
}
