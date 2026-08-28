import { execFileSync } from "node:child_process";

import type { RuntimeAgent, RuntimeCapabilities } from "../types.js";

const PROBE_TIMEOUT_MS = 8000;

function runHelp(executable: string): string {
  try {
    return execFileSync(executable, ["--help"], {
      encoding: "utf8",
      timeout: PROBE_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function resolveExecutable(name: string, envVar: string): string | undefined {
  const fromEnv = process.env[envVar]?.trim();
  if (fromEnv) return fromEnv;
  try {
    const out = execFileSync("which", [name], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function helpIncludes(help: string, patterns: string[]): boolean {
  const lower = help.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function probeVersion(executable: string): string | undefined {
  for (const args of [["--version"], ["version"], ["-V"]]) {
    try {
      const out = execFileSync(executable, args, {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out) return out.split("\n")[0].slice(0, 120);
    } catch {
      // continue
    }
  }
  return undefined;
}

export function probeRuntimeCapabilities(agent: RuntimeAgent): RuntimeCapabilities | null {
  const executable =
    agent === "codex"
      ? resolveExecutable("codex", "CODEX_CLI")
      : agent === "claude"
        ? resolveExecutable("claude", "CLAUDE_CLI")
        : resolveExecutable("pi", "PI_CLI");

  if (!executable) return null;

  const help = runHelp(executable);
  const version = probeVersion(executable);
  const checkedAt = new Date().toISOString();

  if (agent === "claude") {
    const allowedTools = helpIncludes(help, ["--allowed-tools", "--allowedTools"]);
    const deniedTools = helpIncludes(help, ["--disallowed-tools", "--disallowedTools"]);
    return {
      runtime: "claude",
      version,
      checkedAt,
      executable,
      modelSelection: helpIncludes(help, ["--model"]),
      reasoningEffort: helpIncludes(help, ["effort", "thinking"]),
      sessionResume: helpIncludes(help, ["--resume", "--continue"]),
      sessionContinuation: helpIncludes(help, ["--continue"]),
      allowedTools: allowedTools ? true : "partial",
      deniedTools: deniedTools ? true : "partial",
      maxTurns: helpIncludes(help, ["--max-turns", "--maxTurns"]) ? true : "wrapper",
      structuredOutput: helpIncludes(help, ["--output-format", "json"]),
      customSystemPrompt: helpIncludes(help, ["--append-system-prompt", "system prompt"]),
      workingDirectory: helpIncludes(help, ["--add-dir", "working directory"]),
      dynamicToolMutation: false,
      customMemoryPolicy: false,
      customPlanningLoop: false,
      detectedFlags: extractFlagHints(help),
    };
  }

  if (agent === "codex") {
    return {
      runtime: "codex",
      version,
      checkedAt,
      executable,
      modelSelection: helpIncludes(help, ["--model", "-m "]),
      reasoningEffort: helpIncludes(help, ["effort", "reasoning"]),
      sessionResume: helpIncludes(help, ["resume", "continue"]),
      sessionContinuation: helpIncludes(help, ["continue"]),
      allowedTools: helpIncludes(help, ["tool", "permission"]) ? "partial" : false,
      deniedTools: false,
      maxTurns: "wrapper",
      structuredOutput: helpIncludes(help, ["json", "output-format"]),
      customSystemPrompt: helpIncludes(help, ["system", "instructions"]),
      workingDirectory: helpIncludes(help, ["--cwd", "directory"]),
      dynamicToolMutation: false,
      customMemoryPolicy: false,
      customPlanningLoop: false,
      detectedFlags: extractFlagHints(help),
    };
  }

  return {
    runtime: "pi",
    version,
    checkedAt,
    executable,
    modelSelection: true,
    reasoningEffort: true,
    sessionResume: true,
    sessionContinuation: true,
    allowedTools: true,
    deniedTools: true,
    maxTurns: true,
    structuredOutput: true,
    customSystemPrompt: true,
    workingDirectory: true,
    dynamicToolMutation: true,
    customMemoryPolicy: true,
    customPlanningLoop: true,
    detectedFlags: extractFlagHints(help),
  };
}

function extractFlagHints(help: string): Record<string, string> {
  const flags: Record<string, string> = {};
  const lines = help.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*(--[a-z0-9-]+)/i);
    if (match) {
      flags[match[1]] = line.trim().slice(0, 160);
    }
  }
  return flags;
}

export function probeAllRuntimes(): RuntimeCapabilities[] {
  const agents: RuntimeAgent[] = ["codex", "claude", "pi"];
  return agents
    .map((agent) => probeRuntimeCapabilities(agent))
    .filter((c): c is RuntimeCapabilities => c !== null);
}
