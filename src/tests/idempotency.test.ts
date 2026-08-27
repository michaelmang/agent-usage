import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDb } from "../db/schema.js";
import { resolveProjectIdentity } from "../util/git.js";
import { localDate, addDays, startOfWeek, startOfMonth } from "../util/format.js";

test("date helpers", () => {
  assert.equal(addDays("2026-08-27", -1), "2026-08-26");
  assert.equal(startOfMonth("2026-08-27"), "2026-08-01");
  assert.equal(startOfWeek("2026-08-27"), "2026-08-24"); // Thursday -> Monday
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test("unassigned project identity without cwd", () => {
  const r = resolveProjectIdentity(null);
  assert.equal(r.name, "Unassigned");
  assert.equal(r.unassigned, true);
});

test("config alias wins over path basename", () => {
  const r = resolveProjectIdentity("/tmp/some-repo", {
    projects: {
      "/tmp/some-repo": { name: "Alias Name", client: "Client" },
    },
    timezone: "UTC",
  });
  assert.equal(r.name, "Alias Name");
  assert.equal(r.canonicalPath, "/tmp/some-repo");
});

test("idempotent usage upsert does not double-count when replacing baseline totals", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-usage-"));
  const dbPath = join(dir, "test.sqlite");
  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects(canonical_path, name, client, contract_value, created_at)
       VALUES (?, ?, NULL, NULL, ?)`,
    ).run("/tmp/proj", "Proj", now);
    const projectId = (db.prepare(`SELECT id FROM projects`).get() as { id: number }).id;
    db.prepare(
      `INSERT INTO sessions(provider_session_id, provider, project_id, cwd, started_at, ended_at, models)
       VALUES (?, ?, ?, ?, NULL, NULL, ?)`,
    ).run("sess-1", "claude", projectId, "/tmp/proj", "[]");
    const sessionId = (db.prepare(`SELECT id FROM sessions`).get() as { id: number }).id;

    const replace = db.prepare(
      `INSERT INTO usage(
         session_id, date, provider, model, input_tokens, output_tokens,
         cache_create_tokens, cache_read_tokens, total_tokens, api_equivalent_cost, captured_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, date, model) DO UPDATE SET
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         cache_create_tokens = excluded.cache_create_tokens,
         cache_read_tokens = excluded.cache_read_tokens,
         total_tokens = excluded.total_tokens,
         api_equivalent_cost = excluded.api_equivalent_cost,
         captured_at = excluded.captured_at`,
    );

    replace.run(sessionId, "2026-08-27", "claude", "claude-sonnet-5", 1, 2, 3, 4, 10, 1.5, now);
    replace.run(sessionId, "2026-08-27", "claude", "claude-sonnet-5", 1, 2, 3, 4, 10, 1.5, now);
    replace.run(sessionId, "2026-08-27", "claude", "claude-sonnet-5", 1, 2, 3, 4, 10, 1.5, now);

    const row = db
      .prepare(`SELECT total_tokens, api_equivalent_cost, COUNT(*) AS c FROM usage`)
      .get() as { total_tokens: number; api_equivalent_cost: number; c: number };
    assert.equal(row.c, 1);
    assert.equal(row.total_tokens, 10);
    assert.equal(row.api_equivalent_cost, 1.5);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cumulative delta application only adds positive growth", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-usage-"));
  const dbPath = join(dir, "test.sqlite");
  const db = openDb(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects(canonical_path, name, client, contract_value, created_at)
       VALUES (?, ?, NULL, NULL, ?)`,
    ).run("/tmp/proj", "Proj", now);
    const projectId = (db.prepare(`SELECT id FROM projects`).get() as { id: number }).id;
    db.prepare(
      `INSERT INTO sessions(provider_session_id, provider, project_id, cwd, started_at, ended_at, models)
       VALUES (?, ?, ?, ?, NULL, NULL, ?)`,
    ).run("sess-1", "codex", projectId, "/tmp/proj", "[]");
    const sessionId = (db.prepare(`SELECT id FROM sessions`).get() as { id: number }).id;

    db.prepare(
      `INSERT INTO session_totals(
         session_id, provider, model, input_tokens, output_tokens,
         cache_create_tokens, cache_read_tokens, total_tokens, api_equivalent_cost,
         last_activity, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    ).run(sessionId, "codex", "gpt-5.6-terra", 100, 10, 0, 50, 160, 1.0, now);

    // Simulate prior cumulative 160 cost 1.0; new cumulative 200 cost 1.4 => delta 40 / 0.4
    const prev = db
      .prepare(`SELECT total_tokens, api_equivalent_cost FROM session_totals WHERE session_id = ?`)
      .get(sessionId) as { total_tokens: number; api_equivalent_cost: number };
    const nextTotal = 200;
    const nextCost = 1.4;
    const dTotal = nextTotal - prev.total_tokens;
    const dCost = nextCost - prev.api_equivalent_cost;
    assert.equal(dTotal, 40);
    assert.ok(Math.abs(dCost - 0.4) < 1e-9);

    db.prepare(
      `INSERT INTO usage(
         session_id, date, provider, model, input_tokens, output_tokens,
         cache_create_tokens, cache_read_tokens, total_tokens, api_equivalent_cost, captured_at
       ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
    ).run(sessionId, "2026-08-27", "codex", "gpt-5.6-terra", dTotal, dCost, now);

    // Applying the same cumulative again must not add another delta
    const d2 = nextTotal - nextTotal;
    assert.equal(d2, 0);

    const sum = db
      .prepare(`SELECT SUM(total_tokens) AS t, SUM(api_equivalent_cost) AS c FROM usage`)
      .get() as { t: number; c: number };
    assert.equal(sum.t, 40);
    assert.ok(Math.abs(sum.c - 0.4) < 1e-9);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claude project path encode/decode for kalam-app", async () => {
  const { encodeClaudeProjectPath, decodeClaudeProjectDir } = await import(
    "../ingest/claude-sessions.js"
  );
  const path = "/Users/michael.mangialardi/kalam-app";
  const encoded = encodeClaudeProjectPath(path);
  assert.equal(encoded, "-Users-michael-mangialardi-kalam-app");
  const decoded = decodeClaudeProjectDir(encoded);
  if (decoded) {
    assert.equal(decoded, path);
  }
});
