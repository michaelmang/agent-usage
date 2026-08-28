import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { JIT_DIR } from "../paths.js";
import type {
  ExecutionPlan,
  HarnessSpec,
  JitGenerationMeta,
  JitLevel,
  TaskRecommendation,
} from "./types.js";

export function persistJitArtifacts(opts: {
  spec: HarnessSpec;
  plan?: ExecutionPlan;
  taskRecommendation?: TaskRecommendation;
  generation?: JitGenerationMeta;
}): string {
  const dir = join(JIT_DIR, opts.spec.id);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "spec.json"), JSON.stringify(opts.spec, null, 2), "utf8");

  if (opts.plan) {
    writeFileSync(join(dir, "compiled.json"), JSON.stringify(opts.plan, null, 2), "utf8");
    writeFileSync(join(dir, "instructions.txt"), opts.plan.generatedInstructions, "utf8");
  }

  if (opts.taskRecommendation) {
    writeFileSync(
      join(dir, "recommendation.json"),
      JSON.stringify(opts.taskRecommendation, null, 2),
      "utf8",
    );
  }

  if (opts.generation) {
    writeFileSync(join(dir, "generation.json"), JSON.stringify(opts.generation, null, 2), "utf8");
  }

  return dir;
}

export function jitLevelFromSpec(spec: HarnessSpec): JitLevel {
  return spec.jitLevel ?? "full";
}
