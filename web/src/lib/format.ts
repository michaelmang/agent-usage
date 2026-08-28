export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const formatted =
    abs >= 100
      ? abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function displayModel(model: string, effort?: string): string {
  const known: Record<string, string> = {
    'claude-opus-4-8': 'Claude Opus 4.8',
    'claude-opus-5': 'Claude Opus 5',
    'claude-sonnet-5': 'Claude Sonnet 5',
    'claude-sonnet-4': 'Claude Sonnet 4',
    'gpt-5.6-terra': 'GPT-5.6 Terra',
    'gpt-5.6-sol': 'GPT-5.6 Sol',
  };
  const label = known[model] ?? model;
  return effort ? `${label} (${effort})` : label;
}

export function displayProvider(provider: string): string {
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex') return 'Codex';
  if (provider === 'cursor') return 'Cursor';
  return provider;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
