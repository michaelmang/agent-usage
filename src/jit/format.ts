import type { ExecutionPlan, HarnessSpec, JitHarnessRecord } from "./types.js";

function capLabel(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function displayRuntime(agent: string): string {
  if (agent === "codex") return "Codex";
  if (agent === "claude") return "Claude Code";
  if (agent === "pi") return "Pi";
  return agent;
}

function controlLine(kind: string, label: string): string {
  const sym =
    kind === "native"
      ? "✓"
      : kind === "wrapper_enforced"
        ? "✓"
        : kind === "prompt_enforced"
          ? "~"
          : "×";
  return `  ${sym} ${label}`;
}

export function formatJitSummary(
  spec: HarnessSpec,
  plan: ExecutionPlan,
  opts?: { fallbackMessage?: string; runHint?: boolean },
): string {
  const lines: string[] = [
    `JIT Harness: ${spec.id}`,
    "",
    `Runtime        ${displayRuntime(spec.runtime.agent)}`,
    `Model          ${capLabel(spec.runtime.model)}`,
  ];

  if (spec.runtime.effort) {
    lines.push(`Effort         ${capLabel(spec.runtime.effort)}`);
  }
  lines.push(
    `JIT level      ${capLabel(spec.jitLevel ?? "full")}`,
    `Context        ${capLabel(spec.context.strategy)}`,
    `Planning       ${spec.planning.strategy.replace(/_/g, "-")}`,
    `Session        ${capLabel(spec.session.strategy)}`,
    "",
    "Native controls",
  );

  for (const c of plan.controls.native) {
    lines.push(controlLine("native", c.label));
  }
  if (plan.controls.promptEnforced.length) {
    lines.push("", "Prompt-enforced");
    for (const c of plan.controls.promptEnforced) {
      lines.push(controlLine("prompt_enforced", c.label));
    }
  }
  if (plan.controls.wrapperEnforced.length) {
    lines.push("", "Wrapper-enforced");
    for (const c of plan.controls.wrapperEnforced) {
      lines.push(controlLine("wrapper_enforced", c.label));
    }
  }
  if (plan.controls.unsupported.length) {
    lines.push("", "Unsupported");
    for (const c of plan.controls.unsupported) {
      lines.push(controlLine("unsupported", c.label));
    }
  }

  if (plan.degradation) {
    lines.push("", "Compilation degradation:", plan.degradation.message ?? "");
    for (const u of plan.degradation.unsupported) {
      lines.push(`  - ${u}`);
    }
  }

  if (opts?.fallbackMessage) {
    lines.push("", opts.fallbackMessage);
  }

  if (opts?.runHint) {
    lines.push("", "Run with:", `  agent-usage jit run ${spec.id}`);
  }

  return lines.join("\n");
}

export function formatCapabilitiesReport(
  caps: import("./types.js").RuntimeCapabilities[],
): string {
  const lines: string[] = [];
  for (const cap of caps) {
    lines.push(`${displayRuntime(cap.runtime)} ${cap.version ?? "unknown"}`, "");
    const rows: Array<[string, string]> = [
      ["Model selection", fmtCap(cap.modelSelection)],
      ["Reasoning effort", fmtCap(cap.reasoningEffort)],
      ["Session resume", fmtCap(cap.sessionResume)],
      ["Session continuation", fmtCap(cap.sessionContinuation)],
      ["Tool allow/deny", fmtCap(cap.allowedTools)],
      ["Denied tools", fmtCap(cap.deniedTools)],
      ["Max turns", fmtCap(cap.maxTurns)],
      ["Custom memory policy", fmtCap(cap.customMemoryPolicy)],
      ["Custom planning loop", fmtCap(cap.customPlanningLoop)],
    ];
    for (const [label, val] of rows) {
      lines.push(`${label.padEnd(28)} ${val}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function fmtCap(v: boolean | "partial" | "wrapper"): string {
  if (v === true) return "✓";
  if (v === false) return "×";
  return v;
}

export function formatJitShow(record: JitHarnessRecord, plan?: ExecutionPlan): string {
  const lines = [
    `Harness ${record.id}`,
    `Status: ${record.status} · JIT ${record.jitLevel} · ${record.createdAt}`,
    "",
    "Task:",
    record.spec.task.text,
    "",
  ];

  if (record.taskRecommendation) {
    lines.push("Recommendation reasoning:");
    for (const r of record.taskRecommendation.reasoning) {
      lines.push(`  - ${r}`);
    }
    lines.push(
      "",
      `JIT: ${record.taskRecommendation.jit.level} (${record.taskRecommendation.jit.confidence.toFixed(2)})`,
      record.taskRecommendation.jit.reason,
      "",
    );
  }

  if (record.generation) {
    lines.push(
      "Generation:",
      `  ${record.generation.model} · ${record.generation.durationMs}ms`,
    );
    if (record.generation.actualCost != null) {
      lines.push(`  Actual cost: $${record.generation.actualCost.toFixed(4)}`);
    }
    lines.push(`  Rationale: ${record.generation.rationale}`, "");
  }

  if (plan) {
    lines.push(formatJitSummary(record.spec, plan));
  }

  return lines.join("\n");
}

export function formatTaskRecommendationText(rec: import("./types.js").TaskRecommendation): string {
  const lines = [
    `Task recommendation — ${rec.taskClass}`,
    "",
    `Task: ${rec.task}`,
    `Risk: ${rec.risk} · Ambiguity: ${rec.ambiguity}`,
    "",
    `Runtime: ${rec.runtime.agent} / ${rec.runtime.model}${rec.runtime.effort ? ` / ${rec.runtime.effort}` : ""}`,
    "",
    "JIT:",
    `  Level: ${rec.jit.level} (confidence ${rec.jit.confidence.toFixed(2)})`,
    `  Recommended: ${rec.jit.recommended ? "yes" : "no"}`,
    `  ${rec.jit.reason}`,
    "",
    "Reasoning:",
    ...rec.reasoning.map((r) => `  - ${r}`),
    "",
    rec.jit.level !== "none"
      ? `Generate harness: agent-usage jit "${rec.task}"`
      : "No JIT harness needed for this task.",
  ];
  return lines.join("\n");
}

export function formatDryRun(plan: ExecutionPlan): string {
  return [
    "Dry run — no execution",
    "",
    `Executable: ${plan.command.executable}`,
    `Args: ${plan.command.args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(" ")}`,
    `Cwd: ${plan.command.cwd}`,
    "",
    "Instructions:",
    plan.generatedInstructions,
  ].join("\n");
}
