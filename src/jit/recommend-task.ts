import type {
  JitLevel,
  JitRecommendation,
  RuntimeAgent,
  TaskAmbiguity,
  TaskRecommendation,
  TaskRisk,
} from "./types.js";

const RENAME_PATTERN =
  /\b(rename|reformat|format|lint|typo|spelling|whitespace|prettier|eslint)\b/i;
const MECHANICAL_PATTERN =
  /\b(move file|update import|bump version|changelog|comment only)\b/i;
const BUG_PATTERN =
  /\b(bug|fix|broken|error|fail|crash|regression|debug|disappear|missing)\b/i;
const ARCH_PATTERN =
  /\b(architect|design|refactor|migrate|redesign|system-wide|cross-subsystem)\b/i;
const AMBIGUOUS_PATTERN =
  /\b(why|figure out|investigate|occasionally|sometimes|unclear|unknown root)\b/i;
const IMPLEMENT_PATTERN = /\b(add|implement|create|build|export|endpoint|feature)\b/i;
const DIAGNOSIS_DONE_PATTERN =
  /\b(we identified|as discussed|fix we found|root cause found|implement the fix)\b/i;

function classifyTask(task: string): {
  taskClass: string;
  risk: TaskRisk;
  ambiguity: TaskAmbiguity;
} {
  const t = task.toLowerCase();

  if (RENAME_PATTERN.test(t) && t.length < 80) {
    return { taskClass: "mechanical_edit", risk: "low", ambiguity: "low" };
  }
  if (MECHANICAL_PATTERN.test(t)) {
    return { taskClass: "mechanical_edit", risk: "low", ambiguity: "low" };
  }
  if (DIAGNOSIS_DONE_PATTERN.test(t)) {
    return { taskClass: "known_implementation", risk: "medium", ambiguity: "low" };
  }
  if (ARCH_PATTERN.test(t)) {
    return { taskClass: "architecture", risk: "high", ambiguity: "high" };
  }
  if (AMBIGUOUS_PATTERN.test(t) && BUG_PATTERN.test(t)) {
    return { taskClass: "ambiguous_debugging", risk: "high", ambiguity: "high" };
  }
  if (BUG_PATTERN.test(t)) {
    return { taskClass: "debugging", risk: "medium", ambiguity: "medium" };
  }
  if (IMPLEMENT_PATTERN.test(t)) {
    return { taskClass: "feature_work", risk: "medium", ambiguity: "medium" };
  }
  return { taskClass: "general", risk: "medium", ambiguity: "medium" };
}

function pickRuntime(
  taskClass: string,
  risk: TaskRisk,
): { agent: RuntimeAgent; model: string; effort?: string } {
  if (taskClass === "mechanical_edit") {
    return { agent: "codex", model: "luna", effort: "low" };
  }
  if (taskClass === "known_implementation") {
    return { agent: "codex", model: "terra", effort: "medium" };
  }
  if (taskClass === "ambiguous_debugging" || (taskClass === "architecture" && risk === "high")) {
    return { agent: "codex", model: "sol", effort: "high" };
  }
  if (taskClass === "debugging") {
    return { agent: "codex", model: "sol", effort: "high" };
  }
  if (taskClass === "feature_work") {
    return { agent: "codex", model: "terra", effort: "medium" };
  }
  return { agent: "codex", model: "terra", effort: "medium" };
}

function pickJitLevel(
  taskClass: string,
  risk: TaskRisk,
  ambiguity: TaskAmbiguity,
): JitRecommendation {
  if (taskClass === "mechanical_edit" || (risk === "low" && ambiguity === "low")) {
    return {
      recommended: false,
      level: "none",
      confidence: 0.9,
      reason: "Mechanical or tightly specified work; fixed profile is sufficient.",
    };
  }
  if (
    taskClass === "known_implementation" ||
    (taskClass === "feature_work" && ambiguity !== "high")
  ) {
    return {
      recommended: true,
      level: "lite",
      confidence: 0.78,
      reason: "Ordinary engineering work benefits from light harness tuning without full JIT.",
    };
  }
  if (
    taskClass === "ambiguous_debugging" ||
    taskClass === "architecture" ||
    (risk === "high" && ambiguity === "high")
  ) {
    return {
      recommended: true,
      level: "full",
      confidence: 0.87,
      reason:
        "Ambiguous or high-risk work where context and execution strategy materially affect outcome.",
    };
  }
  if (taskClass === "debugging") {
    return {
      recommended: true,
      level: "full",
      confidence: 0.75,
      reason: "Debugging benefits from hypothesis-driven harness structure.",
    };
  }
  return {
    recommended: true,
    level: "lite",
    confidence: 0.65,
    reason: "Moderate task; JIT-lite provides planning and validation guidance.",
  };
}

export function recommendTask(task: string, runtimeOverride?: RuntimeAgent): TaskRecommendation {
  const trimmed = task.trim();
  const { taskClass, risk, ambiguity } = classifyTask(trimmed);
  const runtime = pickRuntime(taskClass, risk);
  if (runtimeOverride) {
    runtime.agent = runtimeOverride;
  }
  const jit = pickJitLevel(taskClass, risk, ambiguity);

  const reasoning: string[] = [
    `Classified as ${taskClass} (risk=${risk}, ambiguity=${ambiguity}).`,
    `Default runtime profile: ${runtime.agent} / ${runtime.model}${runtime.effort ? ` / ${runtime.effort}` : ""}.`,
    jit.reason,
  ];

  if (taskClass === "ambiguous_debugging") {
    reasoning.push("Prefer fresh session and reproduce-before-edit for ambiguous bugs.");
  }
  if (taskClass === "known_implementation") {
    reasoning.push("Prior diagnosis lowers required reasoning tier; avoid inheriting Sol/High.");
  }

  return {
    task: trimmed,
    taskClass,
    risk,
    ambiguity,
    runtime,
    jit,
    reasoning,
    generatedAt: new Date().toISOString(),
  };
}
