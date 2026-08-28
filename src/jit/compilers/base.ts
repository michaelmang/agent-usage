import { compileHarnessInstructions } from "../prompt-compiler.js";
import type { ControlMapping, ExecutionPlan, HarnessSpec, RuntimeCapabilities } from "../types.js";
import type { CompileOptions } from "./types.js";

function displayModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("sol")) return "Sol";
  if (m.includes("terra")) return "Terra";
  if (m.includes("luna")) return "Luna";
  if (m.includes("sonnet")) return "Sonnet";
  if (m.includes("opus")) return "Opus";
  return model;
}

function displayEffort(effort?: string): string | undefined {
  if (!effort) return undefined;
  return effort.charAt(0).toUpperCase() + effort.slice(1).toLowerCase();
}

export function buildBaseControls(spec: HarnessSpec): {
  native: ControlMapping[];
  promptEnforced: ControlMapping[];
  wrapperEnforced: ControlMapping[];
  unsupported: ControlMapping[];
} {
  const native: ControlMapping[] = [];
  const promptEnforced: ControlMapping[] = [];
  const wrapperEnforced: ControlMapping[] = [];
  const unsupported: ControlMapping[] = [];

  native.push({
    kind: "native",
    label: `model = ${displayModel(spec.runtime.model)}`,
  });
  if (spec.runtime.effort) {
    native.push({
      kind: "native",
      label: `effort = ${displayEffort(spec.runtime.effort)}`,
    });
  }

  if (spec.planning.strategy !== "direct") {
    promptEnforced.push({
      kind: "prompt_enforced",
      label: `planning: ${spec.planning.strategy.replace(/_/g, "-")}`,
    });
  }
  if (spec.action.editPolicy !== "direct") {
    promptEnforced.push({
      kind: "prompt_enforced",
      label: spec.action.editPolicy.replace(/_/g, " "),
    });
  }
  if (spec.action.validation !== "none") {
    promptEnforced.push({
      kind: "prompt_enforced",
      label: `validation: ${spec.action.validation.replace(/_/g, " ")}`,
    });
  }

  if (spec.action.maxFailedAttempts != null) {
    wrapperEnforced.push({
      kind: "wrapper_enforced",
      label: `stop after ${spec.action.maxFailedAttempts} failed approaches`,
      detail: "Enforced via agent-usage wrapper when observable; otherwise prompt-enforced.",
    });
  }

  if (spec.memory.strategy !== "runtime_default") {
    unsupported.push({
      kind: "unsupported",
      label: `memory strategy: ${spec.memory.strategy}`,
      detail: "Approximate via context selection in prompt.",
    });
  }

  return { native, promptEnforced, wrapperEnforced, unsupported };
}

export function finalizePlan(
  spec: HarnessSpec,
  cwd: string,
  executable: string,
  args: string[],
  capabilities?: RuntimeCapabilities,
  opts?: CompileOptions,
): ExecutionPlan {
  const controls = buildBaseControls(spec);
  const generatedInstructions = compileHarnessInstructions(spec);

  const degradation =
    opts?.fromRuntime && opts.fromRuntime !== spec.runtime.agent
      ? {
          fromRuntime: opts.fromRuntime,
          unsupported: controls.unsupported.map((c) => c.label),
          message: "Compilation degradation: fidelity reduced on target runtime.",
        }
      : undefined;

  return {
    harnessId: spec.id,
    runtime: spec.runtime.agent,
    runtimeVersion: capabilities?.version,
    command: { executable, args, cwd },
    generatedInstructions,
    controls,
    degradation,
  };
}
