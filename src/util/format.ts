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
  return model
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT-")
    .replace(/-(\d)/g, " $1")
    .replace(/\bopus\b/gi, "Opus")
    .replace(/\bsonnet\b/gi, "Sonnet")
    .replace(/\bhaiku\b/gi, "Haiku")
    .replace(/\bterra\b/gi, "Terra")
    .replace(/\bsol\b/gi, "Sol")
    .replace(/\bcodex\b/gi, "Codex");
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
