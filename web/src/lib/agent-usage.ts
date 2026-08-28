import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type {
  ExecutionPlanSummary,
  JitHarnessRecord,
  RecommendReport,
  ReviewResult,
  SnapshotPayload,
} from './types';
import { SNAPSHOT_DIR } from './paths';

const execFileAsync = promisify(execFile);

const CLI_TIMEOUT_MS = 180_000;

export function resolveCliPath(): string {
  if (process.env.AGENT_USAGE_CLI) return process.env.AGENT_USAGE_CLI;

  const candidates = [
    join(process.cwd(), '..', 'dist', 'cli.js'),
    join(process.cwd(), 'dist', 'cli.js'),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new Error(
    'Could not find agent-usage CLI. Set AGENT_USAGE_CLI or run from the agent-usage repo.',
  );
}

export async function runAgentUsage(args: string[]): Promise<{ stdout: string; durationMs: number }> {
  const cliPath = resolveCliPath();
  const started = Date.now();
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: process.env,
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { stdout, durationMs: Date.now() - started };
}

function parseSnapshotFile(path: string): SnapshotPayload {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as SnapshotPayload;
  if (!raw.report || !raw.snapshotDate) {
    throw new Error(`Invalid snapshot JSON: ${path}`);
  }
  return raw;
}

export function listSnapshotFiles(): string[] {
  if (!existsSync(SNAPSHOT_DIR)) return [];
  return readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(SNAPSHOT_DIR, f));
}

export function readSnapshotByDate(date: string): SnapshotPayload | null {
  const path = join(SNAPSHOT_DIR, `${date}.json`);
  if (!existsSync(path)) return null;
  return parseSnapshotFile(path);
}

export function readLatestSnapshot(): { snapshot: SnapshotPayload; path: string } | null {
  const files = listSnapshotFiles();
  if (files.length === 0) return null;

  const ranked = files
    .map((path) => {
      const name = path.split('/').pop()?.replace('.json', '') ?? '';
      const st = statSync(path);
      return { path, name, mtime: st.mtimeMs };
    })
    .sort((a, b) => {
      if (a.name !== b.name) return b.name.localeCompare(a.name);
      return b.mtime - a.mtime;
    });

  const best = ranked[0];
  return { snapshot: parseSnapshotFile(best.path), path: best.path };
}

export async function reloadSnapshot(): Promise<{
  snapshot: SnapshotPayload | null;
  message: string;
  durationMs: number;
}> {
  const { stdout, durationMs } = await runAgentUsage(['snapshot']);
  const loaded = readLatestSnapshot();
  const message = stdout.trim().split('\n').find(Boolean) ?? 'Snapshot complete';
  return { snapshot: loaded?.snapshot ?? null, message, durationMs };
}

interface ReviewCommandResult {
  date: string;
  review: ReviewResult;
  jsonPath?: string;
  txtPath?: string;
}

function parseReviewJson(stdout: string): ReviewCommandResult {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('Review command did not return JSON.');
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as ReviewCommandResult;
}

export async function generateReview(): Promise<{
  snapshot: SnapshotPayload | null;
  review: ReviewResult;
  message: string;
  durationMs: number;
}> {
  const { stdout, durationMs } = await runAgentUsage(['review', '--json']);
  const result = parseReviewJson(stdout);
  const fromDisk = readSnapshotByDate(result.date) ?? readLatestSnapshot()?.snapshot ?? null;
  const snapshot = fromDisk ? { ...fromDisk, review: result.review } : null;
  const message = `Review saved (${result.review.model})`;
  return { snapshot, review: result.review, message, durationMs };
}

function parseRecommendJson(stdout: string): RecommendReport {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('Recommend command did not return JSON.');
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as RecommendReport;
}

export async function fetchRecommendReport(opts?: {
  period?: 'today' | 'week';
  sync?: boolean;
}): Promise<{ report: RecommendReport; durationMs: number }> {
  const period = opts?.period ?? 'today';
  const args = ['recommend', period, '--json'];
  if (!opts?.sync) args.push('--no-sync');
  const { stdout, durationMs } = await runAgentUsage(args);
  return { report: parseRecommendJson(stdout), durationMs };
}

export async function listJitHarnesses(): Promise<JitHarnessRecord[]> {
  const { stdout } = await runAgentUsage(['jit', 'list', '--json']);
  return JSON.parse(stdout.trim()) as JitHarnessRecord[];
}

export async function getJitHarness(id: string): Promise<{
  record: JitHarnessRecord;
  compilation?: { plan: ExecutionPlanSummary; compiledAt: string };
}> {
  const { stdout } = await runAgentUsage(['jit', 'show', id, '--json']);
  const data = JSON.parse(stdout.trim()) as {
    record: JitHarnessRecord;
    compilation?: { plan: ExecutionPlanSummary; compiledAt: string };
  };
  return data;
}

export async function generateJitHarness(task: string): Promise<{
  harnessId: string;
  record: JitHarnessRecord | null;
  plan: ExecutionPlanSummary;
  durationMs: number;
}> {
  const started = Date.now();
  const { stdout } = await runAgentUsage(['jit', 'generate', task, '--json']);
  const data = JSON.parse(stdout.trim()) as {
    harnessId: string;
    record: JitHarnessRecord | null;
    plan: ExecutionPlanSummary;
  };
  return { ...data, durationMs: Date.now() - started };
}
