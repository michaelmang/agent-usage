#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { closeDb, getDb } from "./db/schema.js";
import { syncUsage } from "./ingest/sync.js";
import { runSetup } from "./commands/setup.js";
import { takeSnapshot } from "./commands/snapshot.js";
import { runDailyReview } from "./commands/review.js";
import { addExpense, economicsReport } from "./commands/expenses.js";
import { formatModelsTable, formatMilestonesTable, formatProjectsTable, formatReportText } from "./report/format.js";
import { formatRecommendText } from "./recommend/format.js";
import { buildRecommendReport, buildRecommendReportForProject } from "./recommend/engine.js";
import { recommendTask } from "./jit/recommend-task.js";
import { formatTaskRecommendationText } from "./jit/format.js";
import { runJitById, runJitCapabilities, runJitCompile, runJitEdit, runJitExperiment, runJitGenerate, runJitShow, listJitForApi, getJitForApi, } from "./commands/jit.js";
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
    .command("milestones")
    .argument("[query]", "Optional project name/path fragment")
    .description("Show git commits and model/effort markers from session logs")
    .option("--json", "Output JSON", false)
    .option("--commits", "Show git commits only", false)
    .option("--no-sync", "Skip sync")
    .option("--limit <n>", "Max rows", "30")
    .action(async (query, opts) => {
    await ensureSynced(opts);
    const db = getDb();
    let projectId;
    if (query) {
        projectId = findProjectId(db, query);
        if (projectId == null) {
            console.error(`No project matched "${query}"`);
            process.exitCode = 1;
            return;
        }
    }
    const { consolidateCommitMilestones, listMilestones } = await import("./ingest/milestones.js");
    const rawRows = listMilestones(db, {
        projectId,
        limit: opts.commits ? (Number(opts.limit) || 30) * 2 : Number(opts.limit) || 30,
        kind: opts.commits ? "git_commit" : undefined,
    });
    const rows = opts.commits
        ? consolidateCommitMilestones(rawRows)
        : rawRows;
    if (wantJson(opts)) {
        console.log(JSON.stringify(rows, null, 2));
        return;
    }
    if (!rows.length) {
        console.log("No milestones recorded yet.");
        return;
    }
    if (opts.commits) {
        console.log(formatMilestonesTable(rows));
        return;
    }
    for (const row of rows) {
        const when = String(row.occurredAt).slice(0, 19).replace("T", " ");
        const kind = row.kind === "git_commit" ? "commit" : "model";
        const sha = row.gitSha ? ` ${String(row.gitSha).slice(0, 7)}` : "";
        const model = row.model ? ` · ${row.model}` : "";
        const effort = row.effort ? ` (${row.effort})` : "";
        const cost = row.apiEquivalentCost != null && Number(row.apiEquivalentCost) > 0
            ? `  ${formatMoney(Number(row.apiEquivalentCost))}`
            : "";
        console.log(`${when}  [${row.provider}] ${kind}${sha}${model}${effort}${cost}  ${row.projectName ?? ""}`);
        if (row.gitSubject)
            console.log(`  ${row.gitSubject}`);
    }
});
const RECOMMEND_PERIODS = new Set(["today", "yesterday", "week", "month"]);
function looksLikeTaskQuery(text) {
    return text.includes(" ") || text.length > 48;
}
program
    .command("recommend")
    .argument("[periodOrProjectOrTask]", "today | week | project name, or task text", "today")
    .argument("[project]", "Optional project name when period is first arg")
    .description("Heuristic model/effort recommendations, or task-specific agent/model/JIT advice")
    .option("--json", "Output JSON", false)
    .option("--no-sync", "Skip sync")
    .option("--runtime <agent>", "Override runtime for task mode: codex | claude")
    .action(async (periodOrProject, projectArg, opts) => {
    await ensureSynced(opts);
    const config = loadConfig();
    if (!RECOMMEND_PERIODS.has(periodOrProject) &&
        looksLikeTaskQuery(periodOrProject)) {
        const runtimeOverride = opts.runtime === "claude" || opts.runtime === "codex" || opts.runtime === "pi"
            ? opts.runtime
            : undefined;
        const taskRec = recommendTask(periodOrProject, runtimeOverride);
        if (wantJson(opts)) {
            console.log(JSON.stringify(taskRec, null, 2));
        }
        else {
            console.log(formatTaskRecommendationText(taskRec));
        }
        return;
    }
    const tz = config.timezone;
    let period = "today";
    let projectQuery;
    if (RECOMMEND_PERIODS.has(periodOrProject)) {
        period = periodOrProject;
        projectQuery = projectArg;
    }
    else if (periodOrProject && periodOrProject !== "today") {
        projectQuery = periodOrProject;
    }
    const ranges = {
        today: { title: "Recommendations — Today", range: rangeToday(tz) },
        yesterday: { title: "Recommendations — Yesterday", range: rangeYesterday(tz) },
        week: { title: "Recommendations — This Week", range: rangeWeek(tz) },
        month: { title: "Recommendations — This Month", range: rangeMonth(tz) },
    };
    const { title, range } = ranges[period];
    const db = getDb();
    let report;
    if (projectQuery) {
        report = buildRecommendReportForProject(db, projectQuery, range.from, range.to, title);
        if (!report) {
            const taskRec = recommendTask(projectQuery);
            if (wantJson(opts))
                console.log(JSON.stringify(taskRec, null, 2));
            else
                console.log(formatTaskRecommendationText(taskRec));
            return;
        }
    }
    else {
        report = buildRecommendReport(db, { title, from: range.from, to: range.to });
    }
    if (wantJson(opts)) {
        console.log(JSON.stringify(report, null, 2));
    }
    else {
        console.log(formatRecommendText(report));
    }
});
program
    .command("review")
    .description("Generate LLM workflow feedback for today's usage and commits")
    .option("--date <yyyy-mm-dd>", "Review a specific date (default: today)")
    .option("--json", "Output review JSON", false)
    .option("--no-sync", "Skip sync before building context")
    .option("--no-write", "Print only; do not append to snapshot files", false)
    .action(async (opts) => {
    try {
        const result = await runDailyReview({
            date: opts.date,
            sync: opts.sync !== false,
            write: opts.write !== false,
        });
        if (wantJson(opts)) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        console.log(`Workflow review — ${result.date}`);
        if (result.txtPath)
            console.log(result.txtPath);
        console.log("");
        console.log(result.review.text);
    }
    catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
    }
});
program
    .command("snapshot")
    .description("Sync and write daily snapshot artifacts")
    .option("--json", "Output JSON", false)
    .option("--notify", "Send phone notification via agent-ping", false)
    .option("--review", "Append LLM workflow review (requires ANTHROPIC_API_KEY)", false)
    .action(async (opts) => {
    const result = await takeSnapshot({ notify: opts.notify, review: opts.review });
    if (wantJson(opts))
        console.log(JSON.stringify(result, null, 2));
    else {
        console.log(`Snapshot ${result.date}`);
        console.log(result.syncMessage);
        if (result.notifyMessage)
            console.log(result.notifyMessage);
        if (result.reviewMessage)
            console.log(result.reviewMessage);
        console.log(result.txtPath);
        console.log(result.jsonPath);
        if (result.review) {
            console.log("");
            console.log(result.review.text);
        }
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
    .option("--notify", "Also send daily phone notification via agent-ping", false)
    .option("--review", "Also run LLM workflow review (needs ANTHROPIC_API_KEY in ~/.config/agent-usage/env)", false)
    .option("--no-notify", "Disable phone notifications even if NTFY_TOPIC is set", false)
    .action((opts) => {
    const notify = opts.noNotify
        ? false
        : opts.notify || Boolean(process.env.NTFY_TOPIC);
    const result = installScheduler({ notify, review: opts.review });
    console.log(`Installed ${result.plistPath}`);
    console.log(`CLI: ${result.cliPath}`);
    const flags = [
        result.notify ? "--notify" : null,
        result.review ? "--review" : null,
    ].filter(Boolean);
    console.log(`Runs: snapshot${flags.length ? ` ${flags.join(" ")}` : ""}`);
    if (result.review && !process.env.ANTHROPIC_API_KEY) {
        console.log("");
        console.log("Tip: set ANTHROPIC_API_KEY in ~/.config/agent-usage/env for scheduled reviews.");
    }
    if (result.notify && !process.env.NTFY_TOPIC) {
        console.log("");
        console.log("Tip: set NTFY_TOPIC in ~/.config/agent-ping/env so launchd can send notifications.");
    }
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
        console.log(`Notify: ${status.notify ? "yes (agent-ping)" : "no"}`);
        console.log(`Review: ${status.review ? "yes (LLM)" : "no"}`);
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
const jitCmd = program
    .command("jit")
    .description("Just-in-Time harness generation and execution");
jitCmd
    .command("capabilities")
    .description("Show detected runtime capabilities from CLI probing")
    .action(async () => {
    console.log(await runJitCapabilities());
});
jitCmd
    .command("show <id>")
    .description("Inspect a persisted JIT harness")
    .option("--json", "Output JSON", false)
    .action((id, opts) => {
    if (wantJson(opts)) {
        const data = getJitForApi(id);
        if (!data) {
            console.error(`No JIT harness found: ${id}`);
            process.exitCode = 1;
            return;
        }
        console.log(JSON.stringify(data, null, 2));
        return;
    }
    console.log(runJitShow(id));
});
jitCmd
    .command("compile <id>")
    .description("Recompile harness for runtime")
    .option("--runtime <agent>", "codex | claude | pi")
    .action(async (id, opts) => {
    const runtime = opts.runtime === "claude" || opts.runtime === "codex" || opts.runtime === "pi"
        ? opts.runtime
        : undefined;
    console.log(await runJitCompile(id, { runtime }));
});
jitCmd
    .command("run <id>")
    .description("Execute a compiled JIT harness")
    .option("--dry-run", "Show command without executing", false)
    .action(async (id, opts) => {
    await runJitById(id, { dryRun: opts.dryRun });
});
jitCmd
    .command("edit <id>")
    .description("Edit HarnessSpec in $EDITOR, validate, and save")
    .action((id) => {
    console.log(runJitEdit(id));
});
jitCmd
    .command("experiment <task>")
    .description("Prepare fixed vs JIT experiment arms (no auto-run)")
    .action((task) => {
    console.log(runJitExperiment(task));
});
jitCmd
    .command("generate <task>")
    .alias("g")
    .description("Generate JIT harness for a task")
    .option("--runtime <agent>", "codex | claude | pi")
    .option("--run", "Execute immediately after compile", false)
    .option("--dry-run", "With --run, show plan only", false)
    .option("--json", "Output JSON", false)
    .action(async (task, opts) => {
    const config = loadConfig();
    const runtime = opts.runtime === "claude" || opts.runtime === "codex" || opts.runtime === "pi"
        ? opts.runtime
        : undefined;
    const result = await runJitGenerate({
        task,
        config,
        runtime,
        run: opts.run,
        dryRun: opts.dryRun,
    });
    if (wantJson(opts)) {
        console.log(JSON.stringify({
            harnessId: result.harnessId,
            record: result.record,
            plan: result.plan,
        }, null, 2));
    }
    else {
        console.log(result.summary);
    }
});
jitCmd
    .command("list")
    .description("List recent JIT harnesses")
    .option("--json", "Output JSON", false)
    .action((opts) => {
    const rows = listJitForApi(50);
    if (wantJson(opts))
        console.log(JSON.stringify(rows, null, 2));
    else {
        for (const row of rows) {
            console.log(`${row.id}  ${row.jitLevel}  ${row.spec.runtime.agent}/${row.spec.runtime.model}  ${row.status}  ${row.spec.task.text.slice(0, 60)}`);
        }
    }
});
// Default: agent-usage jit "<task>"
jitCmd
    .argument("[task]", "Task description")
    .option("--runtime <agent>", "codex | claude | pi")
    .option("--run", "Execute after generation", false)
    .option("--dry-run", "Dry-run execution with --run", false)
    .option("--json", "Output JSON", false)
    .action(async (task, opts) => {
    if (!task) {
        console.log("Usage: agent-usage jit \"<task>\" | agent-usage jit generate \"<task>\"");
        return;
    }
    const config = loadConfig();
    const runtime = opts.runtime === "claude" || opts.runtime === "codex" || opts.runtime === "pi"
        ? opts.runtime
        : undefined;
    const result = await runJitGenerate({
        task,
        config,
        runtime,
        run: opts.run,
        dryRun: opts.dryRun,
    });
    if (wantJson(opts)) {
        console.log(JSON.stringify({ harnessId: result.harnessId, record: result.record, plan: result.plan }, null, 2));
    }
    else {
        console.log(result.summary);
    }
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
