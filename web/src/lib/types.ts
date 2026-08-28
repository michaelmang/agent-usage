export interface ModelRollup {
  model: string;
  effort?: string;
  totalTokens: number;
  apiEquivalentCost: number;
}

export interface ProviderRollup {
  provider: string;
  totalTokens: number;
  apiEquivalentCost: number;
  models: ModelRollup[];
}

export interface ProjectRollup {
  projectId: number | null;
  name: string;
  path: string;
  client: string | null;
  contractValue: number | null;
  totalTokens: number;
  apiEquivalentCost: number;
  providers: ProviderRollup[];
}

export interface ReportPayload {
  title: string;
  range: { from: string; to: string };
  updatedAt: string;
  projects: ProjectRollup[];
  totals: { totalTokens: number; apiEquivalentCost: number };
}

export interface ReviewResult {
  text: string;
  provider: string;
  model: string;
  generatedAt: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface SyncMeta {
  skipped: boolean;
  fingerprint: string;
  sessionsUpserted: number;
  usageRowsTouched: number;
  projectsUpserted: number;
  durationMs: number;
  message: string;
}

export interface SnapshotPayload {
  snapshotDate: string;
  capturedAt: string;
  version: string;
  sync: SyncMeta;
  report: ReportPayload;
  review?: ReviewResult;
}

export interface SnapshotResponse {
  snapshot: SnapshotPayload | null;
  snapshotPath?: string;
  error?: string;
}

export interface ActionResponse {
  ok: boolean;
  message: string;
  snapshot?: SnapshotPayload | null;
  review?: ReviewResult;
  report?: RecommendReport;
  durationMs?: number;
}

export type RecommendationSeverity = 'info' | 'watch' | 'action';

export type RecommendationCategory =
  | 'efficiency'
  | 'model'
  | 'effort'
  | 'delegation'
  | 'waste';

export interface Recommendation {
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  title: string;
  detail: string;
  project?: string;
}

export interface ProjectEfficiency {
  project: string;
  commits: number;
  cost: number;
  costPerCommit: number | null;
  commitsPer100Dollars: number | null;
  dominantProvider?: string;
  dominantModel?: string;
  dominantEffort?: string;
  opusShare?: number;
  highEffortCommitShare?: number;
}

export interface RecommendReport {
  title: string;
  range: { from: string; to: string };
  generatedAt: string;
  totalCost: number;
  commitCount: number;
  costPerCommit: number | null;
  projects: ProjectEfficiency[];
  recommendations: Recommendation[];
}

export interface RecommendResponse {
  ok: boolean;
  report?: RecommendReport;
  message?: string;
  durationMs?: number;
}

export type JitLevel = 'none' | 'lite' | 'full';

export interface JitRecommendation {
  recommended: boolean;
  level: JitLevel;
  confidence: number;
  reason: string;
}

export interface TaskRecommendation {
  task: string;
  taskClass: string;
  risk: string;
  ambiguity: string;
  runtime: { agent: string; model: string; effort?: string };
  jit: JitRecommendation;
  reasoning: string[];
  generatedAt: string;
}

export interface HarnessSpecSummary {
  id: string;
  createdAt: string;
  jitLevel?: JitLevel;
  task: { text: string; class: string; risk: string; ambiguity: string };
  runtime: { agent: string; model: string; effort?: string };
  session: { strategy: string };
  context: { strategy: string };
  planning: { strategy: string };
  action: { editPolicy: string; validation: string };
}

export interface ControlMapping {
  kind: string;
  label: string;
  detail?: string;
}

export interface ExecutionPlanSummary {
  harnessId: string;
  runtime: string;
  generatedInstructions: string;
  controls: {
    native: ControlMapping[];
    promptEnforced: ControlMapping[];
    wrapperEnforced: ControlMapping[];
    unsupported: ControlMapping[];
  };
}

export interface JitGenerationMeta {
  model: string;
  provider: string;
  durationMs: number;
  rationale: string;
  actualCost?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface JitHarnessRecord {
  id: string;
  spec: HarnessSpecSummary;
  jitLevel: JitLevel;
  taskRecommendation?: TaskRecommendation;
  generation?: JitGenerationMeta;
  status: string;
  createdAt: string;
}

export interface JitListResponse {
  ok: boolean;
  harnesses?: JitHarnessRecord[];
  message?: string;
}

export interface JitDetailResponse {
  ok: boolean;
  record?: JitHarnessRecord;
  compilation?: {
    plan: ExecutionPlanSummary;
    compiledAt: string;
  };
  message?: string;
}

export interface JitGenerateResponse {
  ok: boolean;
  harnessId?: string;
  record?: JitHarnessRecord;
  plan?: ExecutionPlanSummary;
  message?: string;
  durationMs?: number;
}
