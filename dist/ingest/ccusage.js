import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CACHE_DIR } from "../paths.js";
export function resolveCcusageBin() {
    const require = createRequire(import.meta.url);
    try {
        const pkgPath = require.resolve("ccusage/package.json");
        const root = dirname(pkgPath);
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        const binRel = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.ccusage ?? "src/cli.js");
        const binPath = join(root, binRel);
        if (existsSync(binPath)) {
            return { cmd: process.execPath, argsPrefix: [binPath] };
        }
    }
    catch {
        // fall through
    }
    // Prefer local node_modules/.bin
    try {
        const binWrapper = require.resolve(".bin/ccusage");
        if (existsSync(binWrapper)) {
            return { cmd: binWrapper, argsPrefix: [] };
        }
    }
    catch {
        // fall through
    }
    return { cmd: "npx", argsPrefix: ["--yes", "ccusage@latest"] };
}
function normalizeSessions(raw) {
    if (!raw || typeof raw !== "object")
        return [];
    const obj = raw;
    const list = (obj.session ?? obj.sessions);
    if (!Array.isArray(list))
        return [];
    const out = [];
    for (const item of list) {
        if (!item || typeof item !== "object")
            continue;
        const s = item;
        // Unified v20+ shape
        if (typeof s.period === "string" && typeof s.agent === "string") {
            out.push({
                agent: s.agent,
                period: s.period,
                inputTokens: Number(s.inputTokens) || 0,
                outputTokens: Number(s.outputTokens) || 0,
                cacheCreationTokens: Number(s.cacheCreationTokens) || 0,
                cacheReadTokens: Number(s.cacheReadTokens) || 0,
                totalTokens: Number(s.totalTokens) || 0,
                totalCost: Number(s.totalCost) || 0,
                modelsUsed: s.modelsUsed ?? [],
                modelBreakdowns: s.modelBreakdowns ?? [],
                metadata: s.metadata ?? {
                    lastActivity: typeof s.lastActivity === "string" ? s.lastActivity : undefined,
                },
            });
            continue;
        }
        // Legacy Claude-only shape (sessionId + optional projectPath)
        if (typeof s.sessionId === "string") {
            const agent = typeof s.agent === "string" ? s.agent : "claude";
            out.push({
                agent,
                period: s.sessionId,
                inputTokens: Number(s.inputTokens) || 0,
                outputTokens: Number(s.outputTokens) || 0,
                cacheCreationTokens: Number(s.cacheCreationTokens) || 0,
                cacheReadTokens: Number(s.cacheReadTokens) || 0,
                totalTokens: Number(s.totalTokens) || 0,
                totalCost: Number(s.totalCost ?? s.costUSD) || 0,
                modelsUsed: s.modelsUsed ?? Object.keys(s.models ?? {}),
                modelBreakdowns: normalizeLegacyBreakdowns(s),
                metadata: {
                    lastActivity: typeof s.lastActivity === "string"
                        ? s.lastActivity
                        : s.metadata?.lastActivity,
                },
            });
        }
    }
    return out;
}
function normalizeLegacyBreakdowns(s) {
    if (Array.isArray(s.modelBreakdowns)) {
        return s.modelBreakdowns;
    }
    const models = s.models;
    if (!models)
        return [];
    return Object.entries(models).map(([modelName, m]) => ({
        modelName,
        inputTokens: m.inputTokens ?? 0,
        outputTokens: m.outputTokens ?? 0,
        cacheCreationTokens: m.cacheCreationTokens ?? 0,
        cacheReadTokens: m.cacheReadTokens ?? 0,
        cost: 0,
    }));
}
export async function runCcusageSessionJson(opts) {
    const { cmd, argsPrefix } = resolveCcusageBin();
    const args = [...argsPrefix, "session", "--json"];
    if (opts?.offline !== false)
        args.push("-O");
    if (opts?.since)
        args.push("--since", opts.since);
    const stdout = await new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            env: { ...process.env, NO_COLOR: "1" },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        let err = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (d) => {
            out += d;
        });
        child.stderr.on("data", (d) => {
            err += d;
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`ccusage exited ${code}: ${err || out}`));
                return;
            }
            resolve(out);
        });
    });
    const parsed = JSON.parse(stdout);
    return { session: normalizeSessions(parsed) };
}
export function cachePath(fingerprint) {
    mkdirSync(CACHE_DIR, { recursive: true });
    return join(CACHE_DIR, `ccusage-session-${fingerprint}.json`);
}
export function readCachedReport(fingerprint) {
    const p = cachePath(fingerprint);
    if (!existsSync(p))
        return null;
    try {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        return { session: normalizeSessions(raw) };
    }
    catch {
        return null;
    }
}
export function writeCachedReport(fingerprint, report) {
    // Store in the unified shape ccusage v20 emits
    writeFileSync(cachePath(fingerprint), JSON.stringify({ session: report.session }), "utf8");
}
