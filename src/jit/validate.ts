import type {
  ContextSource,
  HarnessSpec,
  JitLevel,
  PlanningStrategy,
  RuntimeAgent,
  SessionStrategy,
  TaskAmbiguity,
  TaskRisk,
} from "./types.js";

const ALLOWED_AGENTS = new Set<RuntimeAgent>(["codex", "claude", "pi"]);
const ALLOWED_JIT_LEVELS = new Set<JitLevel>(["none", "lite", "full"]);
const ALLOWED_RISKS = new Set<TaskRisk>(["low", "medium", "high"]);
const ALLOWED_AMBIGUITY = new Set<TaskAmbiguity>(["low", "medium", "high"]);
const ALLOWED_SESSION = new Set<SessionStrategy>(["fresh", "continue", "resume"]);
const ALLOWED_CONTEXT = new Set(["minimal", "selective", "broad"]);
const ALLOWED_PLANNING = new Set<PlanningStrategy>([
  "direct",
  "plan_then_execute",
  "diagnosis_first",
  "hypothesis_driven",
  "explore_then_plan",
]);
const ALLOWED_EDIT = new Set([
  "direct",
  "inspect_before_edit",
  "reproduce_before_edit",
  "diagnosis_only",
]);
const ALLOWED_VALIDATION = new Set(["none", "focused", "focused_then_full", "full"]);
const ALLOWED_MEMORY = new Set([
  "runtime_default",
  "minimal",
  "selective",
  "summary_oriented",
]);

