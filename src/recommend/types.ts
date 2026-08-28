export type RecommendationSeverity = "info" | "watch" | "action";

export type RecommendationCategory =
  | "efficiency"
  | "model"
  | "effort"
  | "delegation"
  | "waste";

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
