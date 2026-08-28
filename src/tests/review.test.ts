import assert from "node:assert/strict";
import test from "node:test";

import { formatReviewUserMessage } from "../review/context.js";
import { generateReviewText } from "../review/llm.js";
import { DEFAULT_REVIEW_CONFIG } from "../review/types.js";
import { loadReviewEnvFile, REVIEW_ENV_FILE } from "../util/env-file.js";

test("formatReviewUserMessage includes usage and commits", () => {
  const message = formatReviewUserMessage({
    date: "2026-08-27",
    usageText: "kalam-app\n  Claude Sonnet 5 (high)  $8",
    todayTotal: 1605,
    weekTotal: 1725,
    commits: [
      {
        project: "kalam-app",
        sha: "6509160",
        subject: "Wire social login",
        model: "Claude Sonnet 5 (high)",
        effort: "high",
        cost: 33.75,
        provider: "claude",
      },
    ],
  });
  assert.match(message, /6509160/);
  assert.match(message, /Wire social login/);
  assert.match(message, /Usage breakdown/);
});

test("generateReviewText calls Anthropic and parses response", async () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";

  const mockFetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    assert.equal(body.model, "claude-haiku-4-5");
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "## Highlights\n- Test bullet" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const result = await generateReviewText("daily data", DEFAULT_REVIEW_CONFIG, mockFetch);
    assert.match(result.text, /Highlights/);
    assert.equal(result.provider, "anthropic");
    assert.equal(result.inputTokens, 100);
  } finally {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

test("REVIEW_ENV_FILE points at config path", () => {
  assert.match(REVIEW_ENV_FILE, /agent-usage\/env$/);
  loadReviewEnvFile();
});
