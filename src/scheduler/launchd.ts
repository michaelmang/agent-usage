import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { LAUNCH_AGENT_LABEL, LAUNCH_AGENT_PATH, LOG_DIR } from "../paths.js";

function resolveCliPath(): string {
  // Prefer the built CLI next to this module when installed/linked
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidate = `${here}../cli.js`;
  if (existsSync(candidate)) return candidate;

  try {
    const require = createRequire(import.meta.url);
    return require.resolve("agent-usage/dist/cli.js");
  } catch {
    // fall through
  }

  // Development: repo dist
  const repoCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
  if (existsSync(repoCli)) return repoCli;

  throw new Error("Could not locate agent-usage CLI path for LaunchAgent");
}

export function buildPlist(cliPath: string, nodePath = process.execPath): string {
  mkdirSync(LOG_DIR, { recursive: true });
  const stdout = `${LOG_DIR}/daily.stdout.log`;
  const stderr = `${LOG_DIR}/daily.stderr.log`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliPath}</string>
    <string>snapshot</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>23</integer>
    <key>Minute</key>
    <integer>55</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${stdout}</string>
  <key>StandardErrorPath</key>
  <string>${stderr}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`;
}

export function installScheduler(): { plistPath: string; cliPath: string } {
  const cliPath = resolveCliPath();
  const plist = buildPlist(cliPath);
  mkdirSync(dirname(LAUNCH_AGENT_PATH), { recursive: true });
  writeFileSync(LAUNCH_AGENT_PATH, plist, "utf8");

  try {
    execFileSync(
      "launchctl",
      ["bootout", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT_LABEL}`],
      {
        stdio: "ignore",
      },
    );
  } catch {
    // not loaded yet
  }
  execFileSync("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? 501}`, LAUNCH_AGENT_PATH], {
    stdio: "inherit",
  });

  return { plistPath: LAUNCH_AGENT_PATH, cliPath };
}

export function uninstallScheduler(): void {
  try {
    execFileSync(
      "launchctl",
      ["bootout", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT_LABEL}`],
      {
        stdio: "ignore",
      },
    );
  } catch {
    // ignore
  }
  if (existsSync(LAUNCH_AGENT_PATH)) {
    unlinkSync(LAUNCH_AGENT_PATH);
  }
}

export function schedulerStatus(): {
  installed: boolean;
  plistPath: string;
  loaded: boolean;
  detail: string;
} {
  const installed = existsSync(LAUNCH_AGENT_PATH);
  let loaded = false;
  let detail = "";
  try {
    detail = execFileSync(
      "launchctl",
      ["print", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT_LABEL}`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    loaded = true;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }
  return { installed, plistPath: LAUNCH_AGENT_PATH, loaded, detail };
}
