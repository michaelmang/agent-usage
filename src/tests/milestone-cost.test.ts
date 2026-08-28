import assert from "node:assert/strict";
import test from "node:test";

import { costFromTokenDeltas, deltaTokensByModel, emptyTotals } from "../ingest/milestone-cost.js";

test("costFromTokenDeltas allocates session cost by token share", () => {
  const current = new Map([
    ["claude-sonnet-5", { input: 100, output: 200, cacheCreate: 0, cacheRead: 0 }],
  ]);
  const baseline = new Map([
    ["claude-sonnet-5", { input: 40, output: 80, cacheCreate: 0, cacheRead: 0 }],
  ]);
  const deltas = deltaTokensByModel(current, baseline);
  const cost = costFromTokenDeltas(deltas, [
    {
      modelName: "claude-sonnet-5",
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 10,
    },
  ]);
  assert.equal(cost, 6);
});

test("deltaTokensByModel ignores non-growing models", () => {
  const current = new Map([["m", { ...emptyTotals(), input: 5 }]]);
  const baseline = new Map([["m", { ...emptyTotals(), input: 10 }]]);
  assert.equal(deltaTokensByModel(current, baseline).size, 0);
});
