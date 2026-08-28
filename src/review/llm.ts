import type { ReviewConfig, ReviewResult } from "./types.js";
import { REVIEW_SYSTEM_PROMPT } from "./prompt.js";

export interface LlmCallResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

type Fetcher = typeof fetch;

function resolveAnthropicConfig(config: ReviewConfig): { apiKey: string; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it or add it to ~/.config/agent-usage/env",
    );
  }
  if (apiKey.startsWith("sk-proj-") || apiKey.startsWith("sk-org-")) {
    throw new Error(
      "ANTHROPIC_API_KEY looks like an OpenAI key (sk-proj-…). " +
        "Use an Anthropic key from console.anthropic.com (sk-ant-api03-…), " +
        "or set review.provider: openai in config.yaml and use OPENAI_API_KEY.",
    );
  }
  return {
    apiKey,
    model: process.env.AGENT_USAGE_REVIEW_MODEL?.trim() || config.model,
  };
}

function resolveOpenAiConfig(config: ReviewConfig): { apiKey: string; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  return {
    apiKey,
    model: process.env.AGENT_USAGE_REVIEW_MODEL?.trim() || config.model || "gpt-4o-mini",
  };
}

export async function callAnthropicReview(
  userMessage: string,
  config: ReviewConfig,
  fetcher: Fetcher = fetch,
  systemPrompt = REVIEW_SYSTEM_PROMPT,
): Promise<LlmCallResult> {
  const { apiKey, model } = resolveAnthropicConfig(config);
  const response = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: config.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content?.find((block) => block.type === "text")?.text?.trim();
  if (!text) throw new Error("Anthropic API returned no text content.");
  return {
    text,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}

export async function callOpenAiReview(
  userMessage: string,
  config: ReviewConfig,
  fetcher: Fetcher = fetch,
  systemPrompt = REVIEW_SYSTEM_PROMPT,
): Promise<LlmCallResult> {
  const { apiKey, model } = resolveOpenAiConfig(config);
  const response = await fetcher("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: config.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI API returned no text content.");
  return {
    text,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

export async function generateReviewText(
  userMessage: string,
  config: ReviewConfig,
  fetcher: Fetcher = fetch,
): Promise<ReviewResult> {
  let provider: "anthropic" | "openai" =
    process.env.AGENT_USAGE_REVIEW_PROVIDER?.trim() === "openai"
      ? "openai"
      : config.provider;

  // Auto-detect OpenAI keys mislabeled as ANTHROPIC_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (
    provider === "anthropic" &&
    anthropicKey &&
    (anthropicKey.startsWith("sk-proj-") || anthropicKey.startsWith("sk-org-"))
  ) {
    if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = anthropicKey;
    provider = "openai";
  }

  const llm =
    provider === "openai"
      ? await callOpenAiReview(userMessage, config, fetcher)
      : await callAnthropicReview(userMessage, config, fetcher);

  const model =
    provider === "openai"
      ? resolveOpenAiConfig(config).model
      : resolveAnthropicConfig(config).model;

  return {
    text: llm.text,
    provider,
    model,
    generatedAt: new Date().toISOString(),
    inputTokens: llm.inputTokens,
    outputTokens: llm.outputTokens,
  };
}
