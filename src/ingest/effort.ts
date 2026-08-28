import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";

/** model -> effort -> token weight from session JSONL */
export type EffortTokenMap = Map<string, Map<string, number>>;

function addWeight(map: EffortTokenMap, model: string, effort: string, weight: number): void {
  if (weight <= 0 || !model) return;
  const key = effort || "default";
  let byEffort = map.get(model);
  if (!byEffort) {
    byEffort = new Map();
    map.set(model, byEffort);
  }
  byEffort.set(key, (byEffort.get(key) ?? 0) + weight);
}

function claudeUsageWeight(usage: Record<string, number> | undefined): number {
  if (!usage) return 0;
  return (
    (usage.input_tokens ?? 0) +
    (usage.output_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

export async function scanClaudeEffortTokens(filePath: string): Promise<EffortTokenMap> {
  const map: EffortTokenMap = new Map();
  if (!existsSync(filePath)) return map;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (obj.type !== "assistant") continue;
    const msg = obj.message as Record<string, unknown> | undefined;
    const model = msg && typeof msg.model === "string" ? msg.model : null;
    if (!model) continue;
    const effort = typeof obj.effort === "string" ? obj.effort : "";
    const usage = msg?.usage as Record<string, number> | undefined;
    addWeight(map, model, effort, claudeUsageWeight(usage));
  }
  return map;
}

export async function scanCodexEffortTokens(filePath: string): Promise<EffortTokenMap> {
  const map: EffortTokenMap = new Map();
  if (!existsSync(filePath)) return map;

  let currentModel = "";
  let currentEffort = "";
  let lastTotals: { input: number; output: number } | null = null;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const payload = obj.payload as Record<string, unknown> | undefined;
    if (!payload) continue;

    if (obj.type === "event_msg" && payload.type === "thread_settings_applied") {
      const settings = payload.thread_settings as Record<string, unknown> | undefined;
      if (typeof settings?.model === "string") currentModel = settings.model;
      if (typeof settings?.reasoning_effort === "string") {
        currentEffort = settings.reasoning_effort;
      }
      lastTotals = null;
      continue;
    }

    if (obj.type === "event_msg" && payload.type === "token_count") {
      const info = payload.info as Record<string, unknown> | undefined;
      const total = info?.total_token_usage as Record<string, number> | undefined;
      if (!total || !currentModel) continue;
      const input = total.input_tokens ?? 0;
      const output = total.output_tokens ?? 0;
      const cumulative = input + output;
      const prev = lastTotals ? lastTotals.input + lastTotals.output : 0;
      const delta = cumulative - prev;
      if (delta > 0) {
        addWeight(map, currentModel, currentEffort, delta);
      }
      lastTotals = { input, output };
    }
  }
  return map;
}

export function effortSharesForModel(
  map: EffortTokenMap,
  model: string,
): Array<{ effort: string; share: number }> {
  const byEffort = map.get(model);
  if (!byEffort || byEffort.size === 0) {
    return [{ effort: "", share: 1 }];
  }
  const total = [...byEffort.values()].reduce((s, w) => s + w, 0);
  if (total <= 0) return [{ effort: "", share: 1 }];
  return [...byEffort.entries()].map(([effort, weight]) => ({
    effort: effort === "default" ? "" : effort,
    share: weight / total,
  }));
}
