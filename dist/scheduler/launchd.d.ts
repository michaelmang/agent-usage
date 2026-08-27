export declare function buildPlist(cliPath: string, nodePath?: string): string;
export declare function installScheduler(): {
    plistPath: string;
    cliPath: string;
};
export declare function uninstallScheduler(): void;
export declare function schedulerStatus(): {
    installed: boolean;
    plistPath: string;
    loaded: boolean;
    detail: string;
};
