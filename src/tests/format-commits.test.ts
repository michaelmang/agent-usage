import assert from "node:assert/strict";
import test from "node:test";

import { formatMilestonesTable } from "../report/format.js";
import { mergeCommitSubjects, pickCommitSubject, truncateText } from "../util/format.js";

test("truncateText adds ellipsis for long strings", () => {
  assert.equal(truncateText("hello world", 20), "hello world");
  assert.equal(truncateText("hello world", 8), "hello w…");
});

test("pickCommitSubject prefers messages over diff stats", () => {
  assert.equal(
    pickCommitSubject("Add v1.2 scope doc: social login, push, admin 2FA"),
    "Add v1.2 scope doc: social login, push, admin 2FA",
  );
  assert.match(pickCommitSubject("3 files changed, 74 insertions(+)"), /files changed/);
});

test("mergeCommitSubjects prefers commit message over stdout stats", () => {
  assert.equal(
    mergeCommitSubjects("3 files changed, 74 insertions(+)", "Fix Firebase build error"),
    "Fix Firebase build error",
  );
});

test("formatMilestonesTable keeps one row per commit", () => {
  const table = formatMilestonesTable([
    {
      occurredAt: "2026-08-27T22:25:55.000Z",
      kind: "git_commit",
      gitSha: "6509160abc",
      gitSubject:
        "Add v1.2 scope doc: social login, push notifications, admin 2FA, and daily library shuffle",
      model: "claude-sonnet-5",
      effort: "high",
      apiEquivalentCost: 33.78,
      projectName: "kalam-app",
      provider: "claude",
    },
  ]);
  const lines = table.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /6509160/);
  assert.match(lines[1], /Add v1\.2 scope doc/);
  assert.doesNotMatch(lines[1], /social login, push notifications, admin 2FA, and daily/);
});
