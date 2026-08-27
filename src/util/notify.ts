import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

export function resolveAgentPingBin(): string | null {
  const candidates: string[] = [];

  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("agent-ping/package.json");
    const root = dirname(pkgPath);
    candidates.push(join(root, "dist", "cli.js"));
  } catch {
    // agent-ping not installed as dependency
  }

  const home = homedir();
  candidates.push(
    join(home, ".nvm", "versions", "node", process.version, "bin", "agent-ping"),
  );

  try {
    const which = execFileSync("which", ["agent-ping"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (which) candidates.unshift(which);
  } catch {
    // not on PATH
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function notifyUsageSnapshot(opts?: {
  date?: string;
  file?: string;
  quiet?: boolean;
}): { ok: boolean; message: string } {
  const bin = resolveAgentPingBin();
  if (!bin) {
    return {
      ok: false,
      message: "agent-ping not found on PATH (install with: npm link in agent-ping)",
    };
  }

  const args = [bin, "usage", "--best-effort", "--quiet"];
  if (opts?.date) args.push("--date", opts.date);
  if (opts?.file) args.push("--file", opts.file);
  if (opts?.quiet === false) {
    args.splice(args.indexOf("--quiet"), 1);
  }

  const useNode = bin.endsWith(".js");
  const cmd = useNode ? process.execPath : bin;
  const cmdArgs = useNode ? args : args.slice(1);

  const result = spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) {
    return { ok: true, message: (result.stdout || "").trim() || "Notification sent" };
  }
  return {
    ok: false,
    message: (result.stderr || result.stdout || "agent-ping usage failed").trim(),
  };
}

export function launchdPathEnv(): string {
  const parts = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    "/bin",
    dirname(process.execPath),
    join(homedir(), ".local", "bin"),
  ];
  const nvmBin = join(homedir(), ".nvm", "versions", "node", process.version, "bin");
  if (existsSync(nvmBin)) parts.unshift(nvmBin);
  return [...new Set(parts)].join(":");
}

export function ntfyEnvForLaunchd(): Record<string, string> {
  const env: Record<string, string> = { PATH: launchdPathEnv() };
  for (const key of [
    "NTFY_TOPIC",
    "NTFY_SERVER",
    "NTFY_TOKEN",
    "NTFY_USERNAME",
    "NTFY_PASSWORD",
    "NTFY_PRIORITY",
    "NTFY_TAGS",
    "NTFY_ICON",
    "NTFY_USAGE_ICON",
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}
