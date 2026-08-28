import type Database from "better-sqlite3";

import type {
  ExecutionPlan,
  HarnessSpec,
  JitGenerationMeta,
  JitHarnessRecord,
  JitLevel,
  TaskRecommendation,
} from "./types.js";

export function saveJitHarness(
  db: Database.Database,
  record: {
    spec: HarnessSpec;
    generatedSpec?: HarnessSpec;
    finalSpec?: HarnessSpec;
    manualOverride?: boolean;
    jitLevel: JitLevel;
    taskRecommendation?: TaskRecommendation;
    generation?: JitGenerationMeta;
    projectId?: number;
    status?: string;
  },
): void {
  const spec = record.finalSpec ?? record.spec;
  db.prepare(
    `INSERT INTO jit_harnesses (
      id, recommendation_id, project_id, created_at, jit_level,
      runtime, runtime_version, model, effort, spec_version, spec_json,
      generated_spec_json, final_spec_json, manual_override,
      generation_model, generation_effort, generation_input_tokens,
      generation_output_tokens, generation_actual_cost, generation_duration_ms,
      generation_rationale, task_recommendation_json, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
  ).run(
    spec.id,
    null,
    record.projectId ?? null,
    spec.createdAt,
    record.jitLevel,
    spec.runtime.agent,
    null,
    spec.runtime.model,
    spec.runtime.effort ?? null,
    spec.version,
    JSON.stringify(spec),
    record.generatedSpec ? JSON.stringify(record.generatedSpec) : null,
    record.finalSpec ? JSON.stringify(record.finalSpec) : null,
    record.manualOverride ? 1 : 0,
    record.generation?.model ?? null,
    record.generation?.effort ?? null,
    record.generation?.inputTokens ?? null,
    record.generation?.outputTokens ?? null,
    record.generation?.actualCost ?? null,
    record.generation?.durationMs ?? null,
    record.generation?.rationale ?? null,
    record.taskRecommendation ? JSON.stringify(record.taskRecommendation) : null,
    record.status ?? "generated",
  );
}

export function saveJitCompilation(
  db: Database.Database,
  harnessId: string,
  plan: ExecutionPlan,
): number {
  const result = db
    .prepare(
      `INSERT INTO jit_compilations (
        jit_harness_id, compiled_at, runtime, runtime_version, execution_plan_json,
        native_control_count, prompt_control_count, wrapper_control_count, unsupported_control_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      harnessId,
      new Date().toISOString(),
      plan.runtime,
      plan.runtimeVersion ?? null,
      JSON.stringify(plan),
      plan.controls.native.length,
      plan.controls.promptEnforced.length,
      plan.controls.wrapperEnforced.length,
      plan.controls.unsupported.length,
    );
  return Number(result.lastInsertRowid);
}

export function saveJitRun(
  db: Database.Database,
  harnessId: string,
  opts: {
    startedAt: string;
    completedAt?: string;
    status: string;
    exitCode?: number;
    dryRun?: boolean;
    providerSessionId?: string;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO jit_runs (
        jit_harness_id, started_at, completed_at, provider_session_id,
        status, exit_code, dry_run
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      harnessId,
      opts.startedAt,
      opts.completedAt ?? null,
      opts.providerSessionId ?? null,
      opts.status,
      opts.exitCode ?? null,
      opts.dryRun ? 1 : 0,
    );
  return Number(result.lastInsertRowid);
}

export function updateHarnessStatus(db: Database.Database, id: string, status: string): void {
  db.prepare(`UPDATE jit_harnesses SET status = ? WHERE id = ?`).run(status, id);
}

export function listJitHarnesses(db: Database.Database, limit = 50): JitHarnessRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM jit_harnesses ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>;

  return rows.map(rowToRecord);
}

export function getJitHarness(db: Database.Database, id: string): JitHarnessRecord | null {
  const row = db.prepare(`SELECT * FROM jit_harnesses WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return rowToRecord(row);
}

function rowToRecord(row: Record<string, unknown>): JitHarnessRecord {
  const spec = JSON.parse(String(row.spec_json)) as HarnessSpec;
  const taskRecommendation = row.task_recommendation_json
    ? (JSON.parse(String(row.task_recommendation_json)) as TaskRecommendation)
    : undefined;
  const generation =
    row.generation_model
      ? {
          model: String(row.generation_model),
          provider: "openai",
          effort: row.generation_effort ? String(row.generation_effort) : undefined,
          inputTokens: row.generation_input_tokens as number | undefined,
          outputTokens: row.generation_output_tokens as number | undefined,
          actualCost: row.generation_actual_cost as number | undefined,
          durationMs: Number(row.generation_duration_ms ?? 0),
          rationale: String(row.generation_rationale ?? ""),
        }
      : undefined;

  return {
    id: String(row.id),
    spec,
    generatedSpec: row.generated_spec_json
      ? (JSON.parse(String(row.generated_spec_json)) as HarnessSpec)
      : undefined,
    finalSpec: row.final_spec_json
      ? (JSON.parse(String(row.final_spec_json)) as HarnessSpec)
      : undefined,
    manualOverride: Boolean(row.manual_override),
    jitLevel: String(row.jit_level) as JitLevel,
    taskRecommendation,
    generation,
    status: String(row.status),
    createdAt: String(row.created_at),
    projectId: row.project_id as number | undefined,
  };
}

export function getLatestCompilation(
  db: Database.Database,
  harnessId: string,
): {
  plan: ExecutionPlan;
  compiledAt: string;
  counts: { native: number; prompt: number; wrapper: number; unsupported: number };
} | null {
  const row = db
    .prepare(
      `SELECT * FROM jit_compilations WHERE jit_harness_id = ? ORDER BY compiled_at DESC LIMIT 1`,
    )
    .get(harnessId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    plan: JSON.parse(String(row.execution_plan_json)) as ExecutionPlan,
    compiledAt: String(row.compiled_at),
    counts: {
      native: Number(row.native_control_count),
      prompt: Number(row.prompt_control_count),
      wrapper: Number(row.wrapper_control_count),
      unsupported: Number(row.unsupported_control_count),
    },
  };
}
