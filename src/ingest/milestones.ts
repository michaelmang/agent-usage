import { createReadStream, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import type Database from "better-sqlite3";
import { getDb, getMeta } from "../db/schema.js";
import { listClaudeSessionFiles, listCodexSessionFiles } from "../util/fingerprint.js";
import { mergeCommitSubjects, nowIso } from "../util/format.js";
import { readCachedReport, type ModelBreakdown } from "./ccusage.js";
import {
  addTotals,
  cloneModelMap,
  costFromTokenDeltas,
  deltaTokensByModel,
  emptyTotals,
  type TokenTotals,
} from "./milestone-cost.js";

export interface MilestoneRecord {
  provider: "claude" | "codex";
  providerSessionId: string;
  occurredAt: string;
  kind: "git_commit" | "model_change";
  gitSha?: string;
  gitBranch?: string;
  gitSubject?: string;
  model?: string;
  effort?: string;
  cumulativeInputTokens?: number;
  cumulativeOutputTokens?: number;
  apiEquivalentCost?: number;
}

interface MilestoneScanState {
  lastModelKey: string;
  tokensByModel: Map<string, TokenTotals>;
  atLastCommit: Map<string, TokenTotals>;
  breakdowns: ModelBreakdown[];
  codexModel: string;
  codexEffort: string;
  codexLastInput: number;
  codexLastOutput: number;
}

function createScanState(breakdowns: ModelBreakdown[]): MilestoneScanState {
  return {
    lastModelKey: "",
    tokensByModel: new Map(),
    atLastCommit: new Map(),
    breakdowns,
    codexModel: "",
    codexEffort: "",
    codexLastInput: 0,
    codexLastOutput: 0,
  };
}

function commitCost(state: MilestoneScanState): number {
  const deltas = deltaTokensByModel(state.tokensByModel, state.atLastCommit);
  const cost = costFromTokenDeltas(deltas, state.breakdowns);
  state.atLastCommit = cloneModelMap(state.tokensByModel);
  return cost;
}

function trackClaudeUsage(
  state: MilestoneScanState,
  model: string,
  usage: Record<string, number> | undefined,
): void {
  if (!model || !usage) return;
  const prev = state.tokensByModel.get(model) ?? emptyTotals();
  state.tokensByModel.set(
    model,
    addTotals(prev, {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheCreate: usage.cache_creation_input_tokens,
      cacheRead: usage.cache_read_input_tokens,
    }),
  );
}

const GIT_SHA_IN_OUTPUT = /\b([0-9a-f]{7,40})\b/i;
const GIT_COMMIT_SUCCESS = /\[[\w./-]+ ([0-9a-f]{7,40})\]/i;

function commandRunsGitCommit(command: string): boolean {
  return command
    .split(/[\n;&|]+/)
    .some((segment) => /^\s*git\s+commit(?:\s|$|-)/i.test(segment.trim()));
}

function extractBashCommandsFromAssistant(msg: Record<string, unknown> | undefined): string[] {
  if (!msg) return [];
  const content = msg.content;
  if (!Array.isArray(content)) return [];
  const commands: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const item = block as Record<string, unknown>;
    if (item.type !== "tool_use") continue;
    const input = item.input as Record<string, unknown> | undefined;
    if (typeof input?.command === "string") commands.push(input.command);
  }
  return commands;
}

