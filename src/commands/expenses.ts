import { getDb } from "../db/schema.js";
import { formatMoney, localDate, nowIso } from "../util/format.js";
import { rangeMonth } from "../report/queries.js";

export function addExpense(opts: {
  provider: string;
  amount: number;
  type: string;
  date?: string;
  note?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO expenses(provider, amount, type, date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.provider.toLowerCase(),
    opts.amount,
    opts.type.toLowerCase(),
    opts.date ?? localDate(),
    opts.note ?? null,
    nowIso(),
  );
}

export function listExpenses(from: string, to: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, provider, amount, type, date, note
       FROM expenses
       WHERE date >= ? AND date <= ?
       ORDER BY date, provider, type`,
    )
    .all(from, to) as Array<{
    id: number;
    provider: string;
    amount: number;
    type: string;
    date: string;
    note: string | null;
  }>;
}

export function economicsReport(period: "month" | "all" = "month"): {
  text: string;
  json: unknown;
} {
  const db = getDb();
  const range = period === "month" ? rangeMonth() : { from: "1970-01-01", to: localDate() };
  const expenses = listExpenses(range.from, range.to);

  const usage = db
    .prepare(
      `SELECT COALESCE(SUM(api_equivalent_cost), 0) AS cost
       FROM usage WHERE date >= ? AND date <= ?`,
    )
    .get(range.from, range.to) as { cost: number };

  const grouped = new Map<string, number>();
  for (const e of expenses) {
    const label = `${capitalize(e.provider)} ${e.type}`;
    grouped.set(label, (grouped.get(label) ?? 0) + e.amount);
  }
  const actualSpend = expenses.reduce((s, e) => s + e.amount, 0);
  const apiEquiv = Number(usage.cost) || 0;

  const lines = [
    "Actual AI tooling expense",
    ...[...grouped.entries()].map(
      ([label, amount]) => `  ${label.padEnd(28)} ${formatMoney(amount)}`,
    ),
    "  ─────────────────────────────────",
    `  ${"Actual spend".padEnd(28)} ${formatMoney(actualSpend)}`,
    "",
    `API-equivalent usage             ${formatMoney(apiEquiv)}`,
  ];

  return {
    text: lines.join("\n"),
    json: {
      range,
      expenses,
      actualSpend,
      apiEquivalentUsage: apiEquiv,
      grouped: Object.fromEntries(grouped),
    },
  };
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
