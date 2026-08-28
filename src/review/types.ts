export interface ReviewCommit {
  project: string;
  sha: string;
  subject: string;
  model: string;
  effort: string;
  cost: number;
  provider: string;
}

export interface ReviewContext {
  date: string;
  usageText: string;
  todayTotal: number;
  weekTotal: number;
  commits: ReviewCommit[];
}

export interface ReviewResult {
  text: string;
  provider: string;
  model: string;
  generatedAt: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ReviewConfig {
  provider: "anthropic" | "openai";
  model: string;
  maxTokens: number;
  maxCommits: number;
}

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  provider: "anthropic",
  model: "claude-haiku-4-5",
  maxTokens: 1200,
  maxCommits: 15,
};
