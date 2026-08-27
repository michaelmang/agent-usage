export interface ProjectConfig {
    name?: string;
    client?: string;
    contract_value?: number;
    aliases?: string[];
}
export interface AppConfig {
    projects: Record<string, ProjectConfig>;
    timezone?: string;
}
export declare function ensureConfigDir(): void;
export declare function loadConfig(): AppConfig;
export declare function writeDefaultConfig(force?: boolean): {
    created: boolean;
    path: string;
};
export declare function resolveProjectAlias(config: AppConfig, canonicalPath: string): ProjectConfig | undefined;
export declare function findProjectByQuery(config: AppConfig, query: string): {
    path: string;
    config: ProjectConfig;
} | undefined;
