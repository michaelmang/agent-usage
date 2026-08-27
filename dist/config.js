import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CONFIG_DIR, CONFIG_PATH } from "./paths.js";
const DEFAULT_CONFIG = {
    projects: {},
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};
export function ensureConfigDir() {
    mkdirSync(CONFIG_DIR, { recursive: true });
}
export function loadConfig() {
    if (!existsSync(CONFIG_PATH)) {
        return structuredClone(DEFAULT_CONFIG);
    }
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = (parseYaml(raw) ?? {});
    return {
        projects: parsed.projects ?? {},
        timezone: parsed.timezone ?? DEFAULT_CONFIG.timezone,
    };
}
export function writeDefaultConfig(force = false) {
    ensureConfigDir();
    if (existsSync(CONFIG_PATH) && !force) {
        return { created: false, path: CONFIG_PATH };
    }
    const sample = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        projects: {
            "/absolute/path/to/your-repo": {
                name: "Example Project",
                client: "Client Name",
                contract_value: 10000,
            },
        },
    };
    writeFileSync(CONFIG_PATH, stringifyYaml(sample), "utf8");
    return { created: true, path: CONFIG_PATH };
}
export function resolveProjectAlias(config, canonicalPath) {
    if (config.projects[canonicalPath]) {
        return config.projects[canonicalPath];
    }
    for (const [, cfg] of Object.entries(config.projects)) {
        if (cfg.aliases?.includes(canonicalPath)) {
            return cfg;
        }
    }
    return undefined;
}
export function findProjectByQuery(config, query) {
    const q = query.toLowerCase();
    const entries = Object.entries(config.projects);
    for (const [path, cfg] of entries) {
        const name = (cfg.name ?? basenamePath(path)).toLowerCase();
        if (name === q ||
            name.includes(q) ||
            path.toLowerCase().includes(q) ||
            basenamePath(path).toLowerCase().includes(q) ||
            cfg.aliases?.some((a) => a.toLowerCase().includes(q))) {
            return { path, config: cfg };
        }
    }
    return undefined;
}
function basenamePath(p) {
    const parts = p.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? p;
}
