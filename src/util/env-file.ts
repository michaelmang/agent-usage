import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "../paths.js";

export const REVIEW_ENV_FILE = join(CONFIG_DIR, "env");

/** Load KEY=value lines from ~/.config/agent-usage/env into process.env (does not override). */
export function loadReviewEnvFile(): void {
  if (!existsSync(REVIEW_ENV_FILE)) return;
  for (const line of readFileSync(REVIEW_ENV_FILE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let key = trimmed.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
