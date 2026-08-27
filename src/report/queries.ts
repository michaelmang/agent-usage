import type Database from "better-sqlite3";
import { getDb } from "../db/schema.js";
import { UNASSIGNED_NAME } from "../paths.js";
import { addDays, localDate, startOfMonth, startOfWeek } from "../util/format.js";

export interface UsageSlice {
  projectId: number | null;
  projectName: string;
  projectPath: string;
  client: string | null;
  contractValue: number | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  apiEquivalentCost: number;
}

export interface ProjectRollup {
  projectId: number | null;
  name: string;
  path: string;
  client: string | null;
  contractValue: number | null;
  totalTokens: number;
  apiEquivalentCost: number;
  providers: ProviderRollup[];
}

export interface ProviderRollup {
  provider: string;
  totalTokens: number;
  apiEquivalentCost: number;
  models: ModelRollup[];
}

export interface ModelRollup {
  model: string;
  totalTokens: number;
  apiEquivalentCost: number;
}

export interface ReportPayload {
  title: string;
  range: { from: string; to: string };
  updatedAt: string;
  projects: ProjectRollup[];
  totals: { totalTokens: number; apiEquivalentCost: number };
}

function queryUsage(
  db: Database.Database,
  from: string,
  to: string,
  projectId?: number,
): UsageSlice[] {
  const params: Array<string | number> = [from, to];
  let projectFilter = "";
  if (projectId != null) {
    projectFilter = " AND p.id = ? ";
    params.push(projectId);
  }

  return db
    .prepare(
      `SELECT
         p.id AS projectId,
         COALESCE(p.name, 'Unassigned') AS projectName,
         COALESCE(p.canonical_path, '__unassigned__') AS projectPath,
         p.client AS client,
         p.contract_value AS contractValue,
         u.provider AS provider,
         u.model AS model,
         SUM(u.input_tokens) AS inputTokens,
         SUM(u.output_tokens) AS outputTokens,
         SUM(u.cache_create_tokens) AS cacheCreateTokens,
         SUM(u.cache_read_tokens) AS cacheReadTokens,
         SUM(u.total_tokens) AS totalTokens,
         SUM(u.api_equivalent_cost) AS apiEquivalentCost
       FROM usage u
       JOIN sessions s ON s.id = u.session_id
       LEFT JOIN projects p ON p.id = s.project_id
       WHERE u.date >= ? AND u.date <= ?
       ${projectFilter}
       GROUP BY p.id, p.name, p.canonical_path, p.client, p.contract_value, u.provider, u.model`,
    )
    .all(...params) as UsageSlice[];
}

function rollupSlices(slices: UsageSlice[]): ProjectRollup[] {
  const byProject = new Map<string, ProjectRollup>();

  for (const s of slices) {
    const isUnassigned = !s.projectName || s.projectName === UNASSIGNED_NAME;
    const key = isUnassigned ? "__unassigned__" : String(s.projectId ?? s.projectPath);
    let project = byProject.get(key);
    if (!project) {
      project = {
        projectId: isUnassigned ? null : s.projectId,
        name: isUnassigned ? UNASSIGNED_NAME : s.projectName,
        path: isUnassigned ? "__unassigned__" : s.projectPath,
        client: isUnassigned ? null : s.client,
        contractValue: isUnassigned ? null : s.contractValue,
        totalTokens: 0,
        apiEquivalentCost: 0,
        providers: [],
      };
      byProject.set(key, project);
    }

    project.totalTokens += Number(s.totalTokens) || 0;
    project.apiEquivalentCost += Number(s.apiEquivalentCost) || 0;

    let provider = project.providers.find((p) => p.provider === s.provider);
    if (!provider) {
      provider = {
        provider: s.provider,
        totalTokens: 0,
        apiEquivalentCost: 0,
        models: [],
      };
      project.providers.push(provider);
    }
    provider.totalTokens += Number(s.totalTokens) || 0;
    provider.apiEquivalentCost += Number(s.apiEquivalentCost) || 0;

    let model = provider.models.find((m) => m.model === s.model);
    if (!model) {
      model = { model: s.model, totalTokens: 0, apiEquivalentCost: 0 };
      provider.models.push(model);
    }
    model.totalTokens += Number(s.totalTokens) || 0;
    model.apiEquivalentCost += Number(s.apiEquivalentCost) || 0;
  }

  for (const p of byProject.values()) {
    p.providers.sort((a, b) => b.apiEquivalentCost - a.apiEquivalentCost);
    for (const pr of p.providers) {
      pr.models.sort((a, b) => b.apiEquivalentCost - a.apiEquivalentCost);
    }
  }

  return [...byProject.values()].sort((a, b) => {
    if (a.name === UNASSIGNED_NAME) return 1;
    if (b.name === UNASSIGNED_NAME) return -1;
    return b.apiEquivalentCost - a.apiEquivalentCost;
  });
}

export function buildReport(
  title: string,
  from: string,
  to: string,
  opts?: { projectId?: number; db?: Database.Database },
): ReportPayload {
  const db = opts?.db ?? getDb();
  const slices = queryUsage(db, from, to, opts?.projectId);
  const projects = rollupSlices(slices);
  const totals = projects.reduce(
    (acc, p) => {
      acc.totalTokens += p.totalTokens;
      acc.apiEquivalentCost += p.apiEquivalentCost;
      return acc;
    },
    { totalTokens: 0, apiEquivalentCost: 0 },
  );

  return {
    title,
    range: { from, to },
    updatedAt: new Date().toISOString(),
    projects,
    totals,
  };
}

