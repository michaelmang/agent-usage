import type Database from "better-sqlite3";
import { loadConfig, resolveProjectAlias, type AppConfig } from "../config.js";
import { getDb, getMeta, setMeta, type Provider } from "../db/schema.js";
import { localDate, localDateFromIso, nowIso } from "../util/format.js";
import { sourceFingerprint } from "../util/fingerprint.js";
import { resolveProjectIdentity } from "../util/git.js";
import {
  readCachedReport,
  runCcusageSessionJson,
  writeCachedReport,
  type CcusageSession,
  type ModelBreakdown,
} from "./ccusage.js";
import {
  effortSharesForModel,
  scanClaudeEffortTokens,
  scanCodexEffortTokens,
  type EffortTokenMap,
} from "./effort.js";
import { loadClaudeSessionIndex } from "./claude-sessions.js";
import { loadCodexSessionIndex } from "./codex-sessions.js";

export interface SyncResult {
  skipped: boolean;
  fingerprint: string;
  sessionsUpserted: number;
  usageRowsTouched: number;
  projectsUpserted: number;
  durationMs: number;
  message: string;
}

interface KnownMeta {
  size: number;
  mtimeMs: number;
  cwd: string | null;
}

function loadKnownMeta(db: Database.Database, provider: string): Map<string, KnownMeta> {
  const rows = db
    .prepare(`SELECT provider_session_id AS id, cwd FROM sessions WHERE provider = ?`)
    .all(provider) as Array<{ id: string; cwd: string | null }>;
  const map = new Map<string, KnownMeta>();
  const raw = getMeta(db, `session_files:${provider}`);
  const fileIndex = raw ? (JSON.parse(raw) as Record<string, KnownMeta>) : {};
  for (const row of rows) {
    const fi = fileIndex[row.id];
    map.set(row.id, {
      size: fi?.size ?? 0,
      mtimeMs: fi?.mtimeMs ?? 0,
      cwd: row.cwd ?? fi?.cwd ?? null,
    });
  }
  for (const [id, fi] of Object.entries(fileIndex)) {
    if (!map.has(id)) map.set(id, fi);
  }
  return map;
}

function saveKnownMeta(
  db: Database.Database,
  provider: string,
  metas: Iterable<{ providerSessionId: string; size: number; mtimeMs: number; cwd: string | null }>,
): void {
  const obj: Record<string, KnownMeta> = {};
  for (const m of metas) {
    obj[m.providerSessionId] = { size: m.size, mtimeMs: m.mtimeMs, cwd: m.cwd };
  }
  setMeta(db, `session_files:${provider}`, JSON.stringify(obj));
}

function upsertProject(
  db: Database.Database,
  config: AppConfig,
  canonicalPath: string,
  defaultName: string,
): number {
  const alias = resolveProjectAlias(config, canonicalPath);
  const name = alias?.name ?? defaultName;
  const client = alias?.client ?? null;
  const contract = alias?.contract_value ?? null;
  const now = nowIso();

  db.prepare(
    `INSERT INTO projects(canonical_path, name, client, contract_value, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(canonical_path) DO UPDATE SET
       name = excluded.name,
       client = excluded.client,
       contract_value = excluded.contract_value`,
  ).run(canonicalPath, name, client, contract, now);

  const row = db.prepare(`SELECT id FROM projects WHERE canonical_path = ?`).get(canonicalPath) as {
    id: number;
  };
  return row.id;
}

