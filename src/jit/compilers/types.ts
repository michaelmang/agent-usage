import type { HarnessSpec, ExecutionPlan, RuntimeCapabilities } from "../types.js";

export interface HarnessCompiler {
  compile(
    spec: HarnessSpec,
    cwd: string,
    opts?: CompileOptions,
  ): Promise<import("../types.js").ExecutionPlan>;
}

export interface CompileOptions {
  capabilities?: RuntimeCapabilities;
  fromRuntime?: string;
}
