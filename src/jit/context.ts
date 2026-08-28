import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import type { AppConfig } from "../config.js";
import { getDb } from "../db/schema.js";
import { resolveProjectIdentity } from "../util/git.js";
import { localDate } from "../util/format.js";
import type { RuntimeCapabilities, TaskRecommendation } from "./types.js";

export interface JitContextBundle {
  collectedAt: string;
  cwd: string;
  project: {
    name: string;
    path: string;
    unassigned: boolean;
  };
  git?: {
    branch?: string;
    clean: boolean;
    modifiedCount: number;
    untrackedCount: number;
    recentCommits: Array<{ sha: string; subject: string }>;
  };
  usage?: {
    todayCost: number;
    todaySessions: number;
    recentModels: string[];
    recentFailures?: number;
  };
  capabilities: RuntimeCapabilities[];
}

function gitMeta(cwd: string): JitContextBundle["git"] | undefined {
  try {
    const branch = execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    const status = execFileSync("git", ["-C", cwd, "status", "--porcelain"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    const lines = status ? status.split("\n") : [];
    const modified = lines.filter((l) => l.startsWith(" M") || l.startsWith("M")).length;
    const untracked = lines.filter((l) => l.startsWith("?")).length;
    const log = execFileSync(
      "git",
      ["-C", cwd, "log", "-5", "--format=%h %s"],
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    const recentCommits = log
      ? log.split("\n").map((line) => {
          const [sha, ...rest] = line.split(" ");
          return { sha, subject: rest.join(" ") };
        })
      : [];
    return {
      branch,
      clean: lines.length === 0,
      modifiedCount: modified,
      untrackedCount: untracked,
      recentCommits,
    };
  } catch {
    return undefined;
  }
}

function usageMeta(projectPath: string, tz: string): JitContextBundle["usage"] | undefined {
  const db = getDb();
  const today = localDate(new Date(), tz);
  const row = db
    .prepare(
      `SELECT SUM(u.api_equivalent_cost) as cost, COUNT(DISTINCT s.id) as sessions
       FROM usage u
       JOIN sessions s ON s.id = u.session_id
       JOIN projects p ON p.id = s.project_id
       WHERE u.date = ? AND p.canonical_path = ?`,
    )
    .get(today, projectPath) as { cost: number; sessions: number } | undefined;

  const models = db
    .prepare(
      `SELECT DISTINCT u.model FROM usage u
       JOIN sessions s ON s.id = u.session_id
       JOIN projects p ON p.id = s.project_id
       WHERE u.date >= date(?, '-3 days') AND p.canonical_path = ?
       ORDER BY u.date DESC LIMIT 8`,
    )
    .all(today, projectPath) as Array<{ model: string }>;

  if (!row) return undefined;
  return {
    todayCost: row.cost ?? 0,
    todaySessions: row.sessions ?? 0,
    recentModels: models.map((m) => m.model),
  };
}

export function collectJitContext(
  config: AppConfig,
  capabilities: RuntimeCapabilities[],
  cwd = process.cwd(),
): JitContextBundle {
  const project = resolveProjectIdentity(cwd, config);
  const git = !project.unassigned && project.cwd ? gitMeta(project.canonicalPath) : undefined;
  const usage =
    !project.unassigned ? usageMeta(project.canonicalPath, config.timezone ?? "UTC") : undefined;

  return {
    collectedAt: new Date().toISOString(),
    cwd,
    project: {
      name: project.name,
      path: project.canonicalPath,
      unassigned: project.unassigned,
    },
    git,
    usage,
    capabilities,
  };
}

export function formatContextForLlm(ctx: JitContextBundle, task: string): string {
  const lines = [
    `Task: ${task}`,
    `Project: ${ctx.project.name} (${ctx.project.path})`,
    `Working directory: ${ctx.cwd}`,
  ];
  if (ctx.git) {
    lines.push(
      `Git branch: ${ctx.git.branch ?? "unknown"} · clean=${ctx.git.clean} · modified=${ctx.git.modifiedCount} untracked=${ctx.git.untrackedCount}`,
    );
    if (ctx.git.recentCommits.length) {
      lines.push("Recent commits:");
      for (const c of ctx.git.recentCommits) {
        lines.push(`  ${c.sha} ${c.subject}`);
      }
    }
  }
  if (ctx.usage) {
    lines.push(
      `Usage today: $${ctx.usage.todayCost.toFixed(2)} API-equiv · ${ctx.usage.todaySessions} sessions`,
    );
    if (ctx.usage.recentModels.length) {
      lines.push(`Recent models: ${ctx.usage.recentModels.join(", ")}`);
    }
  }
  lines.push("", "Runtime capabilities (summary):");
  for (const cap of ctx.capabilities) {
    lines.push(
      `  ${cap.runtime} ${cap.version ?? "unknown"}: model=${cap.modelSelection} effort=${cap.reasoningEffort} tools=${cap.allowedTools}/${cap.deniedTools}`,
    );
  }
  return lines.join("\n");
}

export function formatTaskRecommendationForLlm(rec: TaskRecommendation): string {
  return [
    "Task recommendation:",
    `  Class: ${rec.taskClass} · risk=${rec.risk} ambiguity=${rec.ambiguity}`,
    `  Runtime: ${rec.runtime.agent} / ${rec.runtime.model}${rec.runtime.effort ? ` / ${rec.runtime.effort}` : ""}`,
    `  JIT: ${rec.jit.level} (confidence ${rec.jit.confidence.toFixed(2)}) — ${rec.jit.reason}`,
    "Reasoning:",
    ...rec.reasoning.map((r) => `  - ${r}`),
  ].join("\n");
}
