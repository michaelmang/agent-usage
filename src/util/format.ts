export function localDate(d = new Date(), timeZone?: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

export function localDateFromIso(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localDate(d, timeZone);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export function startOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  return localDate(d);
}

export function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const formatted =
    abs >= 100
      ? abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function formatClock(d = new Date()): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function displayModel(model: string): string {
  const known: Record<string, string> = {
    "claude-opus-4-8": "Claude Opus 4.8",
    "claude-opus-5": "Claude Opus 5",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-sonnet-4": "Claude Sonnet 4",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.5": "GPT-5.5",
    "gpt-5.4": "GPT-5.4",
    "gpt-5.2-codex": "GPT-5.2 Codex",
  };
  if (known[model]) return known[model];
  return model;
}

export function displayModelEffort(model: string, effort?: string | null): string {
  const label = displayModel(model);
  if (!effort) return label;
  return `${label} (${effort})`;
}

export function displayProvider(provider: string): string {
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "cursor") return "Cursor";
  return provider;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function truncateText(text: string, max: number): string {
  const trimmed = text.trim();
  if (max <= 0) return "";
  if (trimmed.length <= max) return trimmed;
  if (max === 1) return "…";
  return `${trimmed.slice(0, max - 1)}…`;
}

const GIT_DIFF_STATS = /^\d+\s+files?\s+changed\b/i;

/** Prefer commit message over `git` stdout diff summaries. */
export function pickCommitSubject(subject?: string | null): string {
  const trimmed = subject?.trim() ?? "";
  if (!trimmed) return "";
  if (GIT_DIFF_STATS.test(trimmed)) return truncateText(trimmed, 32);
  return trimmed;
}

export function mergeCommitSubjects(
  a?: string | null,
  b?: string | null,
): string | undefined {
  const sa = a?.trim() ?? "";
  const sb = b?.trim() ?? "";
  const aStats = sa ? GIT_DIFF_STATS.test(sa) : true;
  const bStats = sb ? GIT_DIFF_STATS.test(sb) : true;
  if (sa && !aStats) return sa;
  if (sb && !bStats) return sb;
  return sa || sb || undefined;
}