export function rangeToday(tz?: string): { from: string; to: string } {
  const d = localDate(new Date(), tz);
  return { from: d, to: d };
}

export function rangeYesterday(tz?: string): { from: string; to: string } {
  const d = addDays(localDate(new Date(), tz), -1);
  return { from: d, to: d };
}

export function rangeWeek(tz?: string): { from: string; to: string } {
  const today = localDate(new Date(), tz);
  return { from: startOfWeek(today), to: today };
}

export function rangeMonth(tz?: string): { from: string; to: string } {
  const today = localDate(new Date(), tz);
  return { from: startOfMonth(today), to: today };
}

export function findProjectId(db: Database.Database, query: string): number | undefined {
  const q = `%${query.toLowerCase()}%`;
  const row = db
    .prepare(
      `SELECT id FROM projects
       WHERE lower(name) LIKE ? OR lower(canonical_path) LIKE ?
       ORDER BY
         CASE WHEN lower(name) = lower(?) THEN 0
              WHEN lower(name) LIKE lower(?) THEN 1
              ELSE 2 END,
         length(name)
       LIMIT 1`,
    )
    .get(q, q, query, `${query.toLowerCase()}%`) as { id: number } | undefined;
  return row?.id;
}

export function listProjectsSummary(db?: Database.Database): Array<{
  name: string;
  path: string;
  today: number;
  week: number;
  month: number;
}> {
  const database = db ?? getDb();
  const today = rangeToday();
  const week = rangeWeek();
  const month = rangeMonth();

  const projects = database
    .prepare(`SELECT id, name, canonical_path AS path FROM projects ORDER BY name`)
    .all() as Array<{ id: number; name: string; path: string }>;

  const costBetween = (projectId: number, from: string, to: string): number => {
    const row = database
      .prepare(
        `SELECT COALESCE(SUM(u.api_equivalent_cost), 0) AS cost
         FROM usage u
         JOIN sessions s ON s.id = u.session_id
         WHERE s.project_id = ? AND u.date >= ? AND u.date <= ?`,
      )
      .get(projectId, from, to) as { cost: number };
    return Number(row.cost) || 0;
  };

  // Merge Unassigned-named rows
  const merged = new Map<
    string,
    { name: string; path: string; today: number; week: number; month: number }
  >();

  for (const p of projects) {
    const key = p.name === UNASSIGNED_NAME ? UNASSIGNED_NAME : String(p.id);
    const existing = merged.get(key) ?? {
      name: p.name,
      path: p.path,
      today: 0,
      week: 0,
      month: 0,
    };
    existing.today += costBetween(p.id, today.from, today.to);
    existing.week += costBetween(p.id, week.from, week.to);
    existing.month += costBetween(p.id, month.from, month.to);
    merged.set(key, existing);
  }

  return [...merged.values()].sort((a, b) => b.month - a.month);
}

export function listModelsSummary(
  from: string,
  to: string,
  db?: Database.Database,
): Array<{ model: string; totalTokens: number; apiEquivalentCost: number }> {
  const database = db ?? getDb();
  return database
    .prepare(
      `SELECT model,
              SUM(total_tokens) AS totalTokens,
              SUM(api_equivalent_cost) AS apiEquivalentCost
       FROM usage
       WHERE date >= ? AND date <= ?
       GROUP BY model
       ORDER BY apiEquivalentCost DESC`,
    )
    .all(from, to) as Array<{
    model: string;
    totalTokens: number;
    apiEquivalentCost: number;
  }>;
}

export function lifetimeForProject(
  projectId: number,
  db?: Database.Database,
): {
  totalTokens: number;
  apiEquivalentCost: number;
  providers: ProviderRollup[];
} {
  const database = db ?? getDb();
  const slices = database
    .prepare(
      `SELECT
         u.provider AS provider,
         u.model AS model,
         SUM(u.total_tokens) AS totalTokens,
         SUM(u.api_equivalent_cost) AS apiEquivalentCost
       FROM usage u
       JOIN sessions s ON s.id = u.session_id
       WHERE s.project_id = ?
       GROUP BY u.provider, u.model`,
    )
    .all(projectId) as Array<{
    provider: string;
    model: string;
    totalTokens: number;
    apiEquivalentCost: number;
  }>;

  const providers: ProviderRollup[] = [];
  let totalTokens = 0;
  let apiEquivalentCost = 0;
  for (const s of slices) {
    totalTokens += Number(s.totalTokens) || 0;
    apiEquivalentCost += Number(s.apiEquivalentCost) || 0;
    let provider = providers.find((p) => p.provider === s.provider);
    if (!provider) {
      provider = { provider: s.provider, totalTokens: 0, apiEquivalentCost: 0, models: [] };
      providers.push(provider);
    }
    provider.totalTokens += Number(s.totalTokens) || 0;
    provider.apiEquivalentCost += Number(s.apiEquivalentCost) || 0;
    provider.models.push({
      model: s.model,
      totalTokens: Number(s.totalTokens) || 0,
      apiEquivalentCost: Number(s.apiEquivalentCost) || 0,
    });
  }
  providers.sort((a, b) => b.apiEquivalentCost - a.apiEquivalentCost);
  return { totalTokens, apiEquivalentCost, providers };
}
