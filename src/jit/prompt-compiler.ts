import type { HarnessSpec } from "./types.js";

const PLANNING_LABELS: Record<string, string> = {
  direct: "Implement directly without a separate planning phase.",
  plan_then_execute: "Produce a short implementation plan before editing.",
  diagnosis_first: "Establish likely root cause before modifying code.",
  hypothesis_driven: "Maintain and test explicit competing hypotheses.",
  explore_then_plan: "Explore unfamiliar architecture before proposing implementation.",
};

const EDIT_LABELS: Record<string, string> = {
  direct: "You may edit as needed to complete the task.",
  inspect_before_edit: "Inspect relevant code before making edits.",
  reproduce_before_edit: "Reproduce or establish the failure before modifying code.",
  diagnosis_only: "Diagnose only; do not edit source files.",
};

const VALIDATION_LABELS: Record<string, string> = {
  none: "No validation required unless you introduce risk.",
  focused: "Run focused validation relevant to the change.",
  focused_then_full: "Run focused validation first; run broader suite after a fix.",
  full: "Run the full relevant test suite before completion.",
};

export function compileHarnessInstructions(spec: HarnessSpec): string {
  const lines: string[] = [
    "EXECUTION POLICY",
    "",
    "Task:",
    spec.task.text.trim(),
    "",
    `Task class: ${spec.task.class}`,
    `Risk: ${spec.task.risk} · Ambiguity: ${spec.task.ambiguity}`,
    "",
    "Operating mode:",
    PLANNING_LABELS[spec.planning.strategy] ?? spec.planning.strategy,
    "",
    "Requirements:",
  ];

  let n = 1;
  lines.push(`${n}. ${EDIT_LABELS[spec.action.editPolicy] ?? spec.action.editPolicy}`);
  n += 1;

  if (spec.planning.requirePlanBeforeEdit) {
    lines.push(`${n}. Write a brief plan before the first edit.`);
    n += 1;
  }
  if (spec.planning.replanOnFailure) {
    lines.push(`${n}. If the approach fails, replan before retrying.`);
    n += 1;
  }
  if (spec.planning.strategy === "hypothesis_driven") {
    lines.push(`${n}. State the active hypothesis before each diagnostic change.`);
    n += 1;
    lines.push(`${n}. Test hypotheses independently; avoid mixing diagnostic changes.`);
    n += 1;
  }
  if (spec.action.stopOnUnexpectedScopeExpansion) {
    lines.push(`${n}. Do not broaden scope unless evidence requires it.`);
    n += 1;
  }
  if (spec.action.maxFailedAttempts != null) {
    lines.push(
      `${n}. After ${spec.action.maxFailedAttempts} failed approaches, stop and summarize findings.`,
    );
    n += 1;
  }

  if (spec.tools.deny?.length) {
    lines.push(`${n}. Do not use these tools: ${spec.tools.deny.join(", ")}.`);
    n += 1;
  }
  if (spec.tools.allow?.length) {
    lines.push(`${n}. Prefer these tools when applicable: ${spec.tools.allow.join(", ")}.`);
    n += 1;
  }

  lines.push("", "Validation:", VALIDATION_LABELS[spec.action.validation] ?? spec.action.validation);

  if (spec.context.strategy === "minimal") {
    lines.push("", "Context: rely on ordinary runtime defaults; avoid broad exploration.");
  } else if (spec.context.strategy === "selective") {
    lines.push("", "Context: focus on relevant files and metadata; avoid whole-repo dumps.");
  } else {
    lines.push("", "Context: broad exploration is permitted when needed.");
  }

  if (spec.escalation?.enabled) {
    lines.push(
      "",
      `Escalation: if ${(spec.escalation.conditions ?? ["blocked"]).join("; ")}, consider ${spec.escalation.nextModel ?? "a stronger model"}${spec.escalation.nextEffort ? ` at ${spec.escalation.nextEffort} effort` : ""}.`,
    );
  }

  return lines.join("\n").trim() + "\n";
}
