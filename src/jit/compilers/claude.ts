import { compileHarnessInstructions } from "../prompt-compiler.js";
import { probeRuntimeCapabilities } from "../capabilities/probe.js";
import type { HarnessSpec } from "../types.js";
import { finalizePlan } from "./base.js";
import type { CompileOptions, HarnessCompiler } from "./types.js";

export class ClaudeCompiler implements HarnessCompiler {
  async compile(
    spec: HarnessSpec,
    cwd: string,
    opts?: CompileOptions,
  ): Promise<import("../types.js").ExecutionPlan> {
    const caps = opts?.capabilities ?? probeRuntimeCapabilities("claude");
    const executable = caps?.executable ?? "claude";
    const args: string[] = ["-p", "--output-format", "text"];

    if (caps?.modelSelection && spec.runtime.model) {
      args.push("--model", spec.runtime.model);
    }

    if (
      caps?.sessionResume &&
      spec.session.strategy === "resume" &&
      spec.session.sourceSessionId
    ) {
      args.push("--resume", spec.session.sourceSessionId);
    } else if (caps?.sessionContinuation && spec.session.strategy === "continue") {
      args.push("--continue");
    }

    if (spec.tools.allow?.length && caps?.allowedTools) {
      args.push("--allowed-tools", spec.tools.allow.join(","));
    }
    if (spec.tools.deny?.length && caps?.deniedTools) {
      args.push("--disallowed-tools", spec.tools.deny.join(","));
    }

    if (caps?.customSystemPrompt) {
      args.push(
        "--append-system-prompt",
        compileHarnessInstructions(spec).slice(0, 4000),
      );
    }

    args.push(spec.task.text);

    const capSnap = caps === null ? undefined : caps;
    return finalizePlan(spec, cwd, executable, args, capSnap, opts);
  }
}
