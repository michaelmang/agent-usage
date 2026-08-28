import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CONFIG_DIR, CONFIG_PATH } from "./paths.js";

export interface ProjectConfig {
  name?: string;
  client?: string;
  contract_value?: number;
  aliases?: string[];
}

export interface ReviewConfigYaml {
  provider?: "anthropic" | "openai";
  model?: string;
  max_tokens?: number;
  max_commits?: number;
}

export interface JitConfigYaml {
  provider?: "anthropic" | "openai";
  model?: string;
  max_tokens?: number;
}

export interface AppConfig {
  projects: Record<string, ProjectConfig>;
  timezone?: string;
  review?: ReviewConfigYaml;
  jit?: JitConfigYaml;
}

const DEFAULT_CONFIG: AppConfig = {
  projects: {},
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_PATH)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const parsed = (parseYaml(raw) ?? {}) as Partial<AppConfig>;
  return {
    projects: parsed.projects ?? {},
    timezone: parsed.timezone ?? DEFAULT_CONFIG.timezone,
    review: parsed.review,
    jit: parsed.jit,
  };
}

export function writeDefaultConfig(force = false): { created: boolean; path: string } {
  ensureConfigDir();
  if (existsSync(CONFIG_PATH) && !force) {
    return { created: false, path: CONFIG_PATH };
  }
  const sample: AppConfig = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    review: {
      provider: "anthropic",
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      max_commits: 15,
    },
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

export function resolveProjectAlias(
  config: AppConfig,
  canonicalPath: string,
): ProjectConfig | undefined {
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

export function findProjectByQuery(
  config: AppConfig,
  query: string,
): { path: string; config: ProjectConfig } | undefined {
  const q = query.toLowerCase();
  const entries = Object.entries(config.projects);
  for (const [path, cfg] of entries) {
    const name = (cfg.name ?? basenamePath(path)).toLowerCase();
    if (
      name === q ||
      name.includes(q) ||
      path.toLowerCase().includes(q) ||
      basenamePath(path).toLowerCase().includes(q) ||
      cfg.aliases?.some((a) => a.toLowerCase().includes(q))
    ) {
      return { path, config: cfg };
    }
  }
  return undefined;
}

function basenamePath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
