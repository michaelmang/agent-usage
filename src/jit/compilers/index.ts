import type { HarnessSpec, RuntimeAgent } from "../types.js";
import { ClaudeCompiler } from "./claude.js";
import { CodexCompiler } from "./codex.js";
import { PiCompiler } from "./pi.js";
import type { CompileOptions, HarnessCompiler } from "./types.js";

export function getCompiler(agent: RuntimeAgent): HarnessCompiler {
  switch (agent) {
    case "claude":
      return new ClaudeCompiler();
    case "pi":
      return new PiCompiler();
    default:
      return new CodexCompiler();
  }
}

export async function compileHarness(
  spec: HarnessSpec,
  cwd: string,
  opts?: CompileOptions,
): Promise<import("../types.js").ExecutionPlan> {
  const compiler = getCompiler(spec.runtime.agent);
  return compiler.compile(spec, cwd, opts);
}
