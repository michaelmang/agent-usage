import { spawn } from "node:child_process";

import type { ExecutionPlan } from "./types.js";
import { formatDryRun } from "./format.js";

export interface RunJitResult {
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  dryRun: boolean;
}

export async function runExecutionPlan(
  plan: ExecutionPlan,
  opts?: { dryRun?: boolean; timeoutMs?: number },
): Promise<RunJitResult> {
  if (opts?.dryRun) {
    return {
      exitCode: 0,
      stdout: formatDryRun(plan),
      stderr: "",
      dryRun: true,
    };
  }

  const timeoutMs = opts?.timeoutMs ?? 3_600_000;

  return new Promise((resolve) => {
    const child = spawn(plan.command.executable, plan.command.args, {
      cwd: plan.command.cwd,
      env: { ...process.env, ...plan.environment },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        signal: signal ?? undefined,
        stdout,
        stderr,
        dryRun: false,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${err.message}`,
        dryRun: false,
      });
    });
  });
}
