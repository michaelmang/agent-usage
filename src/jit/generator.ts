import { callAnthropicReview, callOpenAiReview } from "../review/llm.js";
import type { AppConfig, JitConfigYaml } from "../config.js";
import type { ReviewConfig } from "../review/types.js";
import {
  collectJitContext,
  formatContextForLlm,
  formatTaskRecommendationForLlm,
} from "./context.js";
import { generateJitId } from "./ids.js";
import { JIT_SYSTEM_PROMPT } from "./prompt-policy.js";
import { probeAllRuntimes } from "./capabilities/probe.js";
import { recommendTask } from "./recommend-task.js";
import type {
  HarnessSpec,
  JitGenerationMeta,
  RuntimeAgent,
  TaskRecommendation,
} from "./types.js";
import {
  buildLiteHarnessSpec,
  buildNoneHarnessSpec,
  validateHarnessSpec,
} from "./validate.js";

function jitConfigFromApp(config: AppConfig): ReviewConfig & { provider: "anthropic" | "openai" } {
  const jit = config.jit ?? config.review;
  const provider = jit?.provider === "openai" ? "openai" : "anthropic";
  return {
    provider,
    model:
      jit?.model ??
      (provider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5"),
    maxTokens: (jit as JitConfigYaml)?.max_tokens ?? 2000,
    maxCommits: 0,
  };
}

interface LlmHarnessResponse {
  rationale: string;
  harness: Partial<HarnessSpec>;
}

function parseLlmJson(text: string): LlmHarnessResponse {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("JIT generator did not return JSON.");
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as LlmHarnessResponse;
}

function estimateCost(
  provider: string,
  model: string,
  inputTokens?: number,
  outputTokens?: number,
): number | undefined {
  if (!inputTokens && !outputTokens) return undefined;
  const inT = inputTokens ?? 0;
  const outT = outputTokens ?? 0;
  if (provider === "openai" || model.includes("gpt")) {
    return inT * 0.00015 / 1000 + outT * 0.0006 / 1000;
  }
  return inT * 0.00025 / 1000 + outT * 0.00125 / 1000;
}

export interface GenerateJitResult {
  taskRecommendation: TaskRecommendation;
  spec: HarnessSpec;
  generation?: JitGenerationMeta;
  usedFallback: boolean;
  fallbackMessage?: string;
}

export async function generateJitHarness(opts: {
  task: string;
  config: AppConfig;
  runtimeOverride?: RuntimeAgent;
  cwd?: string;
}): Promise<GenerateJitResult> {
  const capabilities = probeAllRuntimes();
  const ctx = collectJitContext(opts.config, capabilities, opts.cwd);
  const taskRec = recommendTask(opts.task, opts.runtimeOverride);
  const id = generateJitId();
  const createdAt = new Date().toISOString();
  const level = taskRec.jit.level;

  if (level === "none") {
    const spec = buildNoneHarnessSpec(taskRec, id, createdAt);
    validateHarnessSpec(spec);
    return { taskRecommendation: taskRec, spec, usedFallback: false };
  }

  if (level === "lite") {
    const spec = buildLiteHarnessSpec(taskRec, id, createdAt);
    validateHarnessSpec(spec);
    return { taskRecommendation: taskRec, spec, usedFallback: false };
  }

  const llmConfig = jitConfigFromApp(opts.config);
  const userMessage = [
    formatContextForLlm(ctx, opts.task),
    "",
    formatTaskRecommendationForLlm(taskRec),
    "",
    `Assign harness id: ${id}`,
    `createdAt: ${createdAt}`,
    "Generate a full HarnessSpec (version 1) harness object.",
  ].join("\n");

  const started = Date.now();
  try {
    const llm =
      llmConfig.provider === "openai"
        ? await callOpenAiReview(userMessage, llmConfig, undefined, JIT_SYSTEM_PROMPT)
        : await callAnthropicReview(userMessage, llmConfig, undefined, JIT_SYSTEM_PROMPT);

    const parsed = parseLlmJson(llm.text);
    const spec: HarnessSpec = {
      version: 1,
      id,
      createdAt,
      jitLevel: "full",
      task: {
        text: taskRec.task,
        class: taskRec.taskClass,
        risk: taskRec.risk,
        ambiguity: taskRec.ambiguity,
        ...(parsed.harness.task ?? {}),
      },
      runtime: {
        agent: taskRec.runtime.agent,
        model: parsed.harness.runtime?.model ?? taskRec.runtime.model,
        effort: parsed.harness.runtime?.effort ?? taskRec.runtime.effort,
      },
      session: parsed.harness.session ?? { strategy: "fresh" },
      context: parsed.harness.context ?? {
        strategy: "selective",
        include: [{ type: "git_status" }, { type: "recent_commits", count: 8 }],
      },
      planning: parsed.harness.planning ?? { strategy: "hypothesis_driven" },
      tools: parsed.harness.tools ?? { shell: true, git: true, tests: true },
      action: parsed.harness.action ?? {
        editPolicy: "reproduce_before_edit",
        validation: "focused_then_full",
        maxFailedAttempts: 2,
      },
      memory: parsed.harness.memory ?? { strategy: "runtime_default" },
      escalation: parsed.harness.escalation,
      deescalation: parsed.harness.deescalation,
    };

    validateHarnessSpec(spec);

    const generation: JitGenerationMeta = {
      model: llmConfig.model,
      provider: llmConfig.provider,
      inputTokens: llm.inputTokens,
      outputTokens: llm.outputTokens,
      actualCost: estimateCost(
        llmConfig.provider,
        llmConfig.model,
        llm.inputTokens,
        llm.outputTokens,
      ),
      durationMs: Date.now() - started,
      rationale: parsed.rationale?.trim() || "Full harness generated from task context.",
    };

    return { taskRecommendation: taskRec, spec, generation, usedFallback: false };
  } catch (err) {
    const lite = buildLiteHarnessSpec(taskRec, id, createdAt);
    validateHarnessSpec(lite);
    return {
      taskRecommendation: taskRec,
      spec: lite,
      usedFallback: true,
      fallbackMessage: `JIT generation failed: ${err instanceof Error ? err.message : String(err)}. Using recommended fixed profile.`,
      generation: {
        model: llmConfig.model,
        provider: llmConfig.provider,
        durationMs: Date.now() - started,
        rationale: "Fallback to lite harness after generation failure.",
      },
    };
  }
}
