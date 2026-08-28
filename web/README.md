# Agent Usage — Web Dashboard

Local Next.js UI for today's usage snapshot and LLM workflow review.

## Requirements

- Node.js 20+
- Built `agent-usage` CLI (`npm run build` in repo root)
- API key for review in `~/.config/agent-usage/env` (see main README)

## Development

From the repo root:

```bash
npm run build          # build CLI first
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The tab favicon is an original classical landscape (wanderer above the mist) so you can spot this dashboard among other local dev tabs.

## Actions

| Button | CLI equivalent |
|--------|----------------|
| **Reload snapshot** | `agent-usage snapshot` |
| **Get recommendations** | `agent-usage recommend today` (sync + refresh) |
| **Generate review** | `agent-usage review` |

Data is read from `~/.local/share/agent-usage/snapshots/*.json`.

## Configuration

| Variable | Purpose |
|----------|---------|
| `AGENT_USAGE_CLI` | Path to `dist/cli.js` if not in parent directory |

The dev server runs from `web/` and defaults to `../dist/cli.js`.

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # serve production build
npm run lint         # ESLint
npm run format       # Prettier
npm run check        # format + lint + build
```