function upsertSession(
  db: Database.Database,
  provider: Provider,
  providerSessionId: string,
  projectId: number | null,
  cwd: string | null,
  startedAt: string | null,
  endedAt: string | null,
  models: string[],
): number {
  db.prepare(
    `INSERT INTO sessions(provider_session_id, provider, project_id, cwd, started_at, ended_at, models)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_session_id) DO UPDATE SET
       project_id = COALESCE(excluded.project_id, sessions.project_id),
       cwd = COALESCE(excluded.cwd, sessions.cwd),
       started_at = COALESCE(sessions.started_at, excluded.started_at),
       ended_at = COALESCE(excluded.ended_at, sessions.ended_at),
       models = excluded.models`,
  ).run(providerSessionId, provider, projectId, cwd, startedAt, endedAt, JSON.stringify(models));

  const row = db
    .prepare(`SELECT id FROM sessions WHERE provider = ? AND provider_session_id = ?`)
    .get(provider, providerSessionId) as { id: number };
  return row.id;
}

function tokensFromBreakdown(b: ModelBreakdown) {
  return {
    input: b.inputTokens ?? 0,
    output: b.outputTokens ?? 0,
    cacheCreate: b.cacheCreationTokens ?? 0,
    cacheRead: b.cacheReadTokens ?? 0,
    total:
      (b.inputTokens ?? 0) +
      (b.outputTokens ?? 0) +
      (b.cacheCreationTokens ?? 0) +
      (b.cacheReadTokens ?? 0),
    cost: b.cost ?? 0,
  };
}

function scaleUsage(
  values: {
    input: number;
    output: number;
    cacheCreate: number;
    cacheRead: number;
    total: number;
    cost: number;
  },
  share: number,
) {
  return {
    input: Math.round(values.input * share),
    output: Math.round(values.output * share),
    cacheCreate: Math.round(values.cacheCreate * share),
    cacheRead: Math.round(values.cacheRead * share),
    total: Math.round(values.total * share),
    cost: values.cost * share,
  };
}

