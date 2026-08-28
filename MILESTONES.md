# Milestones (git commits + model/effort)

Experimental attribution of agent session activity to **git commits** and **model/effort settings** — no API wire-up required.

## What gets captured

From local Claude/Codex JSONL logs only (no prompts/responses stored):

| Kind | Claude | Codex |
|------|--------|-------|
| `git_commit` | `git commit` in Bash tool commands / output | `CommandExecution` with `git commit` |
| `model_change` | assistant `message.model`, `effort` field | `thread_settings_applied`, `token_count` snapshots |

Each row stores:

- timestamp
- project (via session → repo attribution)
- provider
- optional `git_sha`, `git_branch`, `git_subject`
- `model`, `effort` when present in logs
- cumulative token counters **as reported in the log at that moment** (Codex `token_count`; Claude per-message usage)

## Commands

```bash
agent-usage milestones
agent-usage milestones --commits          # git commits only (best for review)
agent-usage milestones kalam-app
agent-usage milestones kalam-app --json
```

Milestone ingestion runs automatically during `agent-usage sync` (recent sessions only).

## Cost at commit

Each `git_commit` milestone stores **`apiEquivalentCost`**: API-equivalent spend attributed to the work **since the previous commit in that session** (or since session start). Allocation uses ccusage session model costs proportional to token growth between commits.

```bash
agent-usage milestones --commits
agent-usage milestones --commits --json | jq '.[] | {at:.occurredAt, cost:.apiEquivalentCost, model, effort, subject:.gitSubject}'
```

## Model / effort in usage reports

Daily/week/month breakdowns and `agent-usage models` now split by **model + effort** (e.g. `Claude Sonnet 5 (high)`). Effort is inferred from session JSONL token distribution during sync.

After upgrading, run `agent-usage sync --force` once to re-attribute effort on existing sessions.

## Model / effort review

The logs already record what model and effort were active. You can manually review whether a milestone used the right settings:

```bash
agent-usage milestones monergism-ebooks-reader --json | jq '.[] | select(.kind=="git_commit") | {at:.occurredAt, model, effort, sha:.gitSha}'
```

No subscription/API billing API is needed for this — it's metadata already on disk.

## Limitations (v0)

- Commit SHAs only captured when present in command stdout (not all commits include them)
- Claude token counts at milestones are per-message increments, not session cumulative
- Codex `token_count` events are cumulative within a session turn
- High-volume history scan is capped (`maxFiles`) for speed; increase in code if needed
- Does not yet compute API-equivalent cost **at** each milestone (future: join with usage deltas)

## Future

- Join milestone timestamps to usage table deltas → `$ at commit` **(done: `apiEquivalentCost` on commits)**
- Tag "wrong model for task" heuristics in config
- Hook post-commit notification via agent-ping
