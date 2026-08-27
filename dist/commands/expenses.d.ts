export declare function addExpense(opts: {
    provider: string;
    amount: number;
    type: string;
    date?: string;
    note?: string;
}): void;
export declare function listExpenses(from: string, to: string): Array<{
    id: number;
    provider: string;
    amount: number;
    type: string;
    date: string;
    note: string | null;
}>;
export declare function economicsReport(period?: "month" | "all"): {
    text: string;
    json: unknown;
};