function applySessionUsage(
  db: Database.Database,
  sessionId: number,
  provider: Provider,
  session: CcusageSession,
  attributionDate: string,
  isBaseline: boolean,
  effortMap?: EffortTokenMap,
): number {
  let touched = 0;
  const now = nowIso();
  const breakdowns =
    session.modelBreakdowns?.length > 0
      ? session.modelBreakdowns
      : [
          {
            modelName: session.modelsUsed?.[0] ?? "unknown",
            inputTokens: session.inputTokens,
            outputTokens: session.outputTokens,
            cacheCreationTokens: session.cacheCreationTokens,
            cacheReadTokens: session.cacheReadTokens,
            cost: session.totalCost,
          } satisfies ModelBreakdown,
        ];

  const getPrev = db.prepare(
    `SELECT input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
            total_tokens, api_equivalent_cost
     FROM session_totals WHERE session_id = ? AND model = ?`,
  );

  const upsertTotals = db.prepare(
    `INSERT INTO session_totals(
       session_id, provider, model, input_tokens, output_tokens,
       cache_create_tokens, cache_read_tokens, total_tokens, api_equivalent_cost,
       last_activity, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, model) DO UPDATE SET
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       cache_create_tokens = excluded.cache_create_tokens,
       cache_read_tokens = excluded.cache_read_tokens,
       total_tokens = excluded.total_tokens,
       api_equivalent_cost = excluded.api_equivalent_cost,
       last_activity = excluded.last_activity,
       updated_at = excluded.updated_at`,
  );

  const upsertUsage = db.prepare(
    `INSERT INTO usage(
       session_id, date, provider, model, effort, input_tokens, output_tokens,
       cache_create_tokens, cache_read_tokens, total_tokens, api_equivalent_cost, captured_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, date, model, effort) DO UPDATE SET
       input_tokens = usage.input_tokens + excluded.input_tokens,
       output_tokens = usage.output_tokens + excluded.output_tokens,
       cache_create_tokens = usage.cache_create_tokens + excluded.cache_create_tokens,
       cache_read_tokens = usage.cache_read_tokens + excluded.cache_read_tokens,
       total_tokens = usage.total_tokens + excluded.total_tokens,
       api_equivalent_cost = usage.api_equivalent_cost + excluded.api_equivalent_cost,
       captured_at = excluded.captured_at`,
  );

  // For baseline historical import we REPLACE usage for that date rather than add,
  // using a dedicated path that sets absolute values.
  const replaceUsage = db.prepare(
    `INSERT INTO usage(
       session_id, date, provider, model, effort, input_tokens, output_tokens,
       cache_create_tokens, cache_read_tokens, total_tokens, api_equivalent_cost, captured_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, date, model, effort) DO UPDATE SET
       input_tokens = excluded.input_tokens,
       output_tokens = excluded.output_tokens,
       cache_create_tokens = excluded.cache_create_tokens,
       cache_read_tokens = excluded.cache_read_tokens,
       total_tokens = excluded.total_tokens,
       api_equivalent_cost = excluded.api_equivalent_cost,
       captured_at = excluded.captured_at`,
  );

  const writeUsage = (
    model: string,
    values: {
      input: number;
      output: number;
      cacheCreate: number;
      cacheRead: number;
      total: number;
      cost: number;
    },
    mode: "replace" | "upsert",
  ) => {
    const shares = effortSharesForModel(effortMap ?? new Map(), model);
    for (const { effort, share } of shares) {
      const scaled = scaleUsage(values, share);
      if (scaled.total <= 0 && scaled.cost <= 0) continue;
      const args = [
        sessionId,
        attributionDate,
        provider,
        model,
        effort,
        scaled.input,
        scaled.output,
        scaled.cacheCreate,
        scaled.cacheRead,
        scaled.total,
        scaled.cost,
        now,
      ];
      if (mode === "replace") replaceUsage.run(...args);
      else upsertUsage.run(...args);
      touched += 1;
    }
  };

  for (const b of breakdowns) {
    const next = tokensFromBreakdown(b);
    const prev = getPrev.get(sessionId, b.modelName) as
      | {
          input_tokens: number;
          output_tokens: number;
          cache_create_tokens: number;
          cache_read_tokens: number;
          total_tokens: number;
          api_equivalent_cost: number;
        }
      | undefined;

    upsertTotals.run(
      sessionId,
      provider,
      b.modelName,
      next.input,
      next.output,
      next.cacheCreate,
      next.cacheRead,
      next.total,
      next.cost,
      session.metadata?.lastActivity ?? null,
      now,
    );

    if (isBaseline) {
      writeUsage(
        b.modelName,
        {
          input: next.input,
          output: next.output,
          cacheCreate: next.cacheCreate,
          cacheRead: next.cacheRead,
          total: next.total,
          cost: next.cost,
        },
        "replace",
      );
      continue;
    }

    if (!prev) {
      writeUsage(
        b.modelName,
        {
          input: next.input,
          output: next.output,
          cacheCreate: next.cacheCreate,
          cacheRead: next.cacheRead,
          total: next.total,
          cost: next.cost,
        },
        "upsert",
      );
      continue;
    }

    const dInput = next.input - prev.input_tokens;
    const dOutput = next.output - prev.output_tokens;
    const dCc = next.cacheCreate - prev.cache_create_tokens;
    const dCr = next.cacheRead - prev.cache_read_tokens;
    const dTotal = next.total - prev.total_tokens;
    const dCost = next.cost - prev.api_equivalent_cost;

    if (dTotal <= 0 && dCost <= 0) continue;

    writeUsage(
      b.modelName,
      {
        input: Math.max(0, dInput),
        output: Math.max(0, dOutput),
        cacheCreate: Math.max(0, dCc),
        cacheRead: Math.max(0, dCr),
        total: Math.max(0, dTotal),
        cost: Math.max(0, dCost),
      },
      "upsert",
    );
  }

  return touched;
}

function normalizeProvider(agent: string): Provider {
  if (agent === "claude") return "claude";
  if (agent === "codex") return "codex";
  if (agent === "cursor") return "cursor";
  return "other";
}

