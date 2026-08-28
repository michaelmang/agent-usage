import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/schema.js";
import { loadConfig, type AppConfig } from "../config.js";
import { syncUsage } from "../ingest/sync.js";
import { SNAPSHOT_DIR } from "../paths.js";
import { buildReviewContext, formatReviewUserMessage } from "../review/context.js";
import { generateReviewText } from "../review/llm.js";
import { DEFAULT_REVIEW_CONFIG, type ReviewConfig, type ReviewResult } from "../review/types.js";
import { loadReviewEnvFile } from "../util/env-file.js";
import { localDate } from "../util/format.js";

function reviewConfigFromApp(config: AppConfig): ReviewConfig {
  const review = config.review;
  const provider = review?.provider === "openai" ? "openai" : "anthropic";
  return {
    provider,
    model:
      review?.model ??
      (provider === "openai" ? "gpt-4o-mini" : DEFAULT_REVIEW_CONFIG.model),
    maxTokens: review?.max_tokens ?? DEFAULT_REVIEW_CONFIG.maxTokens,
    maxCommits: review?.max_commits ?? DEFAULT_REVIEW_CONFIG.maxCommits,
  };
}

export function formatReviewSection(review: ReviewResult): string {
  return [
    "",
    "══════════════════════════════════════════════",
    "Workflow Review",
    `Generated ${review.generatedAt.slice(0, 19).replace("T", " ")} · ${review.model}`,
    "══════════════════════════════════════════════",
    "",
    review.text.trim(),
    "",
  ].join("\n");
}

export function appendReviewToSnapshotFiles(
  date: string,
  review: ReviewResult,
): { jsonPath: string; txtPath: string } {
  const jsonPath = join(SNAPSHOT_DIR, `${date}.json`);
  const txtPath = join(SNAPSHOT_DIR, `${date}.txt`);

  if (existsSync(jsonPath)) {
    const snapshot = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
    snapshot.review = review;
    writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2), "utf8");
  }

  const section = formatReviewSection(review);
  if (existsSync(txtPath)) {
    const existing = readFileSync(txtPath, "utf8");
    const marker = "Workflow Review";
    const withoutOld = existing.includes(marker)
      ? existing.slice(0, existing.indexOf("══════════════════════════════════════════════\nWorkflow Review"))
      : existing;
    writeFileSync(txtPath, withoutOld.trimEnd() + section, "utf8");
  } else {
    writeFileSync(txtPath, section.trimStart(), "utf8");
  }

  return { jsonPath, txtPath };
}

export async function runDailyReview(opts?: {
  date?: string;
  sync?: boolean;
  write?: boolean;
}): Promise<{ date: string; review: ReviewResult; jsonPath?: string; txtPath?: string }> {
  loadReviewEnvFile();
  const config = loadConfig();
  const date = opts?.date ?? localDate(new Date(), config.timezone);

  if (opts?.sync !== false) {
    await syncUsage({ force: true });
  }

  const db = getDb();
  const ctx = buildReviewContext(db, date, config.timezone);
  const reviewConfig = reviewConfigFromApp(config);
  ctx.commits = ctx.commits.slice(0, reviewConfig.maxCommits);

  const userMessage = formatReviewUserMessage(ctx);
  const review = await generateReviewText(userMessage, reviewConfig);

  let paths: { jsonPath: string; txtPath: string } | undefined;
  if (opts?.write !== false) {
    paths = appendReviewToSnapshotFiles(date, review);
  }

  return { date, review, jsonPath: paths?.jsonPath, txtPath: paths?.txtPath };
}
