import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import type { AppConfig } from "../config.js";
import { getDb } from "../db/schema.js";
import { JIT_DIR } from "../paths.js";
import { findProjectId } from "../report/queries.js";
import { resolveProjectIdentity } from "../util/git.js";
import { compileHarness } from "../jit/compilers/index.js";
import { probeAllRuntimes } from "../jit/capabilities/probe.js";
import {
  getJitHarness,
  getLatestCompilation,
  listJitHarnesses,
  saveJitCompilation,
  saveJitHarness,
  saveJitRun,
  updateHarnessStatus,
} from "../jit/db.js";
import { runExecutionPlan } from "../jit/executor.js";
import {
  formatCapabilitiesReport,
  formatJitShow,
  formatJitSummary,
} from "../jit/format.js";
import { generateJitHarness } from "../jit/generator.js";
import { jitLevelFromSpec, persistJitArtifacts } from "../jit/persist.js";
import { recommendTask } from "../jit/recommend-task.js";
import type { HarnessSpec, RuntimeAgent } from "../jit/types.js";
import { validateHarnessSpec } from "../jit/validate.js";

export async function runJitCapabilities(): Promise<string> {
  return formatCapabilitiesReport(probeAllRuntimes());
}

export async function runJitGenerate(opts: {
  task: string;
  config: AppConfig;
  cwd?: string;
  runtime?: RuntimeAgent;
  run?: boolean;
  dryRun?: boolean;
}): Promise<{
  harnessId: string;
  summary: string;
  record: ReturnType<typeof getJitHarness>;
  plan: Awaited<ReturnType<typeof compileHarness>>;
}> {
  const cwd = opts.cwd ?? process.cwd();
  const gen = await generateJitHarness({
    task: opts.task,
    config: opts.config,
    runtimeOverride: opts.runtime,
    cwd,
  });

  const plan = await compileHarness(gen.spec, cwd);
  const project = resolveProjectIdentity(cwd, opts.config);
  const projectId = project.unassigned
    ? undefined
    : findProjectId(getDb(), project.canonicalPath);

  const db = getDb();
  saveJitHarness(db, {
    spec: gen.spec,
    generatedSpec: gen.spec,
    jitLevel: jitLevelFromSpec(gen.spec),
    taskRecommendation: gen.taskRecommendation,
    generation: gen.generation,
    projectId,
    status: opts.run ? "running" : "compiled",
  });
  saveJitCompilation(db, gen.spec.id, plan);
  persistJitArtifacts({
    spec: gen.spec,
    plan,
    taskRecommendation: gen.taskRecommendation,
    generation: gen.generation,
  });

  const summary = formatJitSummary(gen.spec, plan, {
    fallbackMessage: gen.fallbackMessage,
    runHint: !opts.run,
  });

  if (opts.run || opts.dryRun) {
    await runJitById(gen.spec.id, { dryRun: opts.dryRun, cwd });
  }

  const record = getJitHarness(db, gen.spec.id);
  return { harnessId: gen.spec.id, summary, record, plan };
}

export async function runJitById(
  id: string,
  opts?: { dryRun?: boolean; cwd?: string },
): Promise<void> {
  const db = getDb();
  const record = getJitHarness(db, id);
  if (!record) throw new Error(`No JIT harness found: ${id}`);

  const compilation = getLatestCompilation(db, id);
  const cwd = opts?.cwd ?? process.cwd();
  const plan = compilation?.plan ?? (await compileHarness(record.spec, cwd));

  if (!compilation) {
    saveJitCompilation(db, id, plan);
  }

  const startedAt = new Date().toISOString();
  updateHarnessStatus(db, id, opts?.dryRun ? "dry_run" : "running");

  const result = await runExecutionPlan(plan, { dryRun: opts?.dryRun });
  const completedAt = new Date().toISOString();

  saveJitRun(db, id, {
    startedAt,
    completedAt,
    status: opts?.dryRun ? "dry_run" : result.exitCode === 0 ? "completed" : "failed",
    exitCode: result.exitCode ?? undefined,
    dryRun: opts?.dryRun,
  });

  updateHarnessStatus(
    db,
    id,
    opts?.dryRun ? "compiled" : result.exitCode === 0 ? "completed" : "failed",
  );

  if (opts?.dryRun) {
    console.log(result.stdout);
  } else {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

export async function runJitCompile(
  id: string,
  opts?: { runtime?: RuntimeAgent; cwd?: string },
): Promise<string> {
  const db = getDb();
  const record = getJitHarness(db, id);
  if (!record) throw new Error(`No JIT harness found: ${id}`);

  const spec = structuredClone(record.spec);
  if (opts?.runtime) {
    spec.runtime.agent = opts.runtime;
  }

  validateHarnessSpec(spec);
  const cwd = opts?.cwd ?? process.cwd();
  const plan = await compileHarness(spec, cwd, {
    fromRuntime: record.spec.runtime.agent,
  });
  saveJitCompilation(db, id, plan);
  persistJitArtifacts({ spec, plan });
  return formatJitSummary(spec, plan, { runHint: true });
}

export function runJitShow(id: string): string {
  const db = getDb();
  const record = getJitHarness(db, id);
  if (!record) throw new Error(`No JIT harness found: ${id}`);
  const compilation = getLatestCompilation(db, id);
  return formatJitShow(record, compilation?.plan);
}

export function runJitEdit(id: string): string {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi";
  const db = getDb();
  const record = getJitHarness(db, id);
  if (!record) throw new Error(`No JIT harness found: ${id}`);

  const file = join(JIT_DIR, id, "spec.json");
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify(record.spec, null, 2), "utf8");
  }

  spawnSync(editor, [file], { stdio: "inherit" });

  const edited = JSON.parse(readFileSync(file, "utf8")) as HarnessSpec;
  validateHarnessSpec(edited);

  db.prepare(
    `UPDATE jit_harnesses SET final_spec_json = ?, spec_json = ?, manual_override = 1 WHERE id = ?`,
  ).run(JSON.stringify(edited), JSON.stringify(edited), id);

  return `Harness ${id} updated. Recompile with: agent-usage jit compile ${id}`;
}

export function runJitExperiment(task: string): string {
  const taskRec = recommendTask(task);
  return [
    "Experiment arm A — fixed/recommended profile:",
    `  ${taskRec.runtime.agent} / ${taskRec.runtime.model}${taskRec.runtime.effort ? ` / ${taskRec.runtime.effort}` : ""}`,
    `  JIT level: ${taskRec.jit.level}`,
    "",
    "Experiment arm B — generate JIT harness:",
    `  agent-usage jit "${task}"`,
    "",
    "Neither arm runs automatically. Execute manually and compare outcomes.",
  ].join("\n");
}

export function listJitForApi(limit = 50): ReturnType<typeof listJitHarnesses> {
  return listJitHarnesses(getDb(), limit);
}

export function getJitForApi(id: string): {
  record: ReturnType<typeof getJitHarness>;
  compilation: ReturnType<typeof getLatestCompilation>;
} | null {
  const db = getDb();
  const record = getJitHarness(db, id);
  if (!record) return null;
  const compilation = getLatestCompilation(db, id);
  return { record, compilation };
}
