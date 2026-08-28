export type JitLevel = "none" | "lite" | "full";

export type TaskRisk = "low" | "medium" | "high";
export type TaskAmbiguity = "low" | "medium" | "high";

export type RuntimeAgent = "codex" | "claude" | "pi";

export type SessionStrategy = "fresh" | "continue" | "resume";

export type ContextStrategy = "minimal" | "selective" | "broad";

export type PlanningStrategy =
  | "direct"
  | "plan_then_execute"
  | "diagnosis_first"
  | "hypothesis_driven"
  | "explore_then_plan";

export type EditPolicy =
  | "direct"
  | "inspect_before_edit"
  | "reproduce_before_edit"
  | "diagnosis_only";

export type ValidationStrategy = "none" | "focused" | "focused_then_full" | "full";

export type MemoryStrategy =
  | "runtime_default"
  | "minimal"
  | "selective"
  | "summary_oriented";

export type ControlKind = "native" | "prompt_enforced" | "wrapper_enforced" | "unsupported";

export type ContextSource =
  | { type: "repo_map" }
  | { type: "git_status" }
  | { type: "recent_commits"; count: number }
  | { type: "file"; path: string }
  | { type: "directory"; path: string }
  | { type: "agent_session_summary"; sessionId: string }
  | { type: "project_metadata" };

export interface HarnessSpec {
  version: 1;
  id: string;
  createdAt: string;
  task: {
    text: string;
    class: string;
    risk: TaskRisk;
    ambiguity: TaskAmbiguity;
  };
  runtime: {
    agent: RuntimeAgent;
    model: string;
    effort?: string;
  };
  session: {
    strategy: SessionStrategy;
    sourceSessionId?: string;
  };
  context: {
    strategy: ContextStrategy;
    include: ContextSource[];
    exclude?: ContextSource[];
    maxRecentCommits?: number;
    includeGitStatus?: boolean;
    includeRepoMap?: boolean;
  };
  planning: {
    strategy: PlanningStrategy;
    requirePlanBeforeEdit?: boolean;
    replanOnFailure?: boolean;
  };
  tools: {
    allow?: string[];
    deny?: string[];
    web?: boolean;
    shell?: boolean;
    git?: boolean;
    tests?: boolean;
  };
  action: {
    editPolicy: EditPolicy;
    validation: ValidationStrategy;
    maxFailedAttempts?: number;
    stopOnUnexpectedScopeExpansion?: boolean;
  };
  memory: {
    strategy: MemoryStrategy;
    retain?: string[];
    discard?: string[];
  };
  escalation?: {
    enabled: boolean;
    conditions?: string[];
    nextModel?: string;
    nextEffort?: string;
  };
  deescalation?: {
    enabled: boolean;
    conditions?: string[];
    nextModel?: string;
    nextEffort?: string;
  };
  jitLevel?: JitLevel;
}

export interface ControlMapping {
  kind: ControlKind;
  label: string;
  detail?: string;
}

export interface ExecutionPlan {
  harnessId: string;
  runtime: string;
  runtimeVersion?: string;
  command: {
    executable: string;
    args: string[];
    cwd: string;
  };
  environment?: Record<string, string>;
  generatedInstructions: string;
  controls: {
    native: ControlMapping[];
    promptEnforced: ControlMapping[];
    wrapperEnforced: ControlMapping[];
    unsupported: ControlMapping[];
  };
  degradation?: {
    fromRuntime?: string;
    unsupported: string[];
    message?: string;
  };
}

export interface JitRecommendation {
  recommended: boolean;
  level: JitLevel;
  confidence: number;
  reason: string;
}

export interface TaskRecommendation {
  task: string;
  taskClass: string;
  risk: TaskRisk;
  ambiguity: TaskAmbiguity;
  runtime: {
    agent: RuntimeAgent;
    model: string;
    effort?: string;
  };
  jit: JitRecommendation;
  reasoning: string[];
  generatedAt: string;
}

export interface JitGenerationMeta {
  model: string;
  provider: string;
  effort?: string;
  inputTokens?: number;
  outputTokens?: number;
  actualCost?: number;
  durationMs: number;
  rationale: string;
}

export interface JitHarnessRecord {
  id: string;
  spec: HarnessSpec;
  generatedSpec?: HarnessSpec;
  finalSpec?: HarnessSpec;
  manualOverride: boolean;
  jitLevel: JitLevel;
  taskRecommendation?: TaskRecommendation;
  generation?: JitGenerationMeta;
  compilation?: {
    plan: ExecutionPlan;
    compiledAt: string;
    counts: {
      native: number;
      prompt: number;
      wrapper: number;
      unsupported: number;
    };
  };
  status: string;
  createdAt: string;
  projectId?: number;
}

export interface RuntimeCapabilities {
  runtime: RuntimeAgent;
  version?: string;
  checkedAt: string;
  executable?: string;
  modelSelection: boolean;
  reasoningEffort: boolean;
  sessionResume: boolean;
  sessionContinuation: boolean;
  allowedTools: boolean | "partial";
  deniedTools: boolean | "partial";
  maxTurns: boolean | "wrapper";
  structuredOutput: boolean;
  customSystemPrompt: boolean;
  workingDirectory: boolean;
  dynamicToolMutation: boolean;
  customMemoryPolicy: boolean;
  customPlanningLoop: boolean;
  detectedFlags: Record<string, string>;
}