function gitSubjectFromCommand(command: string): string | undefined {
  const heredoc = command.match(/git\s+commit[^\n]*-m\s*"\$\(cat\s+<<'?EOF'?\n([\s\S]*?)\nEOF/mi);
  if (heredoc?.[1]) return heredoc[1].split("\n")[0]?.trim().slice(0, 120);
  const quoted = command.match(/git\s+commit[^\n]*-m\s+["']([^"']+)/i);
  if (quoted?.[1]) return quoted[1].slice(0, 120);
  return undefined;
}

function parseClaudeLine(
  line: string,
  state?: MilestoneScanState,
): MilestoneRecord[] {
  const out: MilestoneRecord[] = [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return out;
  }

  const sessionId = typeof obj.sessionId === "string" ? obj.sessionId : null;
  const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;
  if (!sessionId || !ts) return out;

  const gitBranch = typeof obj.gitBranch === "string" ? obj.gitBranch : undefined;
  const effort = typeof obj.effort === "string" ? obj.effort : undefined;

  const msg = obj.message as Record<string, unknown> | undefined;
  const model = msg && typeof msg.model === "string" ? msg.model : undefined;
  const usage = msg?.usage as Record<string, number> | undefined;

  if (obj.type === "assistant" && model && state) {
    trackClaudeUsage(state, model, usage);
  }

  if (obj.type === "assistant" && model && state) {
    const modelKey = `${model}|${effort ?? ""}`;
    if (modelKey !== state.lastModelKey) {
      state.lastModelKey = modelKey;
      out.push({
        provider: "claude",
        providerSessionId: sessionId,
        occurredAt: ts,
        kind: "model_change",
        gitBranch,
        model,
        effort,
        cumulativeInputTokens: usage?.input_tokens,
        cumulativeOutputTokens: usage?.output_tokens,
      });
    }
  }

  const toolResult = obj.toolUseResult as Record<string, unknown> | undefined;
  const toolStdout = typeof toolResult?.stdout === "string" ? toolResult.stdout : "";

  if (obj.type === "assistant") {
    for (const bashCmd of extractBashCommandsFromAssistant(msg)) {
      if (!commandRunsGitCommit(bashCmd)) continue;
      const cost = state ? commitCost(state) : undefined;
      out.push({
        provider: "claude",
        providerSessionId: sessionId,
        occurredAt: ts,
        kind: "git_commit",
        gitBranch,
        gitSubject: gitSubjectFromCommand(bashCmd),
        model,
        effort,
        cumulativeInputTokens: usage?.input_tokens,
        cumulativeOutputTokens: usage?.output_tokens,
        apiEquivalentCost: cost,
      });
    }
  }

  if (obj.type === "user" && GIT_COMMIT_SUCCESS.test(toolStdout)) {
    const shaMatch = toolStdout.match(GIT_COMMIT_SUCCESS) ?? toolStdout.match(GIT_SHA_IN_OUTPUT);
    out.push({
      provider: "claude",
      providerSessionId: sessionId,
      occurredAt: ts,
      kind: "git_commit",
      gitBranch,
      gitSha: shaMatch?.[1],
      gitSubject: toolStdout.split("\n").find((l) => l.trim() && !l.startsWith("["))?.slice(0, 120),
      model,
      effort,
      cumulativeInputTokens: usage?.input_tokens,
      cumulativeOutputTokens: usage?.output_tokens,
    });
  }

  return out;
}

function parseCodexLine(line: string, sessionId: string, state?: MilestoneScanState): MilestoneRecord[] {
  const out: MilestoneRecord[] = [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return out;
  }

  const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;
  if (!ts) return out;
  const payload = obj.payload as Record<string, unknown> | undefined;
  if (!payload) return out;

  if (obj.type === "event_msg" && payload.type === "thread_settings_applied") {
    const settings = payload.thread_settings as Record<string, unknown> | undefined;
    if (state) {
      if (typeof settings?.model === "string") state.codexModel = settings.model;
      if (typeof settings?.reasoning_effort === "string") {
        state.codexEffort = settings.reasoning_effort;
      }
      state.codexLastInput = 0;
      state.codexLastOutput = 0;
    }
    out.push({
      provider: "codex",
      providerSessionId: sessionId,
      occurredAt: ts,
      kind: "model_change",
      model: typeof settings?.model === "string" ? settings.model : undefined,
      effort:
        typeof settings?.reasoning_effort === "string" ? settings.reasoning_effort : undefined,
    });
  }

  if (obj.type === "event_msg" && payload.type === "token_count" && state?.codexModel) {
    const info = payload.info as Record<string, unknown> | undefined;
    const total = info?.total_token_usage as Record<string, number> | undefined;
    if (total) {
      const input = total.input_tokens ?? 0;
      const output = total.output_tokens ?? 0;
      const dInput = Math.max(0, input - state.codexLastInput);
      const dOutput = Math.max(0, output - state.codexLastOutput);
      if (dInput + dOutput > 0) {
        const prev = state.tokensByModel.get(state.codexModel) ?? emptyTotals();
        state.tokensByModel.set(
          state.codexModel,
          addTotals(prev, { input: dInput, output: dOutput }),
        );
      }
      state.codexLastInput = input;
      state.codexLastOutput = output;
    }
  }

  if (obj.type === "event_msg" && payload.type === "item_completed") {
    const item = payload.item as Record<string, unknown> | undefined;
    if (item?.type === "CommandExecution") {
      const cmd = Array.isArray(item.command) ? item.command.join(" ") : String(item.command ?? "");
      const stdout = typeof item.stdout === "string" ? item.stdout : "";
      if (commandRunsGitCommit(cmd)) {
        const shaMatch = stdout.match(/\[.*?([0-9a-f]{7,40})\]/i) ?? stdout.match(GIT_SHA_IN_OUTPUT);
        const cost = state ? commitCost(state) : undefined;
        out.push({
          provider: "codex",
          providerSessionId: sessionId,
          occurredAt: ts,
          kind: "git_commit",
          gitSha: shaMatch?.[1],
          gitSubject: stdout.split("\n").find((l) => l.trim())?.slice(0, 120),
          model: state?.codexModel,
          effort: state?.codexEffort,
          apiEquivalentCost: cost,
        });
      }
    }
  }

  return out;
}

async function scanJsonl(
  filePath: string,
  parser: (line: string, sessionId: string, state?: MilestoneScanState) => MilestoneRecord[],
  sessionId: string,
  breakdowns: ModelBreakdown[],
  sinceLine = 0,
): Promise<{ records: MilestoneRecord[]; linesRead: number }> {
  const records: MilestoneRecord[] = [];
  if (!existsSync(filePath)) return { records, linesRead: sinceLine };

  const state = createScanState(breakdowns);
  const stream = createReadStream(filePath, { encoding: "utf8", start: 0 });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1;
    if (lineNo <= sinceLine) continue;
    if (!line.trim()) continue;
    records.push(...parser(line, sessionId, state));
  }
  return { records, linesRead: lineNo };
}

export function upsertMilestones(db: Database.Database, records: MilestoneRecord[]): number {
  const findSession = db.prepare(
    `SELECT s.id, s.project_id FROM sessions s
     WHERE s.provider = ? AND s.provider_session_id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO milestones(
       session_id, provider, provider_session_id, project_id, occurred_at, kind,
       git_sha, git_branch, git_subject, model, effort,
       cumulative_input_tokens, cumulative_output_tokens, api_equivalent_cost, metadata
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(provider, provider_session_id, kind, occurred_at, git_sha, model)
     DO UPDATE SET
       api_equivalent_cost = COALESCE(excluded.api_equivalent_cost, milestones.api_equivalent_cost),
       git_subject = CASE
         WHEN excluded.git_subject IS NOT NULL AND excluded.git_subject != ''
         THEN excluded.git_subject ELSE milestones.git_subject END,
       git_sha = CASE
         WHEN excluded.git_sha IS NOT NULL AND excluded.git_sha != ''
         THEN excluded.git_sha ELSE milestones.git_sha END,
       effort = COALESCE(NULLIF(excluded.effort, ''), milestones.effort)`,
  );

  let inserted = 0;
  for (const r of records) {
    const session = findSession.get(r.provider, r.providerSessionId) as
      | { id: number; project_id: number | null }
      | undefined;
    const info = insert.run(
      session?.id ?? null,
      r.provider,
      r.providerSessionId,
      session?.project_id ?? null,
      r.occurredAt,
      r.kind,
      r.gitSha ?? "",
      r.gitBranch ?? null,
      r.gitSubject ?? null,
      r.model ?? "",
      r.effort ?? null,
      r.cumulativeInputTokens ?? null,
      r.cumulativeOutputTokens ?? null,
      r.apiEquivalentCost ?? null,
    );
    inserted += info.changes;
  }
  return inserted;
}

function breakdownsForSession(
  breakdownByPeriod: Map<string, ModelBreakdown[]>,
  sessionId: string,
): ModelBreakdown[] {
  return breakdownByPeriod.get(sessionId) ?? [];
}

function loadBreakdownIndex(db: Database.Database): Map<string, ModelBreakdown[]> {
  const fingerprint = getMeta(db, "source_fingerprint");
  if (!fingerprint) return new Map();
  const report = readCachedReport(fingerprint);
  if (!report) return new Map();
  const map = new Map<string, ModelBreakdown[]>();
  for (const session of report.session) {
    map.set(session.period, session.modelBreakdowns ?? []);
  }
  return map;
}

export async function ingestMilestones(opts?: {
  db?: Database.Database;
  maxFiles?: number;
}): Promise<{ scanned: number; inserted: number }> {
  const db = opts?.db ?? getDb();
  const maxFiles = opts?.maxFiles ?? 30;
  let scanned = 0;
  let inserted = 0;
  const breakdownByPeriod = loadBreakdownIndex(db);

  const claudeFiles = listClaudeSessionFiles()
    .filter((f) => !f.includes("/subagents/"))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, maxFiles);

  for (const file of claudeFiles) {
    const sessionId = file.split("/").pop()?.replace(".jsonl", "") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) continue;
    const { records } = await scanJsonl(
      file,
      (line, _sid, state) => parseClaudeLine(line, state),
      sessionId,
      breakdownsForSession(breakdownByPeriod, sessionId),
    );
    inserted += upsertMilestones(db, records);
    scanned += 1;
  }

  const codexFiles = listCodexSessionFiles()
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, maxFiles);

  for (const file of codexFiles) {
    const rel = file.split("/sessions/")[1]?.replace(".jsonl", "") ?? "";
    const { records } = await scanJsonl(
      file,
      (line, sid, state) => parseCodexLine(line, sid, state),
      rel,
      breakdownsForSession(breakdownByPeriod, rel),
    );
    inserted += upsertMilestones(db, records);
    scanned += 1;
  }

  setMeta(db, "milestones_sync_at", nowIso());
  return { scanned, inserted };
}

