import assert from "node:assert/strict";
import test from "node:test";

import {
  commandRunsGitCommit,
  gitSubjectFromCommand,
  parseClaudeLineForTest,
} from "../ingest/milestones.js";
import { createScanState } from "../ingest/milestones.js";

test("commandRunsGitCommit ignores git status help text", () => {
  assert.equal(
    commandRunsGitCommit(
      'no changes added to commit (use "git add" and/or "git commit -a")',
    ),
    false,
  );
  assert.equal(commandRunsGitCommit("git add foo\ngit commit -m \"Fix bug\""), true);
});

test("gitSubjectFromCommand extracts heredoc subject", () => {
  const cmd = `git commit -m "$(cat <<'EOF'
Fix fatal error breaking uploads
More detail here
EOF
)"`;
  assert.equal(gitSubjectFromCommand(cmd), "Fix fatal error breaking uploads");
});

test("parseClaudeLine dedupes model changes and detects bash git commit", () => {
  const sessionId = "bf814b3d-6b43-45ee-9c17-2866e55e9586";
  const state = createScanState([]);
  const assistant = JSON.stringify({
    type: "assistant",
    sessionId,
    timestamp: "2026-08-26T12:55:55.515Z",
    gitBranch: "main",
    effort: "high",
    message: {
      model: "claude-sonnet-5",
      content: [
        {
          type: "tool_use",
          name: "Bash",
          input: { command: "git add foo\ngit commit -m \"Ship fix\"" },
        },
      ],
      usage: { input_tokens: 2, output_tokens: 100 },
    },
  });

  const first = parseClaudeLineForTest(assistant, state);
  assert.equal(first.filter((r) => r.kind === "model_change").length, 1);
  assert.equal(first.filter((r) => r.kind === "git_commit").length, 1);
  assert.equal(first.find((r) => r.kind === "git_commit")?.gitSubject, "Ship fix");

  const second = parseClaudeLineForTest(assistant.replace("12:55:55", "12:56:01"), state);
  assert.equal(second.filter((r) => r.kind === "model_change").length, 0);
});
