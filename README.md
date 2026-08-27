# agent-usage

Local-first analytics for **Claude Code** and **OpenAI Codex CLI** usage, attributed to Git repositories/projects.

It does **not** reimplement token/cost math. It wraps [`ccusage`](https://github.com/ryoppippi/ccusage) for tokens and API-equivalent cost, then joins that data to Claude/Codex session metadata for working-directory → repo attribution.

## What it does

- Associates agent sessions with the Git repo where they ran
- Stores normalized historical usage in local SQLite
- Syncs on every interactive query (instant when sources unchanged)
- Writes optional daily snapshots via a macOS LaunchAgent
- Reports usage by project, provider, model, and date
- Optionally tracks actual subscription/credit spend for comparison

## Architecture

```text
Claude session logs ─┐
                     ├─> session/project resolver ─┐
Codex session logs ──┘                             │
                                                   ├─> normalized usage
ccusage JSON ───────────> token/cost parser ───────┘
                                                          │
                                                          ▼
                                                       SQLite
                                                          │
                                      ┌───────────────────┼────────────────┐
                                      ▼                   ▼                ▼
                                  CLI report       daily snapshot      JSON export
```

**ccusage** is the source of truth for token totals and API-equivalent cost (per session + model).  
**Claude/Codex logs** supply session ID, cwd, and timestamps only (no prompts/responses stored).

Usage counters from ccusage are **cumulative per session**. Ingestion upserts those totals and records only **positive deltas** into dated usage rows so repeated syncs do not double-count.

## Requirements

- macOS (LaunchAgent scheduler is macOS-specific; CLI works anywhere Node runs)
- Node.js 20+
- `git` on PATH
- Existing Claude Code and/or Codex session logs
- Network optional (`ccusage` is run with `--offline` cached pricing by default)

## Installation

```bash
cd agent-usage
npm install
npm run build
npm link
agent-usage setup
```

`setup` will:

1. Create `~/.local/share/agent-usage/` and `~/.config/agent-usage/`
2. Initialize SQLite
3. Write a sample config if missing (never overwrites without confirmation)
4. Import historical sessions via ccusage
5. Optionally install the daily LaunchAgent

## Configuration

Edit `~/.config/agent-usage/config.yaml`:

```yaml
timezone: America/New_York
projects:
  "/Users/michael/code/corpus-search":
    name: "Corpus Semantic Search"
    client: "Client A"
    contract_value: 10000

  "/Users/michael/code/arabic-ebook":
    name: "Arabic Ebook"
    client: "Client B"
    contract_value: 3750
```

- Keys are absolute canonical paths (usually Git tops)
- `client` is only shown when you set it
- Sessions outside Git default to **Unassigned** (cwd retained for later aliases)

## Commands

| Command                                                          | Purpose                                      |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `agent-usage` / `today`                                          | Sync + today's usage by project              |
| `yesterday` / `week` / `month`                                   | Period reports                               |
| `project <query>`                                                | Project detail + lifetime + contract ratio   |
| `projects`                                                       | Today / week / month table                   |
| `models`                                                         | Model breakdown (month)                      |
| `sync`                                                           | Explicit refresh (`--force` to ignore cache) |
| `snapshot`                                                       | Sync + write daily JSON/TXT snapshot         |
| `setup`                                                          | First-time init                              |
| `install-scheduler` / `uninstall-scheduler` / `scheduler-status` | LaunchAgent                                  |
| `expense add <provider> <amount> --type subscription\|credits`   | Actual spend                                 |
| `economics month`                                                | Actual spend vs API-equivalent usage         |
| `paths`                                                          | Show config/data locations                   |

All important reports accept `--json`.

Examples:

```bash
agent-usage
agent-usage today --json
agent-usage project kalam-app
agent-usage week
agent-usage expense add claude 100 --type subscription
agent-usage economics month
```

## Daily scheduler

```bash
agent-usage install-scheduler
```

Installs `~/Library/LaunchAgents/com.michael.agent-usage.daily.plist` to run at **11:55 PM** local time:

```bash
node /absolute/path/to/agent-usage/dist/cli.js snapshot
```

Logs: `~/.local/share/agent-usage/logs/`

## Data locations

| Path                                      | Contents                                 |
| ----------------------------------------- | ---------------------------------------- |
| `~/.local/share/agent-usage/usage.sqlite` | Authoritative DB                         |
| `~/.local/share/agent-usage/snapshots/`   | Daily `.json` / `.txt` convenience files |
| `~/.local/share/agent-usage/cache/`       | Cached ccusage JSON                      |
| `~/.local/share/agent-usage/logs/`        | Scheduler logs                           |
| `~/.config/agent-usage/config.yaml`       | Project aliases                          |

## Uninstall

```bash
agent-usage uninstall-scheduler
npm unlink -g agent-usage
# optional: remove local data
rm -rf ~/.local/share/agent-usage ~/.config/agent-usage
```

## API-equivalent cost

**API-equivalent cost** (also labeled **API-equivalent usage**) is an estimate of what token usage would cost under applicable metered/API pricing (as computed by ccusage).

It is **not** necessarily your actual subscription expense. Actual business cost is typically subscription fees + purchased credits. Use `expense` / `economics` to compare the two.

## Privacy

Everything stays on your machine. The tool does not upload session contents, repository paths, prompts, or source code. The database stores only analytics metadata (paths, token counts, costs, timestamps).

## Limitations

- Historical days before first install attribute each session’s full cumulative total to its last-activity date (lifetime by project is accurate; pre-install daily charts are approximate)
- After install, frequent syncs attribute growth deltas to the local day of the sync
- Cursor is reserved for later; not ingested yet
- ccusage must be able to read your local Claude/Codex logs

## Development

```bash
npm run build
npm test
npm run check
```
