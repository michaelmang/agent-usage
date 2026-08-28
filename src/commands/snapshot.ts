import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, setMeta } from "../db/schema.js";
import { syncUsage } from "../ingest/sync.js";
import { loadConfig } from "../config.js";
import { SNAPSHOT_DIR } from "../paths.js";
import { formatReportText } from "../report/format.js";
import { buildReport, rangeToday } from "../report/queries.js";
import { localDate, nowIso } from "../util/format.js";
import { createRequire } from "node:module";

function packageVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

import { notifyUsageSnapshot } from "../util/notify.js";
import { runDailyReview } from "./review.js";
import type { ReviewResult } from "../review/types.js";

export async function takeSnapshot(opts?: {
  json?: boolean;
  notify?: boolean;
  review?: boolean;
}): Promise<{
  date: string;
  jsonPath: string;
  txtPath: string;
  syncMessage: string;
  notifyMessage?: string;
  review?: ReviewResult;
  reviewMessage?: string;
}> {
  const sync = await syncUsage({ force: true });
  const config = loadConfig();
  const date = localDate(new Date(), config.timezone);
  const range = rangeToday(config.timezone);
  const report = buildReport(`Agent Usage — ${date}`, range.from, range.to);
  const db = getDb();
  const capturedAt = nowIso();
  const version = packageVersion();

  db.prepare(
    `INSERT INTO snapshots(snapshot_date, captured_at, source_version, notes)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(snapshot_date) DO UPDATE SET
       captured_at = excluded.captured_at,
       source_version = excluded.source_version,
       notes = excluded.notes`,
  ).run(date, capturedAt, version, sync.message);

  setMeta(db, "last_snapshot_at", capturedAt);

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const jsonPath = join(SNAPSHOT_DIR, `${date}.json`);
  const txtPath = join(SNAPSHOT_DIR, `${date}.txt`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        snapshotDate: date,
        capturedAt,
        version,
        sync,
        report,
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(txtPath, formatReportText(report) + "\n", "utf8");

  let notifyMessage: string | undefined;
  if (opts?.notify) {
    const notify = notifyUsageSnapshot({ date, file: jsonPath });
    notifyMessage = notify.message;
    if (!notify.ok) {
      notifyMessage = `Notification skipped: ${notify.message}`;
    }
  }

  let review: ReviewResult | undefined;
  let reviewMessage: string | undefined;
  if (opts?.review) {
    try {
      const reviewResult = await runDailyReview({ date, sync: false, write: true });
      review = reviewResult.review;
      reviewMessage = `Review saved (${review.model})`;
    } catch (err) {
      reviewMessage = `Review skipped: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (opts?.json) {
    // caller handles json output of snapshot meta
  }

  return { date, jsonPath, txtPath, syncMessage: sync.message, notifyMessage, review, reviewMessage };
}
