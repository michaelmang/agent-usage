#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { closeDb, getDb } from "./db/schema.js";
import { syncUsage } from "./ingest/sync.js";
import { runSetup } from "./commands/setup.js";
import { takeSnapshot } from "./commands/snapshot.js";
import { addExpense, economicsReport } from "./commands/expenses.js";
import { formatModelsTable, formatProjectsTable, formatReportText } from "./report/format.js";
import { buildReport, findProjectId, lifetimeForProject, listModelsSummary, listProjectsSummary, rangeMonth, rangeToday, rangeWeek, rangeYesterday, } from "./report/queries.js";
import { installScheduler, schedulerStatus, uninstallScheduler } from "./scheduler/launchd.js";
import { displayProvider, formatMoney, formatTokens, localDate } from "./util/format.js";
import { CONFIG_PATH, DATA_DIR } from "./paths.js";
const program = new Command();
program
    .name("agent-usage")
    .description("Local Claude Code + Codex usage analytics by Git repository/project")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync before report")
    .action(async (opts) => {
    await printPeriod("today", opts);
});
function wantJson(opts) {
    return Boolean(opts.json || program.opts().json);
}
function wantSync(opts) {
    const globalSync = program.opts().sync;
    if (opts.sync === false || globalSync === false)
        return false;
    return true;
}
async function ensureSynced(opts) {
    if (!wantSync(opts))
        return;
    const result = await syncUsage();
    if (!result.skipped && process.env.AGENT_USAGE_DEBUG) {
        console.error(`[sync] ${result.message} in ${result.durationMs}ms`);
    }
}
async function printPeriod(which, opts) {
    await ensureSynced(opts);
    const config = loadConfig();
    const tz = config.timezone;
    const ranges = {
        today: { title: "Agent Usage — Today", range: rangeToday(tz) },
        yesterday: { title: "Agent Usage — Yesterday", range: rangeYesterday(tz) },
        week: { title: "Agent Usage — This Week", range: rangeWeek(tz) },
        month: { title: "Agent Usage — This Month", range: rangeMonth(tz) },
    };
    const { title, range } = ranges[which];
    const report = buildReport(title, range.from, range.to);
    if (wantJson(opts)) {
        console.log(JSON.stringify(report, null, 2));
    }
    else {
        console.log(formatReportText(report));
    }
}
program
    .command("today")
    .description("Show today's usage by project")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .action(async function todayAction() {
    await printPeriod("today", this.optsWithGlobals());
});
program
    .command("yesterday")
    .description("Show yesterday's usage by project")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .action(async function yesterdayAction() {
    await printPeriod("yesterday", this.optsWithGlobals());
});
program
    .command("week")
    .description("Show this week's usage by project")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .action(async function weekAction() {
    await printPeriod("week", this.optsWithGlobals());
});
program
    .command("month")
    .description("Show this month's usage by project")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .action(async function monthAction() {
    await printPeriod("month", this.optsWithGlobals());
});
program
    .command("sync")
    .description("Refresh usage from ccusage + session metadata")
    .option("--force", "Force re-run even if sources unchanged", false)
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
    const result = await syncUsage({ force: opts.force });
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
    }
    else {
        console.log(result.message);
        console.log(`Sessions: ${result.sessionsUpserted}  Usage rows: ${result.usageRowsTouched}`);
        console.log(`Duration: ${result.durationMs}ms${result.skipped ? " (cached)" : ""}`);
    }
});
program
    .command("project")
    .argument("<query>", "Project name or path fragment")
    .description("Show usage for a specific project")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .action(async (query, opts) => {
    await ensureSynced(opts);
    const db = getDb();
    const id = findProjectId(db, query);
    if (id == null) {
        console.error(`No project matched "${query}"`);
        process.exitCode = 1;
        return;
    }
    const project = db
        .prepare(`SELECT id, name, canonical_path AS path, client, contract_value AS contractValue
         FROM projects WHERE id = ?`)
        .get(id);
    const config = loadConfig();
    const tz = config.timezone;
    const today = buildReport("Today", rangeToday(tz).from, rangeToday(tz).to, {
        projectId: id,
    });
    const week = buildReport("Week", rangeWeek(tz).from, rangeWeek(tz).to, {
        projectId: id,
    });
    const month = buildReport("Month", rangeMonth(tz).from, rangeMonth(tz).to, {
        projectId: id,
    });
    const lifetime = lifetimeForProject(id);
    const payload = {
        project,
        today: today.totals,
        week: week.totals,
        month: month.totals,
        lifetime: {
            totalTokens: lifetime.totalTokens,
            apiEquivalentCost: lifetime.apiEquivalentCost,
            providers: lifetime.providers,
        },
        economics: project.contractValue != null
            ? {
                contractValue: project.contractValue,
                apiEquivalentUsage: lifetime.apiEquivalentCost,
                usageValuePercent: project.contractValue > 0
                    ? (lifetime.apiEquivalentCost / project.contractValue) * 100
                    : null,
            }
            : null,
    };
    if (wantJson(opts)) {
        console.log(JSON.stringify(payload, null, 2));
        return;
    }
    const lines = [
        project.name,
        project.path,
        "",
        `Today                  ${formatMoney(today.totals.apiEquivalentCost)}`,
        `This week              ${formatMoney(week.totals.apiEquivalentCost)}`,
        `This month             ${formatMoney(month.totals.apiEquivalentCost)}`,
        `Lifetime                ${formatMoney(lifetime.apiEquivalentCost)}`,
        "",
        `Total tokens           ${formatTokens(lifetime.totalTokens)}`,
        `API-equivalent usage   ${formatMoney(lifetime.apiEquivalentCost)}`,
        "",
        "Providers",
    ];
    for (const p of lifetime.providers) {
        lines.push(`  ${displayProvider(p.provider).padEnd(12)} ${formatTokens(p.totalTokens).padStart(8)}  ${formatMoney(p.apiEquivalentCost)}`);
        for (const m of p.models) {
            lines.push(`    ${m.model.padEnd(22)} ${formatTokens(m.totalTokens).padStart(8)}  ${formatMoney(m.apiEquivalentCost)}`);
        }
    }
    if (payload.economics) {
        lines.push("");
        lines.push(`Contract value               ${formatMoney(payload.economics.contractValue)}`);
        lines.push(`API-equivalent usage            ${formatMoney(payload.economics.apiEquivalentUsage)}`);
        if (payload.economics.usageValuePercent != null) {
            lines.push(`Usage value / contract           ${payload.economics.usageValuePercent.toFixed(2)}%`);
        }
    }
    console.log(lines.join("\n"));
});
program
    .command("projects")
    .description("List projects with today/week/month API-equivalent usage")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .action(async (opts) => {
    await ensureSynced(opts);
    const rows = listProjectsSummary();
    if (wantJson(opts))
        console.log(JSON.stringify(rows, null, 2));
    else
        console.log(formatProjectsTable(rows));
});
program
    .command("models")
    .description("Show model usage for this month")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .action(async (opts) => {
    await ensureSynced(opts);
    const range = rangeMonth();
    const rows = listModelsSummary(range.from, range.to);
    if (wantJson(opts))
        console.log(JSON.stringify(rows, null, 2));
    else
        console.log(formatModelsTable(rows));
});
program
    .command("snapshot")
    .description("Sync and write daily snapshot artifacts")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
    const result = await takeSnapshot();
    if (wantJson(opts))
        console.log(JSON.stringify(result, null, 2));
    else {
        console.log(`Snapshot ${result.date}`);
        console.log(result.syncMessage);
        console.log(result.txtPath);
        console.log(result.jsonPath);
    }
});
program
    .command("setup")
    .description("Create local dirs, config, import history, optional scheduler")
    .option("-y, --yes", "Install scheduler without prompting", false)
    .action(async (opts) => {
    await runSetup({ yes: opts.yes });
});
program
    .command("install-scheduler")
    .description("Install LaunchAgent for daily 11:55 PM snapshots")
    .action(() => {
    const result = installScheduler();
    console.log(`Installed ${result.plistPath}`);
    console.log(`CLI: ${result.cliPath}`);
});
program
    .command("uninstall-scheduler")
    .description("Remove the daily snapshot LaunchAgent")
    .action(() => {
    uninstallScheduler();
    console.log("Scheduler removed");
});
program
    .command("scheduler-status")
    .description("Show LaunchAgent status")
    .option("--json", "Output JSON", false)
    .action((opts) => {
    const status = schedulerStatus();
    if (wantJson(opts))
        console.log(JSON.stringify(status, null, 2));
    else {
        console.log(`Installed: ${status.installed}`);
        console.log(`Loaded: ${status.loaded}`);
        console.log(`Plist: ${status.plistPath}`);
    }
});
const expense = program.command("expense").description("Track actual AI tooling spend");
expense
    .command("add")
    .argument("<provider>", "claude | codex | cursor | ...")
    .argument("<amount>", "dollar amount", Number)
    .requiredOption("--type <type>", "subscription | credits | other")
    .option("--date <yyyy-mm-dd>", "expense date")
    .option("--note <note>", "optional note")
    .action((provider, amount, opts) => {
    addExpense({
        provider,
        amount,
        type: opts.type,
        date: opts.date,
        note: opts.note,
    });
    console.log(`Recorded ${provider} ${opts.type} ${formatMoney(amount)}`);
});
program
    .command("economics")
    .argument("[period]", "month | all", "month")
    .description("Compare actual spend vs API-equivalent usage")
    .option("--json", "Output JSON", false)
    .action((period, opts) => {
    const p = period === "all" ? "all" : "month";
    const report = economicsReport(p);
    if (wantJson(opts))
        console.log(JSON.stringify(report.json, null, 2));
    else
        console.log(report.text);
});
program
    .command("paths")
    .description("Show local data/config paths")
    .action(() => {
    console.log(`Config: ${CONFIG_PATH}`);
    console.log(`Data:   ${DATA_DIR}`);
    console.log(`Today:  ${localDate()}`);
});
async function main() {
    try {
        await program.parseAsync(process.argv);
    }
    finally {
        closeDb();
    }
}
main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    closeDb();
    process.exit(1);
});
