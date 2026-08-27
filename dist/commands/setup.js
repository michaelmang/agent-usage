import { existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { writeDefaultConfig } from "../config.js";
import { getDb, setMeta } from "../db/schema.js";
import { syncUsage } from "../ingest/sync.js";
import { CACHE_DIR, CONFIG_PATH, DATA_DIR, LOG_DIR, SNAPSHOT_DIR } from "../paths.js";
import { installScheduler } from "../scheduler/launchd.js";
import { nowIso } from "../util/format.js";
async function ask(question) {
    if (!process.stdin.isTTY)
        return "";
    const rl = createInterface({ input, output });
    const answer = await new Promise((resolve) => {
        rl.question(question, (a) => resolve(a));
    });
    rl.close();
    return answer.trim().toLowerCase();
}
export async function runSetup(opts) {
    mkdirSync(DATA_DIR, { recursive: true });
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    mkdirSync(LOG_DIR, { recursive: true });
    mkdirSync(CACHE_DIR, { recursive: true });
    const db = getDb();
    setMeta(db, "setup_at", nowIso());
    if (existsSync(CONFIG_PATH)) {
        console.log(`Config already exists: ${CONFIG_PATH}`);
    }
    else {
        const created = writeDefaultConfig(false);
        console.log(`Created sample config: ${created.path}`);
    }
    console.log("Importing historical usage via ccusage (may take ~10s)...");
    const sync = await syncUsage({ force: true });
    console.log(sync.message);
    console.log(`Database: ${DATA_DIR}/usage.sqlite`);
    console.log("");
    console.log("Next: edit project aliases in:");
    console.log(`  ${CONFIG_PATH}`);
    console.log("Map absolute git repo paths to name / client / contract_value.");
    console.log("");
    let install = opts?.yes === true;
    if (!install && process.stdin.isTTY) {
        const a = await ask("Install daily 11:55 PM LaunchAgent snapshot? [y/N] ");
        install = a === "y" || a === "yes";
    }
    if (install) {
        const result = installScheduler();
        console.log(`Installed LaunchAgent: ${result.plistPath}`);
        console.log(`Runs: node ${result.cliPath} snapshot`);
    }
    else {
        console.log("Skipped scheduler. Install later with: agent-usage install-scheduler");
    }
    console.log("");
    console.log("Try: agent-usage");
}
