export declare function takeSnapshot(opts?: {
    json?: boolean;
    notify?: boolean;
}): Promise<{
    date: string;
    jsonPath: string;
    txtPath: string;
    syncMessage: string;
    notifyMessage?: string;
}>;
