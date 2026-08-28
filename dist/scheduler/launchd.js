import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { LAUNCH_AGENT_LABEL, LAUNCH_AGENT_PATH, LOG_DIR, CONFIG_DIR } from "../paths.js";
import { ntfyEnvForLaunchd } from "../util/notify.js";
const AGENT_PING_ENV_FILE = join(homedir(), ".config", "agent-ping", "env");
const AGENT_USAGE_ENV_FILE = join(CONFIG_DIR, "env");
function resolveCliPath() {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const candidate = `${here}../cli.js`;
    if (existsSync(candidate))
        return candidate;
    try {
        const require = createRequire(import.meta.url);
        return require.resolve("agent-usage/dist/cli.js");
    }
    catch {
        // fall through
    }
    const repoCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
    if (existsSync(repoCli))
        return repoCli;
    throw new Error("Could not locate agent-usage CLI path for LaunchAgent");
}
function loadEnvFileInto(processEnv, filePath) {
    if (!existsSync(filePath))
        return;
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0)
            continue;
        let key = trimmed.slice(0, eq).trim();
        if (key.startsWith("export "))
            key = key.slice("export ".length).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!processEnv[key])
            processEnv[key] = value;
    }
}
function loadAgentPingEnvInto(processEnv) {
    loadEnvFileInto(processEnv, AGENT_PING_ENV_FILE);
}
function loadAgentUsageEnvInto(processEnv) {
    loadEnvFileInto(processEnv, AGENT_USAGE_ENV_FILE);
}
export function buildPlist(cliPath, opts) {
    mkdirSync(LOG_DIR, { recursive: true });
    const stdout = `${LOG_DIR}/daily.stdout.log`;
    const stderr = `${LOG_DIR}/daily.stderr.log`;
    const nodePath = opts?.nodePath ?? process.execPath;
    const args = ["snapshot"];
    if (opts?.notify)
        args.push("--notify");
    if (opts?.review)
        args.push("--review");
    const env = ntfyEnvForLaunchd();
    loadAgentPingEnvInto(env);
    loadAgentUsageEnvInto(env);
    const envEntries = Object.entries(env)
        .map(([key, value]) => `    <key>${key}</key>\n    <string>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string>`)
        .join("\n");
    const envBlock = envEntries.length > 0
        ? `
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>`
        : "";
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
${args.map((arg) => `    <string>${arg}</string>`).join("\n")}
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>23</integer>
    <key>Minute</key>
    <integer>55</integer>
  </dict>${envBlock}
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
export function installScheduler(opts) {
    const cliPath = resolveCliPath();
    const notify = opts?.notify ?? Boolean(process.env.NTFY_TOPIC);
    const review = opts?.review ?? false;
    const plist = buildPlist(cliPath, { notify, review });
    mkdirSync(dirname(LAUNCH_AGENT_PATH), { recursive: true });
    writeFileSync(LAUNCH_AGENT_PATH, plist, "utf8");
    try {
        execFileSync("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT_LABEL}`], { stdio: "ignore" });
    }
    catch {
        // not loaded yet
    }
    execFileSync("launchctl", ["bootstrap", `gui/${process.getuid?.() ?? 501}`, LAUNCH_AGENT_PATH], {
        stdio: "inherit",
    });
    return { plistPath: LAUNCH_AGENT_PATH, cliPath, notify, review };
}
export function uninstallScheduler() {
    try {
        execFileSync("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT_LABEL}`], { stdio: "ignore" });
    }
    catch {
        // ignore
    }
    if (existsSync(LAUNCH_AGENT_PATH)) {
        unlinkSync(LAUNCH_AGENT_PATH);
    }
}
export function schedulerStatus() {
    const installed = existsSync(LAUNCH_AGENT_PATH);
    let loaded = false;
    let notify = false;
    let review = false;
    let detail = "";
    if (installed) {
        try {
            const plist = readFileSync(LAUNCH_AGENT_PATH, "utf8");
            notify = plist.includes("<string>--notify</string>");
            review = plist.includes("<string>--review</string>");
        }
        catch {
            // ignore
        }
    }
    try {
        detail = execFileSync("launchctl", ["print", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT_LABEL}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        loaded = true;
    }
    catch (err) {
        detail = err instanceof Error ? err.message : String(err);
    }
    return { installed, plistPath: LAUNCH_AGENT_PATH, loaded, notify, review, detail };
}
