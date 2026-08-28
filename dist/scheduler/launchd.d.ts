export declare function buildPlist(cliPath: string, opts?: {
    notify?: boolean;
    review?: boolean;
    nodePath?: string;
}): string;
export declare function installScheduler(opts?: {
    notify?: boolean;
    review?: boolean;
}): {
    plistPath: string;
    cliPath: string;
    notify: boolean;
    review: boolean;
};
export declare function uninstallScheduler(): void;
export declare function schedulerStatus(): {
    installed: boolean;
    plistPath: string;
    loaded: boolean;
    notify: boolean;
    review: boolean;
    detail: string;
};
