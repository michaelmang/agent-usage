<p align="center">
  <img src="assets/logo.png" width="220" alt="agent-usage logo" />
</p>

<h1 align="center">agent-usage</h1>

<p align="center">
  Local-first analytics for <strong>Claude Code</strong> and <strong>OpenAI Codex CLI</strong> usage, attributed to Git repositories/projects.
</p>

<p align="center">
  <a href="#installation">Install</a> ·
  <a href="docs/">Documentation</a> ·
  <a href="web/">Web dashboard</a>
</p>

---

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

### npx (recommended)

From npm (after the package is published):

```bash
npx agent-usage
npx agent-usage setup
```

From GitHub (works immediately):

```bash
npx github:michaelmang/agent-usage
npx github:michaelmang/agent-usage setup
```

Requires Node.js 20+ and a working C/C++ toolchain for `better-sqlite3` (Xcode CLI tools on macOS: `xcode-select --install`).

### Global install

```bash
npm install -g agent-usage
agent-usage setup
```

### From source

```bash
git clone https://github.com/michaelmang/agent-usage.git
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
| `review`                                                         | LLM workflow feedback (usage + commits)        |
| `recommend [week] [project]` or `recommend "<task>"`             | Heuristic tips or task-specific agent/model/JIT advice |
| `jit "<task>"`                                                   | Generate JIT harness (compile + persist)       |
| `jit run <id>` / `jit show <id>` / `jit capabilities`            | Execute, inspect, or probe runtime CLIs        |
| `web`                                                            | Local Next.js dashboard (see `web/README.md`)  |
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

## LLM workflow review (optional)

`review` sends today's usage breakdown and git commits (with model, effort, and cost per commit) to an LLM and appends structured feedback to the daily snapshot.

```bash
# One-off review (prints + saves to snapshot files)
agent-usage review

# Full daily pipeline: snapshot + phone notify + review
agent-usage snapshot --notify --review

# Scheduled (11:55 PM) with review
agent-usage install-scheduler --notify --review
```

**Setup:**

1. Export `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` with `review.provider: openai` in config)
2. For launchd, put the key in `~/.config/agent-usage/env`:

   ```bash
   export ANTHROPIC_API_KEY='sk-...'
   ```

3. Optional config in `~/.config/agent-usage/config.yaml`:

   ```yaml
   review:
     provider: anthropic   # or openai
     model: claude-haiku-4-5
     max_tokens: 1200
     max_commits: 15
   ```

Output is appended to `~/.local/share/agent-usage/snapshots/YYYY-MM-DD.txt` under **Workflow Review** and stored in the `.json` snapshot as `review`. Uses Haiku by default (~pennies per day).

## Daily scheduler

```bash
agent-usage install-scheduler --notify
agent-usage scheduler-status
```

Installs `~/Library/LaunchAgents/com.michael.agent-usage.daily.plist` to run at **11:55 PM** local time:

```bash
node /path/to/agent-usage/dist/cli.js snapshot --notify
```

With `--notify`, the snapshot is followed by `agent-ping usage`, which sends a compact summary to your phone via ntfy.

**Phone notifications require:**

1. [agent-ping](https://github.com/michaelmang/agent-ping) installed (`npm link` in that repo)
2. `NTFY_TOPIC` configured (see agent-ping README)
3. For launchd (no interactive shell), put credentials in `~/.config/agent-ping/env`:

```bash
mkdir -p ~/.config/agent-ping
cat > ~/.config/agent-ping/env <<'EOF'
NTFY_TOPIC=your-long-random-topic
# NTFY_TOKEN=tk_...
EOF
```

Then reinstall the scheduler so the plist picks up `--notify` and environment variables.

Logs: `~/.local/share/agent-usage/logs/`

Test the full chain manually:

```bash
agent-usage snapshot --notify
agent-ping usage --best-effort
```

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

## Documentation site

User guide powered by [Blume](https://useblume.dev). Content is in `docs/`; run the dev server from the repo root:

```bash
npm run docs:dev      # http://localhost:4321
npm run docs:build    # output: documentation/dist/
```

Requires Node.js 22.12+. See [docs/getting-started/documentation-site.mdx](docs/getting-started/documentation-site.mdx) for deploy notes.
