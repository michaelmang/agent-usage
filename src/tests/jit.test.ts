import { test } from "node:test";
import assert from "node:assert/strict";

import { recommendTask } from "../jit/recommend-task.js";
import { validateHarnessSpec, buildNoneHarnessSpec } from "../jit/validate.js";
import { compileHarnessInstructions } from "../jit/prompt-compiler.js";
import { generateJitId } from "../jit/ids.js";

test("recommendTask classifies mechanical rename as none JIT", () => {
  const rec = recommendTask("Rename getUserData to fetchUserData");
  assert.equal(rec.jit.level, "none");
  assert.equal(rec.taskClass, "mechanical_edit");
});

test("recommendTask classifies ambiguous bug as full JIT", () => {
  const rec = recommendTask(
    "Figure out why indexed EPUB records occasionally disappear after synchronization",
  );
  assert.equal(rec.jit.level, "full");
  assert.match(rec.taskClass, /ambiguous|debugging/);
});

test("validateHarnessSpec rejects dangerous patterns", () => {
  const id = generateJitId();
  const spec = buildNoneHarnessSpec(
    recommendTask("fix bug"),
    id,
    new Date().toISOString(),
  );
  spec.task.text = "rm -rf /";
  assert.throws(() => validateHarnessSpec(spec));
});

test("compileHarnessInstructions includes task and validation", () => {
  const id = generateJitId();
  const spec = buildNoneHarnessSpec(
    recommendTask("Add CSV export"),
    id,
    new Date().toISOString(),
  );
  const text = compileHarnessInstructions(spec);
  assert.match(text, /EXECUTION POLICY/);
  assert.match(text, /Add CSV export/);
});
