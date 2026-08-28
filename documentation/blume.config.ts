import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "blume";

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(here, "..", "docs");

export default defineConfig({
  title: "agent-usage",
  description:
    "Local-first analytics for Claude Code and Codex CLI — usage by Git project, snapshots, reviews, recommendations, and JIT harnesses.",
  content: {
    root: docsRoot,
  },
  github: {
    owner: "michaelmang",
    repo: "agent-usage",
  },
  ai: {
    llmsTxt: true,
  },
  theme: {
    accent: "teal",
    mode: "system",
  },
  deployment: {
    output: "static",
  },
});