function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function listMilestones(
  db: Database.Database,
  opts?: { projectId?: number; limit?: number; kind?: "git_commit" | "model_change" },
) {
  const limit = opts?.limit ?? 50;
  const kindFilter = opts?.kind ? " AND m.kind = ?" : "";
  const kindParam = opts?.kind ? [opts.kind] : [];

  const select = `SELECT m.occurred_at AS occurredAt, m.kind, m.git_sha AS gitSha,
              m.git_branch AS gitBranch, m.git_subject AS gitSubject,
              m.model, m.effort, m.cumulative_input_tokens AS inputTokens,
              m.cumulative_output_tokens AS outputTokens,
              m.api_equivalent_cost AS apiEquivalentCost,
              p.name AS projectName, m.provider,
              m.provider_session_id AS providerSessionId`;

  if (opts?.projectId != null) {
    return db
      .prepare(
        `${select}
         FROM milestones m
         LEFT JOIN projects p ON p.id = m.project_id
         WHERE m.project_id = ?${kindFilter}
         ORDER BY m.occurred_at DESC
         LIMIT ?`,
      )
      .all(opts.projectId, ...kindParam, limit);
  }
  return db
    .prepare(
      `${select}
       FROM milestones m
       LEFT JOIN projects p ON p.id = m.project_id
       WHERE 1=1${kindFilter}
       ORDER BY m.occurred_at DESC
       LIMIT ?`,
    )
    .all(...kindParam, limit);
}

