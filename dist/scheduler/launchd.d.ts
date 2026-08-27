export declare function buildPlist(cliPath: string, opts?: {
    notify?: boolean;
    nodePath?: string;
}): string;
export declare function installScheduler(opts?: {
    notify?: boolean;
}): {
    plistPath: string;
    cliPath: string;
    notify: boolean;
};
export declare function uninstallScheduler(): void;
export declare function schedulerStatus(): {
    installed: boolean;
    plistPath: string;
    loaded: boolean;
    notify: boolean;
    detail: string;
};
