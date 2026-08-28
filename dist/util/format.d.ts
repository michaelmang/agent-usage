export declare function localDate(d?: Date, timeZone?: string): string;
export declare function localDateFromIso(iso: string | null | undefined, timeZone?: string): string | null;
export declare function addDays(dateStr: string, days: number): string;
export declare function startOfWeek(dateStr: string): string;
export declare function startOfMonth(dateStr: string): string;
export declare function formatMoney(n: number): string;
export declare function formatTokens(n: number): string;
export declare function formatClock(d?: Date): string;
export declare function displayModel(model: string): string;
export declare function displayModelEffort(model: string, effort?: string | null): string;
export declare function displayProvider(provider: string): string;
export declare function nowIso(): string;
export declare function truncateText(text: string, max: number): string;
/** Prefer commit message over `git` stdout diff summaries. */
export declare function pickCommitSubject(subject?: string | null): string;
export declare function mergeCommitSubjects(a?: string | null, b?: string | null): string | undefined;