export interface CommitMilestoneRow {
  occurredAt: string;
  kind: string;
  gitSha?: string | null;
  gitBranch?: string | null;
  gitSubject?: string | null;
  model?: string | null;
  effort?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  apiEquivalentCost?: number | null;
  projectName?: string | null;
  provider: string;
}

/** Merge assistant command rows (subject, model, cost) with stdout rows (sha). */
export function consolidateCommitMilestones(rows: CommitMilestoneRow[]): CommitMilestoneRow[] {
  const sorted = [...rows].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  const used = new Set<number>();
  const out: CommitMilestoneRow[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const row = sorted[i];
    let partner: CommitMilestoneRow | undefined;
    let partnerIdx = -1;

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const other = sorted[j];
      if (other.provider !== row.provider) continue;
      if (other.projectName !== row.projectName) continue;
      const dt = Math.abs(
        new Date(String(row.occurredAt)).getTime() - new Date(String(other.occurredAt)).getTime(),
      );
      if (dt > 120_000) continue;
      partner = other;
      partnerIdx = j;
      break;
    }

    if (partnerIdx >= 0) used.add(partnerIdx);

    const merged: CommitMilestoneRow = { ...row };
    if (partner) {
      merged.gitSha = merged.gitSha || partner.gitSha;
      merged.gitSubject = mergeCommitSubjects(merged.gitSubject, partner.gitSubject);
      merged.model = merged.model || partner.model;
      merged.effort = merged.effort || partner.effort;
      merged.apiEquivalentCost =
        merged.apiEquivalentCost && merged.apiEquivalentCost > 0
          ? merged.apiEquivalentCost
          : partner.apiEquivalentCost;
    }

    if (merged.gitSubject || merged.gitSha) {
      out.push(merged);
    }
    used.add(i);
  }

  return out;
}

export { commandRunsGitCommit, gitSubjectFromCommand };

export function parseClaudeLineForTest(line: string, state: MilestoneScanState) {
  return parseClaudeLine(line, state);
}

export { createScanState };
