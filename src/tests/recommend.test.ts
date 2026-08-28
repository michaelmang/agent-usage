import assert from "node:assert/strict";
import test from "node:test";

import { formatRecommendText } from "../recommend/format.js";
import type { RecommendReport } from "../recommend/types.js";

test("formatRecommendText includes leaderboard and recommendations", () => {
  const report: RecommendReport = {
    title: "Recommendations — Today",
    range: { from: "2026-08-27", to: "2026-08-27" },
    generatedAt: "2026-08-27T22:00:00.000Z",
    totalCost: 100,
    commitCount: 4,
    costPerCommit: 25,
    projects: [
      {
        project: "kalam-app",
        commits: 3,
        cost: 90,
        costPerCommit: 30,
        commitsPer100Dollars: 3.33,
        opusShare: 0.5,
      },
    ],
    recommendations: [
      {
        severity: "watch",
        category: "model",
        project: "kalam-app",
        title: "Opus-heavy spend",
        detail: "Try Sonnet for routine work.",
      },
    ],
  };

  const text = formatRecommendText(report);
  assert.match(text, /LEADERBOARD/);
  assert.match(text, /kalam-app/);
  assert.match(text, /\[WATCH\]/);
  assert.match(text, /Opus-heavy/);
});
