# Recommend command (heuristic, no LLM)

`agent-usage recommend` analyzes local usage + git-commit milestones and prints **actionable, rule-based** suggestions. No API calls — complements `review` (LLM narrative).

## Usage

```bash
agent-usage recommend
agent-usage recommend week
agent-usage recommend month kalam-app
agent-usage recommend --json
```

## What it answers (from data only)

| Question | Signal |
|----------|--------|
| Was usage productive? | Commits vs spend; cost per commit by project |
| Where was compute wasted? | High spend, few/no commits; single commits >> median cost |
| Best output-to-cost? | Leaderboard: commits per $100 API-equivalent |
| Expensive commits justified? | Flags commits costing >3× median (you check subjects) |
| Change delegation? | Claude vs Codex efficiency per project; model/effort mismatches |

## Heuristics (v1)

- **Spend without commits** — project cost ≥ $25 in period, zero commits
- **Heavy model** — Opus ≥ 40% of project spend; suggest Sonnet for routine work
- **High effort, low yield** — `high` effort on commits averaging &lt; $3
- **Cost spike** — commit cost &gt; 3× median for that project in period
- **Delegation** — both Claude and Codex on same project; compare $/commit
- **Best practice** — surface project with best commits-per-dollar as reference

Severity: `action` (likely fix), `watch` (review manually), `info` (positive pattern).

## vs `review`

| | `recommend` | `review` |
|---|-------------|----------|
| API | None | OpenAI / Anthropic |
| Output | Structured bullets + JSON | Prose workflow coach |
| Best for | Quick daily check, scripting | Deep narrative feedback |
