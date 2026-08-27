import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { listClaudeSessionFiles } from "../util/fingerprint.js";

export interface ClaudeSessionMeta {
  providerSessionId: string;
  cwd: string | null;
  filePath: string;
  mtimeMs: number;
  size: number;
}

/** Claude project dirs encode absolute paths by replacing `/` and `.` with `-`. */
export function encodeClaudeProjectPath(absPath: string): string {
  const trimmed = absPath.startsWith("/") ? absPath.slice(1) : absPath;
  return `-${trimmed.replaceAll("/", "-").replaceAll(".", "-")}`;
}

let decodedProjectCache: Map<string, string> | null = null;

function buildClaudeProjectDecodeMap(): Map<string, string> {
  if (decodedProjectCache) return decodedProjectCache;
  const map = new Map<string, string>();
  const home = homedir();
  const candidates: string[] = [home];

  try {
    for (const name of readdirSync(home)) {
      if (name.startsWith(".")) continue;
      const full = join(home, name);
      try {
        if (statSync(full).isDirectory()) {
          candidates.push(full);
          for (const child of readdirSync(full)) {
            if (child.startsWith(".")) continue;
            const childFull = join(full, child);
            try {
              if (statSync(childFull).isDirectory()) candidates.push(childFull);
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  for (const c of candidates) {
    map.set(encodeClaudeProjectPath(c), c);
  }
  decodedProjectCache = map;
  return map;
}

export function decodeClaudeProjectDir(encoded: string): string | null {
  return buildClaudeProjectDecodeMap().get(encoded) ?? null;
}

export function clearClaudeProjectDecodeCache(): void {
  decodedProjectCache = null;
}

/**
 * Resolve cwd for a Claude session by scanning early JSONL records.
 * Falls back to decoding the parent project directory name when cwd is stale.
 */
export async function readClaudeSessionMeta(filePath: string): Promise<ClaudeSessionMeta | null> {
  if (!existsSync(filePath)) return null;
  const st = statSync(filePath);
  const idFromName = basename(filePath, ".jsonl");
  if (idFromName === "sessions" || filePath.includes("/memory/")) return null;

  let sessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idFromName)
    ? idFromName
    : null;
  let cwd: string | null = null;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lines = 0;
  try {
    for await (const line of rl) {
      lines += 1;
      if (lines > 120) break;
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (typeof obj.sessionId === "string") sessionId = obj.sessionId;
        if (typeof obj.cwd === "string" && obj.cwd) {
          cwd = obj.cwd;
          break;
        }
      } catch {
        // ignore malformed lines
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (!sessionId) return null;

  // Prefer a still-valid cwd; otherwise recover from Claude's encoded project folder.
  if (!cwd || !existsSync(cwd)) {
    const projectDir = basename(dirname(filePath));
    const decoded = decodeClaudeProjectDir(projectDir);
    if (decoded) cwd = decoded;
  }

  return {
    providerSessionId: sessionId,
    cwd,
    filePath,
    mtimeMs: st.mtimeMs,
    size: st.size,
  };
}

export async function loadClaudeSessionIndex(
  known: Map<string, { size: number; mtimeMs: number; cwd: string | null }>,
): Promise<Map<string, ClaudeSessionMeta>> {
  const result = new Map<string, ClaudeSessionMeta>();
  const files = listClaudeSessionFiles();

  for (const file of files) {
    const id = basename(file, ".jsonl");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      continue;
    }
    const parent = basename(dirname(file));
    if (parent === "subagents") continue;

    let st: { size: number; mtimeMs: number };
    try {
      const s = statSync(file);
      st = { size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      continue;
    }

    const prev = known.get(id);
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs && prev.cwd) {
      // Re-validate cached cwd; recover if path vanished
      let cwd = prev.cwd;
      if (!existsSync(cwd)) {
        const decoded = decodeClaudeProjectDir(basename(dirname(file)));
        if (decoded) cwd = decoded;
      }
      result.set(id, {
        providerSessionId: id,
        cwd,
        filePath: file,
        mtimeMs: st.mtimeMs,
        size: st.size,
      });
      continue;
    }

    const meta = await readClaudeSessionMeta(file);
    if (meta) result.set(meta.providerSessionId, meta);
  }

  return result;
}
