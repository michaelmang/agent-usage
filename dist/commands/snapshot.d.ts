import type { ReviewResult } from "../review/types.js";
export declare function takeSnapshot(opts?: {
    json?: boolean;
    notify?: boolean;
    review?: boolean;
}): Promise<{
    date: string;
    jsonPath: string;
    txtPath: string;
    syncMessage: string;
    notifyMessage?: string;
    review?: ReviewResult;
    reviewMessage?: string;
}>;
