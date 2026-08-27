import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = homedir();

export const CONFIG_DIR = join(HOME, ".config", "agent-usage");
export const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

export const DATA_DIR = join(HOME, ".local", "share", "agent-usage");
export const DB_PATH = join(DATA_DIR, "usage.sqlite");
export const SNAPSHOT_DIR = join(DATA_DIR, "snapshots");
export const LOG_DIR = join(DATA_DIR, "logs");
export const CACHE_DIR = join(DATA_DIR, "cache");

export const CLAUDE_PROJECTS_DIR = join(HOME, ".claude", "projects");
export const CODEX_SESSIONS_DIR = join(HOME, ".codex", "sessions");

export const LAUNCH_AGENT_LABEL = "com.michael.agent-usage.daily";
export const LAUNCH_AGENT_PATH = join(
  HOME,
  "Library",
  "LaunchAgents",
  `${LAUNCH_AGENT_LABEL}.plist`,
);

export const UNASSIGNED_PATH = "__unassigned__";
export const UNASSIGNED_NAME = "Unassigned";
