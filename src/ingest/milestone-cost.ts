import type { ModelBreakdown } from "./ccusage.js";

export interface TokenTotals {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}

export function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
}

export function addTotals(a: TokenTotals, b: Partial<TokenTotals>): TokenTotals {
  return {
    input: a.input + (b.input ?? 0),
    output: a.output + (b.output ?? 0),
    cacheCreate: a.cacheCreate + (b.cacheCreate ?? 0),
    cacheRead: a.cacheRead + (b.cacheRead ?? 0),
  };
}

export function tokenWeight(t: TokenTotals): number {
  return t.input + t.output + t.cacheCreate + t.cacheRead;
}

export function cloneModelMap(map: Map<string, TokenTotals>): Map<string, TokenTotals> {
  const out = new Map<string, TokenTotals>();
  for (const [model, totals] of map) {
    out.set(model, { ...totals });
  }
  return out;
}

/** Allocate session model costs proportionally to token deltas since last commit. */
export function costFromTokenDeltas(
  deltas: Map<string, number>,
  breakdowns: ModelBreakdown[],
): number {
  let cost = 0;
  for (const b of breakdowns) {
    const delta = deltas.get(b.modelName) ?? 0;
    if (delta <= 0) continue;
    const sessionTotal =
      (b.inputTokens ?? 0) +
      (b.outputTokens ?? 0) +
      (b.cacheCreationTokens ?? 0) +
      (b.cacheReadTokens ?? 0);
    if (sessionTotal <= 0) continue;
    cost += (delta / sessionTotal) * (b.cost ?? 0);
  }
  return Math.round(cost * 10000) / 10000;
}

export function deltaTokensByModel(
  current: Map<string, TokenTotals>,
  baseline: Map<string, TokenTotals>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const [model, totals] of current) {
    const base = baseline.get(model) ?? emptyTotals();
    const delta = tokenWeight(totals) - tokenWeight(base);
    if (delta > 0) deltas.set(model, delta);
  }
  return deltas;
}
