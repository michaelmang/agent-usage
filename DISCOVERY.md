# Discovery notes (this machine)

Investigated 2026-08-27 against installed tools and local logs.

## ccusage

- Authoritative package: `ccusage@20.x` (`session --json -O`)
- Unified JSON shape: `{ session: [{ agent, period, modelBreakdowns, totalCost, metadata.lastActivity, ... }] }`
- Claude `period` = conversation UUID
- Codex `period` = relative rollout path `YYYY/MM/DD/rollout-...`
- Totals are **cumulative per session** (not daily increments)
- Offline mode (~2–8s) is preferred; fingerprint cache makes unchanged syncs ~10–40ms

## Claude Code

- Sessions: `~/.claude/projects/<encoded-path>/<uuid>.jsonl`
- Encoding: absolute path with `/` and `.` replaced by `-`, prefixed with `-`
- Message records include `cwd`, `sessionId`, `timestamp`
- Folder encoding is preferred when JSONL `cwd` is stale/moved (e.g. `kalam_app` → `kalam-app`)

## Codex

- Sessions: `~/.codex/sessions/**/rollout-*.jsonl`
- First record `type=session_meta` has `payload.cwd` and `payload.session_id`
- First line can be multi-MB; stream a single readline

## Join + storage strategy

1. Pull cumulative session/model totals from ccusage
2. Resolve cwd from Claude/Codex metadata
3. Map cwd → git toplevel (or Unassigned / alias)
4. Upsert `session_totals`; on first import seed dated `usage` by last-activity date; afterward apply positive deltas to today's local date
