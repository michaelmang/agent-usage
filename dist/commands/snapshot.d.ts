export declare function takeSnapshot(opts?: {
    json?: boolean;
}): Promise<{
    date: string;
    jsonPath: string;
    txtPath: string;
    syncMessage: string;
}>;
