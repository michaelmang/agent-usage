import type { HarnessSpec } from "../types.js";
import { probeRuntimeCapabilities } from "../capabilities/probe.js";
import { finalizePlan } from "./base.js";
import type { CompileOptions, HarnessCompiler } from "./types.js";
import { compileHarnessInstructions } from "../prompt-compiler.js";

export class PiCompiler implements HarnessCompiler {
  async compile(
    spec: HarnessSpec,
    cwd: string,
    opts?: CompileOptions,
  ): Promise<import("../types.js").ExecutionPlan> {
    const caps = opts?.capabilities ?? probeRuntimeCapabilities("pi");
    const executable = caps?.executable ?? "pi";
    const args = [spec.task.text];
    if (caps?.customSystemPrompt) {
      args.unshift("--system", compileHarnessInstructions(spec).slice(0, 4000));
    }
    const capSnap = caps === null ? undefined : caps;
    return finalizePlan(spec, cwd, executable, args, capSnap, opts);
  }
}