export async function syncUsage(options?: {
  force?: boolean;
  db?: Database.Database;
}): Promise<SyncResult> {
  const started = Date.now();
  const db = options?.db ?? getDb();
  const config = loadConfig();
  const tz = config.timezone;
  const fingerprint = sourceFingerprint();
  const lastFp = getMeta(db, "source_fingerprint");
  const baselined = getMeta(db, "baseline_complete") === "1";

  if (!options?.force && lastFp === fingerprint && baselined) {
    return {
      skipped: true,
      fingerprint,
      sessionsUpserted: 0,
      usageRowsTouched: 0,
      projectsUpserted: 0,
      durationMs: Date.now() - started,
      message: "Already up to date",
    };
  }

  let report = readCachedReport(fingerprint);
  if (!report) {
    report = await runCcusageSessionJson({ offline: true });
    writeCachedReport(fingerprint, report);
  }

  const claudeKnown = loadKnownMeta(db, "claude");
  const codexKnown = loadKnownMeta(db, "codex");
  const claudeIndex = await loadClaudeSessionIndex(claudeKnown);
  const codexIndex = await loadCodexSessionIndex(codexKnown);

  saveKnownMeta(db, "claude", claudeIndex.values());
  saveKnownMeta(db, "codex", codexIndex.values());

  const isBaseline = !baselined;
  const today = localDate(new Date(), tz);
  let sessionsUpserted = 0;
  let usageRowsTouched = 0;
  let projectsUpserted = 0;

  const effortByPeriod = new Map<string, EffortTokenMap>();
  for (const session of report!.session) {
    const provider = normalizeProvider(session.agent);
    if (provider !== "claude" && provider !== "codex") continue;
    const meta =
      provider === "claude" ? claudeIndex.get(session.period) : codexIndex.get(session.period);
    if (!meta?.filePath) continue;
    effortByPeriod.set(
      session.period,
      provider === "claude"
        ? await scanClaudeEffortTokens(meta.filePath)
        : await scanCodexEffortTokens(meta.filePath),
    );
  }

  const tx = db.transaction(() => {
    for (const session of report!.session) {
      const provider = normalizeProvider(session.agent);
      if (provider !== "claude" && provider !== "codex") continue;

      let cwd: string | null = null;
      if (provider === "claude") {
        cwd = claudeIndex.get(session.period)?.cwd ?? null;
      } else {
        cwd = codexIndex.get(session.period)?.cwd ?? null;
      }

      const identity = resolveProjectIdentity(cwd, config);
      const projectId = upsertProject(db, config, identity.canonicalPath, identity.name);
      projectsUpserted += 1;

      const lastActivity = session.metadata?.lastActivity ?? null;
      const attributionDate = isBaseline ? (localDateFromIso(lastActivity, tz) ?? today) : today;

      const sessionId = upsertSession(
        db,
        provider,
        session.period,
        projectId,
        cwd ?? identity.cwd,
        null,
        lastActivity,
        session.modelsUsed ?? [],
      );
      sessionsUpserted += 1;
      usageRowsTouched += applySessionUsage(
        db,
        sessionId,
        provider,
        session,
        attributionDate,
        isBaseline,
        effortByPeriod.get(session.period),
      );
    }

    setMeta(db, "source_fingerprint", fingerprint);
    setMeta(db, "last_sync_at", nowIso());
    if (isBaseline) setMeta(db, "baseline_complete", "1");
  });

  tx();

  // Lightweight milestone scan on recent session files (git commits, model/effort markers).
  try {
    const { ingestMilestones } = await import("./milestones.js");
    await ingestMilestones({ db, maxFiles: 15 });
  } catch {
    // non-fatal
  }

  return {
    skipped: false,
    fingerprint,
    sessionsUpserted,
    usageRowsTouched,
    projectsUpserted,
    durationMs: Date.now() - started,
    message: isBaseline
      ? `Initial import complete (${sessionsUpserted} sessions)`
      : `Synced ${sessionsUpserted} sessions`,
  };
}
