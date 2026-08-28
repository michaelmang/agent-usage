import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DATA_DIR, DB_PATH } from "../paths.js";

export type Provider = "claude" | "codex" | "cursor" | "other";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client TEXT,
  contract_value REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  cwd TEXT,
  started_at TEXT,
  ended_at TEXT,
  models TEXT,
  UNIQUE(provider, provider_session_id)
);

CREATE TABLE IF NOT EXISTS session_totals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_create_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  api_equivalent_cost REAL NOT NULL DEFAULT 0,
  last_activity TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, model)
);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  effort TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_create_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  api_equivalent_cost REAL NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL,
  UNIQUE(session_id, date, model, effort)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL UNIQUE,
  captured_at TEXT NOT NULL,
  source_version TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_session_id TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  git_sha TEXT,
  git_branch TEXT,
  git_subject TEXT,
  model TEXT,
  effort TEXT,
  cumulative_input_tokens INTEGER,
  cumulative_output_tokens INTEGER,
  api_equivalent_cost REAL,
  metadata TEXT,
  UNIQUE(provider, provider_session_id, kind, occurred_at, git_sha, model)
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_date ON milestones(occurred_at);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_date ON usage(date);
CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage(provider);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);
CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(canonical_path);
`;

let dbInstance: Database.Database | null = null;

export function ensureDataDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

export function openDb(path = DB_PATH): Database.Database {
  ensureDataDirs();
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(SCHEMA);
  migrateUsageEffort(db);
  migrateJitTables(db);
  return db;
}

function migrateJitTables(db: Database.Database): void {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='jit_harnesses'`)
    .get();
  if (tables) return;

  db.exec(`
    CREATE TABLE jit_harnesses (
      id TEXT PRIMARY KEY,
      recommendation_id TEXT,
      project_id INTEGER REFERENCES projects(id),
      created_at TEXT NOT NULL,
      jit_level TEXT NOT NULL,
      runtime TEXT NOT NULL,
      runtime_version TEXT,
      model TEXT NOT NULL,
      effort TEXT,
      spec_version INTEGER NOT NULL,
      spec_json TEXT NOT NULL,
      generated_spec_json TEXT,
      final_spec_json TEXT,
      manual_override INTEGER NOT NULL DEFAULT 0,
      generation_model TEXT,
      generation_effort TEXT,
      generation_input_tokens INTEGER,
      generation_output_tokens INTEGER,
      generation_actual_cost REAL,
      generation_duration_ms INTEGER,
      generation_rationale TEXT,
      task_recommendation_json TEXT,
      status TEXT NOT NULL DEFAULT 'generated'
    );

    CREATE TABLE jit_compilations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jit_harness_id TEXT NOT NULL REFERENCES jit_harnesses(id) ON DELETE CASCADE,
      compiled_at TEXT NOT NULL,
      runtime TEXT NOT NULL,
      runtime_version TEXT,
      execution_plan_json TEXT NOT NULL,
      native_control_count INTEGER NOT NULL DEFAULT 0,
      prompt_control_count INTEGER NOT NULL DEFAULT 0,
      wrapper_control_count INTEGER NOT NULL DEFAULT 0,
      unsupported_control_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE jit_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jit_harness_id TEXT NOT NULL REFERENCES jit_harnesses(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      provider_session_id TEXT,
      status TEXT NOT NULL,
      exit_code INTEGER,
      execution_tokens INTEGER,
      execution_api_equivalent_cost REAL,
      actual_credit_cost REAL,
      commit_count INTEGER,
      first_commit_at TEXT,
      associated_commit_ids TEXT,
      human_interventions INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      dry_run INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_jit_harnesses_created ON jit_harnesses(created_at);
    CREATE INDEX idx_jit_compilations_harness ON jit_compilations(jit_harness_id);
    CREATE INDEX idx_jit_runs_harness ON jit_runs(jit_harness_id);
  `);
}

function migrateUsageEffort(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(usage)`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === "effort")) return;

  db.exec(`
    CREATE TABLE usage_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      effort TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_create_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      api_equivalent_cost REAL NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL,
      UNIQUE(session_id, date, model, effort)
    );
    INSERT INTO usage_migrated(
      id, session_id, date, provider, model, effort,
      input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
      total_tokens, api_equivalent_cost, captured_at
    )
    SELECT
      id, session_id, date, provider, model, '',
      input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
      total_tokens, api_equivalent_cost, captured_at
    FROM usage;
    DROP TABLE usage;
    ALTER TABLE usage_migrated RENAME TO usage;
    CREATE INDEX IF NOT EXISTS idx_usage_date ON usage(date);
    CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage(provider);
  `);
  db.prepare(
    `INSERT INTO meta(key, value) VALUES ('baseline_complete', '0')
     ON CONFLICT(key) DO UPDATE SET value = '0'`,
  ).run();
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = openDb();
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function getMeta(db: Database.Database, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as
    { value: string } | undefined;
  return row?.value;
}
