import { compileHarnessInstructions } from "../prompt-compiler.js";
import { probeRuntimeCapabilities } from "../capabilities/probe.js";
import type { HarnessSpec } from "../types.js";
import { finalizePlan } from "./base.js";
import type { CompileOptions, HarnessCompiler } from "./types.js";

export class CodexCompiler implements HarnessCompiler {
  async compile(
    spec: HarnessSpec,
    cwd: string,
    opts?: CompileOptions,
  ): Promise<import("../types.js").ExecutionPlan> {
    const caps = opts?.capabilities ?? probeRuntimeCapabilities("codex");
    const executable = caps?.executable ?? "codex";
    const args: string[] = [];

    if (caps?.modelSelection && spec.runtime.model) {
      args.push("--model", spec.runtime.model);
    }
    if (caps?.reasoningEffort && spec.runtime.effort) {
      args.push("--effort", spec.runtime.effort);
    }
    if (caps?.workingDirectory) {
      args.push("--cwd", cwd);
    }

    const instructions = compileHarnessInstructions(spec);
    const prompt = `${instructions}\n\nTask: ${spec.task.text}`;
    args.push(prompt);

    const capSnap = caps === null ? undefined : caps;
    return finalizePlan(spec, cwd, executable, args, capSnap, opts);
  }
}