const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /sudo\s+/i,
  /curl\s+.*\|\s*(ba)?sh/i,
  /wget\s+.*\|\s*(ba)?sh/i,
  /export\s+[A-Z_]+=/i,
  /;\s*rm\s+/i,
  /\$\(/,
  /`[^`]+`/,
];

function assertNoDangerousText(value: string, field: string): void {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`HarnessSpec validation: dangerous pattern in ${field}`);
    }
  }
}

function validatePath(path: string, field: string): void {
  if (!path || path.length > 512) {
    throw new Error(`HarnessSpec validation: invalid path in ${field}`);
  }
  if (path.includes("\0")) {
    throw new Error(`HarnessSpec validation: invalid path in ${field}`);
  }
  assertNoDangerousText(path, field);
}

function validateContextSource(source: ContextSource, index: number): void {
  switch (source.type) {
    case "file":
    case "directory":
      validatePath(source.path, `context.include[${index}]`);
      break;
    case "recent_commits":
      if (!Number.isInteger(source.count) || source.count < 1 || source.count > 50) {
        throw new Error(`HarnessSpec validation: recent_commits count out of range`);
      }
      break;
    case "agent_session_summary":
      if (!source.sessionId || source.sessionId.length > 128) {
        throw new Error(`HarnessSpec validation: invalid sessionId`);
      }
      break;
    default:
      break;
  }
}

export function validateHarnessSpec(spec: HarnessSpec): void {
  if (spec.version !== 1) {
    throw new Error(`HarnessSpec validation: unsupported version ${spec.version}`);
  }

  if (!spec.id || spec.id.length > 64) {
    throw new Error("HarnessSpec validation: invalid id");
  }

  if (!spec.task?.text?.trim()) {
    throw new Error("HarnessSpec validation: task.text required");
  }
  assertNoDangerousText(spec.task.text, "task.text");
  assertNoDangerousText(spec.task.class, "task.class");

  if (!ALLOWED_RISKS.has(spec.task.risk)) {
    throw new Error(`HarnessSpec validation: invalid task.risk`);
  }
  if (!ALLOWED_AMBIGUITY.has(spec.task.ambiguity)) {
    throw new Error(`HarnessSpec validation: invalid task.ambiguity`);
  }

  if (!ALLOWED_AGENTS.has(spec.runtime.agent)) {
    throw new Error(`HarnessSpec validation: invalid runtime.agent`);
  }
  if (!spec.runtime.model?.trim()) {
    throw new Error("HarnessSpec validation: runtime.model required");
  }
  assertNoDangerousText(spec.runtime.model, "runtime.model");
  if (spec.runtime.effort) assertNoDangerousText(spec.runtime.effort, "runtime.effort");

  if (!ALLOWED_SESSION.has(spec.session.strategy)) {
    throw new Error("HarnessSpec validation: invalid session.strategy");
  }
  if (spec.session.strategy === "resume" && !spec.session.sourceSessionId) {
    throw new Error("HarnessSpec validation: resume requires sourceSessionId");
  }

  if (!ALLOWED_CONTEXT.has(spec.context.strategy)) {
    throw new Error("HarnessSpec validation: invalid context.strategy");
  }
  if (!Array.isArray(spec.context.include)) {
    throw new Error("HarnessSpec validation: context.include must be array");
  }
  spec.context.include.forEach((s, i) => validateContextSource(s, i));
  spec.context.exclude?.forEach((s, i) => validateContextSource(s, i));

  if (!ALLOWED_PLANNING.has(spec.planning.strategy)) {
    throw new Error("HarnessSpec validation: invalid planning.strategy");
  }

  const toolNames = [...(spec.tools.allow ?? []), ...(spec.tools.deny ?? [])];
  for (const tool of toolNames) {
    if (!tool || tool.length > 64) {
      throw new Error("HarnessSpec validation: invalid tool name");
    }
    assertNoDangerousText(tool, "tools");
  }

  if (!ALLOWED_EDIT.has(spec.action.editPolicy)) {
    throw new Error("HarnessSpec validation: invalid action.editPolicy");
  }
  if (!ALLOWED_VALIDATION.has(spec.action.validation)) {
    throw new Error("HarnessSpec validation: invalid action.validation");
  }
  if (
    spec.action.maxFailedAttempts != null &&
    (!Number.isInteger(spec.action.maxFailedAttempts) ||
      spec.action.maxFailedAttempts < 1 ||
      spec.action.maxFailedAttempts > 10)
  ) {
    throw new Error("HarnessSpec validation: maxFailedAttempts out of range");
  }

  if (!ALLOWED_MEMORY.has(spec.memory.strategy)) {
    throw new Error("HarnessSpec validation: invalid memory.strategy");
  }

  if (spec.jitLevel && !ALLOWED_JIT_LEVELS.has(spec.jitLevel)) {
    throw new Error("HarnessSpec validation: invalid jitLevel");
  }

  for (const list of [spec.memory.retain, spec.memory.discard]) {
    if (list) {
      for (const item of list) assertNoDangerousText(item, "memory");
    }
  }
}

export function buildLiteHarnessSpec(
  taskRec: {
    task: string;
    taskClass: string;
    risk: TaskRisk;
    ambiguity: TaskAmbiguity;
    runtime: { agent: RuntimeAgent; model: string; effort?: string };
    jit: { level: JitLevel };
  },
  id: string,
  createdAt: string,
): HarnessSpec {
  return {
    version: 1,
    id,
    createdAt,
    jitLevel: "lite",
    task: {
      text: taskRec.task,
      class: taskRec.taskClass,
      risk: taskRec.risk,
      ambiguity: taskRec.ambiguity,
    },
    runtime: { ...taskRec.runtime },
    session: { strategy: "fresh" },
    context: {
      strategy: "selective",
      include: [{ type: "git_status" }, { type: "recent_commits", count: 5 }],
      includeGitStatus: true,
    },
    planning: {
      strategy: "plan_then_execute",
      requirePlanBeforeEdit: true,
    },
    tools: { shell: true, git: true, tests: true },
    action: {
      editPolicy: "inspect_before_edit",
      validation: "focused",
    },
    memory: { strategy: "runtime_default" },
  };
}

export function buildNoneHarnessSpec(
  taskRec: {
    task: string;
    taskClass: string;
    risk: TaskRisk;
    ambiguity: TaskAmbiguity;
    runtime: { agent: RuntimeAgent; model: string; effort?: string };
  },
  id: string,
  createdAt: string,
): HarnessSpec {
  return {
    version: 1,
    id,
    createdAt,
    jitLevel: "none",
    task: {
      text: taskRec.task,
      class: taskRec.taskClass,
      risk: taskRec.risk,
      ambiguity: taskRec.ambiguity,
    },
    runtime: { ...taskRec.runtime },
    session: { strategy: "fresh" },
    context: { strategy: "minimal", include: [] },
    planning: { strategy: "direct" },
    tools: {},
    action: { editPolicy: "direct", validation: "focused" },
    memory: { strategy: "runtime_default" },
  };
}
