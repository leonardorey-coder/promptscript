#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import { tokenize } from "./dsl/tokenizer";
import { parse } from "./dsl/parser";
import { VM } from "./dsl/vm";
import { createDefaultRegistry } from "./runtime/tools";
import { RunLogger } from "./runtime/logger";
import { configureLLM, type LLMProvider } from "./runtime/llm";
import { markdownToPlanSpec } from "./compiler/md-to-planspec";
import { planSpecToPromptScript } from "./compiler/planspec-to-ps";
import { PlanSpecSchema } from "./runtime/planspec";
import {
  printBanner,
  showMainMenu,
  listWorkflows,
  printWorkflowList,
  createRenderer,
  showPicker,
  type TUIRenderer,
  type PickerItem,
} from "./tui";
import { colorize, bold, dim } from "./tui/colors";

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function argValue(flag: string): string | null {
  const idx = Bun.argv.indexOf(flag);
  if (idx === -1) return null;
  const nextArg = Bun.argv[idx + 1];
  if (!nextArg || nextArg.startsWith("--")) return null;
  return nextArg;
}

function hasFlag(flag: string): boolean {
  return Bun.argv.includes(flag);
}

function printUsage(): void {
  console.log(`
PromptScript CLI

Usage:
  psc run <file.ps> [options]                     Run a PromptScript file
  psc run <plan.md> --from-md [options]           Compile and run Markdown plan
  psc compile-md <plan.md> --out <planspec.json>  Compile Markdown to PlanSpec
  psc compile-planspec <planspec.json> --out <workflow.ps>  Compile PlanSpec to PromptScript
  psc replay <runId>                              Show replay of a run
  psc list                                        List available workflows

Options:
  --project <dir>       Project root directory (default: cwd)
  --provider <name>     LLM provider: openai, openrouter, anthropic (default: auto-detect)
  --model <model>       Model name (default: provider-specific)
  --max-steps <n>       Maximum execution steps (default: 50000)
  --max-time <ms>       Maximum execution time in ms (default: 600000)
  --max-llm-calls <n>   Maximum LLM calls (default: 500)
  --max-cost <usd>      Maximum estimated cost in USD (default: 10.0)
  --halt-on-loop        Stop execution when loop is detected
  --require-approval    Require manual approval for write operations
  --verbose             Enable verbose output
  --tui                 Enable interactive TUI (banner, progress bars, spinners)
  --from-md             Treat input as Markdown plan (auto-compile)
  --out <file>          Output file path

Environment Variables:
  OPENAI_API_KEY        OpenAI API key
  OPENROUTER_API_KEY    OpenRouter API key
  ANTHROPIC_API_KEY     Anthropic API key

Examples:
  psc run examples/workflow.ps --project .
  psc run demo/plan.md --from-md --provider openrouter
  psc compile-md demo/plan.md --out demo/planspec.json
  psc compile-planspec demo/planspec.json --out demo/workflow.ps
  psc replay 1234567890-abc123
  psc list --project .
  psc run examples/v045/landing_full.ps --project . --tui
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const useTui = hasFlag("--tui");

  // Find the actual command (skip flags that start with --)
  const cmd = Bun.argv.slice(2).find((arg) => !arg.startsWith("--"));

  // Show banner only in TUI mode
  if (useTui) {
    printBanner("0.5.0");
  }

  // --tui without a subcommand → interactive menu loop
  if (!cmd && useTui) {
    await runTUIMode();
    process.exit(0);
  }

  if (!cmd || cmd === "help") {
    printUsage();
    process.exit(0);
  }

  if (cmd === "compile-md") {
    await handleCompileMd();
    return;
  }

  if (cmd === "compile-planspec") {
    await handleCompilePlanspec();
    return;
  }

  if (cmd === "replay") {
    await handleReplay();
    return;
  }

  if (cmd === "list") {
    await handleListWorkflows();
    return;
  }

  if (cmd !== "run") {
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
  }

  const file = Bun.argv[3];
  if (!file) {
    console.error("Error: Missing <file.ps>");
    printUsage();
    process.exit(1);
  }

  // Parse options
  const project = argValue("--project") ?? process.cwd();
  const projectRoot = path.resolve(project);
  const provider = argValue("--provider") as LLMProvider | null;
  const model = argValue("--model");
  const maxSteps = parseInt(argValue("--max-steps") ?? "50000", 10);
  const maxTimeMs = parseInt(argValue("--max-time") ?? "600000", 10);
  const maxLLMCalls = parseInt(argValue("--max-llm-calls") ?? "500", 10);
  const maxCostUsd = parseFloat(argValue("--max-cost") ?? "10.0");
  const haltOnLoop = hasFlag("--halt-on-loop");
  const verbose = hasFlag("--verbose");
  const fromMd = hasFlag("--from-md");

  // Initialize TUI renderer if --tui is active
  let tuiRenderer: TUIRenderer | null = null;
  if (useTui) {
    tuiRenderer = createRenderer();
  }

  // Configure LLM
  if (provider || model) {
    configureLLM({
      provider: provider ?? undefined,
      model: model ?? undefined,
    });
  }

  if (verbose) {
    console.log("[ps] Configuration:");
    console.log(`     Project: ${projectRoot}`);
    console.log(`     Provider: ${provider ?? "auto-detect"}`);
    console.log(`     Model: ${model ?? "default"}`);
    console.log(`     Max steps: ${maxSteps}`);
    console.log(`     Max time: ${maxTimeMs}ms`);
    console.log(`     Max LLM calls: ${maxLLMCalls}`);
    console.log(`     Max cost: $${maxCostUsd}`);
    console.log(`     Halt on loop: ${haltOnLoop}`);
    console.log("");
  }

  let src: string;

  if (fromMd) {
    const mdContent = await fs.readFile(file, "utf8");
    const planSpec = markdownToPlanSpec(mdContent, {
      title: path.basename(file, ".md"),
    });

    const runDir = path.join(projectRoot, ".ps-runs", `${Date.now()}-md`);
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(path.join(runDir, "input"), { recursive: true });

    await fs.writeFile(
      path.join(runDir, "input", "plan.md"),
      mdContent,
      "utf8"
    );
    await fs.writeFile(
      path.join(runDir, "input", "planspec.json"),
      JSON.stringify(planSpec, null, 2),
      "utf8"
    );

    src = planSpecToPromptScript(planSpec);
    await fs.writeFile(path.join(runDir, "input", "workflow.ps"), src, "utf8");

    if (verbose) {
      console.log(`[ps] Compiled MD → PlanSpec → PS`);
      console.log(`[ps] Artifacts: ${runDir}/input/`);
      console.log("");
    }
  } else {
    src = await fs.readFile(file, "utf8");
  }

  const toks = tokenize(src);
  const ast = parse(toks);

  // Setup registry and logger
  const registry = createDefaultRegistry();
  const logger = new RunLogger(
    path.join(projectRoot, ".ps-runs"),
    {
      maxSteps,
      maxTimeMs,
      maxLLMCalls,
      maxCostUsd,
    },
    model ?? undefined
  );
  await logger.init();

  if (verbose) {
    console.log(`[ps] Run ID: ${logger.runId}`);
    console.log(`[ps] Logs: ${logger.dir}`);
    console.log("");
  }

  const requireApproval = hasFlag("--require-approval");

  const ctx = {
    projectRoot,
    cwd: projectRoot,
    policy: {
      allowTools: [
        "READ_FILE",
        "SEARCH",
        "WRITE_FILE",
        "EDIT_FILE",
        "PATCH_FILE",
        "RUN_CMD",
        "RECALL",
      ],
      allowCommands: ["bun", "node", "git", "rg", "ls", "cat", "grep"],
      requireApproval,
      maxFileBytes: 200_000,
    },
  };

  const vm = new VM(registry, ctx, logger, {
    maxSteps,
    maxTimeMs,
    maxToolCalls: 2_000,
    maxLLMCalls,
    haltOnLoop,
    loopWarningCallback: verbose
      ? (state) => {
          console.warn(`[ps] Loop warning: ${state.loopType}`);
          console.warn(`[ps] ${state.suggestion}`);
        }
      : undefined,
    approvalCallback: requireApproval
      ? async (action, args) => {
          console.log(`\n[APPROVAL REQUIRED]`);
          console.log(`Action: ${action}`);
          console.log(`Args: ${JSON.stringify(args, null, 2)}`);
          console.log(`\nApprove? (y/n): `);

          const response = await new Promise<string>((resolve) => {
            process.stdin.once("data", (data) => {
              resolve(data.toString().trim().toLowerCase());
            });
          });

          return response === "y" || response === "yes";
        }
      : undefined,
  });

  try {
    await vm.run(ast);
    if (useTui) {
      tuiRenderer?.stop();
    }
    console.log(
      `\n${colorize("[ps]", "blue")} Run complete. Logs: ${logger.dir}`
    );
    console.log(
      `${colorize("[ps]", "blue")} Budget: ${logger.budgetTracker.getSummary()}`
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (useTui) {
      tuiRenderer?.stop();
    }
    console.error(`\n${colorize("[ps] Error:", "red")} ${message}`);
    console.error(`${colorize("[ps]", "blue")} Logs: ${logger.dir}`);
    process.exit(1);
  }
}

// ── TUI mode helpers ──────────────────────────────────────────────────────

/** Pause execution until the user presses any key. */
async function pressAnyKey(
  message = "Presiona cualquier tecla para volver..."
): Promise<void> {
  process.stdout.write(`\n  ${dim(message)}\n`);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.once("data", () => {
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      resolve();
    });
  });
}

/** Persistent TUI loop: show menu → run action → back to menu. */
async function runTUIMode(): Promise<void> {
  const project = argValue("--project") ?? process.cwd();
  const projectRoot = path.resolve(project);

  while (true) {
    process.stdout.write("\n");

    const selected = await showMainMenu();

    if (!selected || selected === "exit") {
      process.stdout.write(dim("  Hasta luego.\n\n"));
      return;
    }

    process.stdout.write("\n");

    switch (selected) {
      case "run": {
        // Scan workflows and let the user pick one to execute
        const workflows = await listWorkflows(projectRoot);
        const items: PickerItem[] = workflows.map((wf) => ({
          label: wf.path,
          value: wf.absolutePath,
          detail: formatBytes(wf.size),
        }));

        const chosen = await showPicker(
          "Selecciona un workflow para ejecutar",
          items,
          "🚀"
        );
        if (chosen) {
          process.stdout.write(
            `\n  ${colorize("▶", "blue")} Ejecutando ${colorize(path.relative(projectRoot, chosen), "lightBlue")}...\n\n`
          );
          // Fork a child process to run the workflow so the TUI loop can continue after
          const proc = Bun.spawn(
            [
              "bun",
              "run",
              "src/cli.ts",
              "run",
              chosen,
              "--project",
              projectRoot,
            ],
            {
              cwd: projectRoot,
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            }
          );
          await proc.exited;
          await pressAnyKey();
        }
        break;
      }

      case "list": {
        const workflows = await listWorkflows(projectRoot);
        printWorkflowList(workflows, projectRoot);
        await pressAnyKey();
        break;
      }

      case "replay": {
        // Scan .ps-runs for past runs
        const runsDir = path.join(projectRoot, ".ps-runs");
        try {
          const dirs = await fs.readdir(runsDir);
          const runItems: PickerItem[] = [];

          for (const dir of dirs.slice(-20).reverse()) {
            // Try to read summary for detail
            let detail = "";
            try {
              const summary = JSON.parse(
                await fs.readFile(
                  path.join(runsDir, dir, "summary.json"),
                  "utf8"
                )
              );
              detail =
                `${summary.eventCount ?? "?"} events • ${summary.finishedAt ?? ""}`.trim();
            } catch {
              detail = dir;
            }
            runItems.push({ label: dir, value: dir, detail });
          }

          const chosenRun = await showPicker(
            "Selecciona un run para reproducir",
            runItems,
            "🔄"
          );
          if (chosenRun) {
            process.stdout.write(
              `\n  ${colorize("▶", "blue")} Reproduciendo ${colorize(chosenRun, "lightBlue")}...\n\n`
            );
            const proc = Bun.spawn(
              [
                "bun",
                "run",
                "src/cli.ts",
                "replay",
                chosenRun,
                "--project",
                projectRoot,
              ],
              {
                cwd: projectRoot,
                stdin: "inherit",
                stdout: "inherit",
                stderr: "inherit",
              }
            );
            await proc.exited;
            await pressAnyKey();
          }
        } catch {
          process.stdout.write(
            `\n  ${dim("No se encontraron runs pasados en .ps-runs/")}\n`
          );
          await pressAnyKey();
        }
        break;
      }

      case "compile": {
        // Scan for .md files in the project
        const mdFiles = await scanMdFiles(projectRoot);
        const mdItems: PickerItem[] = mdFiles.map((f) => ({
          label: f,
          value: path.join(projectRoot, f),
        }));

        const chosenMd = await showPicker(
          "Selecciona un .md para compilar",
          mdItems,
          "🔨"
        );
        if (chosenMd) {
          const outFile = chosenMd.replace(/\.md$/, ".ps");
          process.stdout.write(
            `\n  ${colorize("▶", "blue")} Compilando ${colorize(path.relative(projectRoot, chosenMd), "lightBlue")} → ${colorize(path.relative(projectRoot, outFile), "purple")}...\n\n`
          );
          const proc = Bun.spawn(
            [
              "bun",
              "run",
              "src/cli.ts",
              "compile-md",
              chosenMd,
              "--out",
              outFile,
            ],
            {
              cwd: projectRoot,
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            }
          );
          await proc.exited;
          await pressAnyKey();
        }
        break;
      }

      case "help": {
        printUsage();
        await pressAnyKey();
        break;
      }
    }

    // Clear screen and redraw banner for next loop
    process.stdout.write("\x1b[2J\x1b[H");
    printBanner("0.5.0");
  }
}

/** Scan for .md files (potential plans). */
async function scanMdFiles(projectRoot: string): Promise<string[]> {
  const results: string[] = [];

  async function scan(dir: string): Promise<void> {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (
          item.name.startsWith(".") ||
          item.name === "node_modules" ||
          item.name === "promptscript-vscode"
        )
          continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          await scan(full);
        } else if (item.isFile() && item.name.endsWith(".md")) {
          results.push(path.relative(projectRoot, full));
        }
      }
    } catch {
      /* skip */
    }
  }

  await scan(projectRoot);
  results.sort();
  return results;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function handleListWorkflows(): Promise<void> {
  const project = argValue("--project") ?? process.cwd();
  const projectRoot = path.resolve(project);

  const workflows = await listWorkflows(projectRoot);
  printWorkflowList(workflows, projectRoot);
}

async function handleCompileMd(): Promise<void> {
  const inputFile = Bun.argv[3];
  const outputFile = argValue("--out");

  if (!inputFile) {
    console.error("Error: Missing <plan.md>");
    printUsage();
    process.exit(1);
  }

  if (!outputFile) {
    console.error("Error: Missing --out <planspec.json>");
    printUsage();
    process.exit(1);
  }

  try {
    const markdown = await fs.readFile(inputFile, "utf8");
    const planSpec = markdownToPlanSpec(markdown, {
      title: path.basename(inputFile, ".md"),
    });

    const validated = PlanSpecSchema.parse(planSpec);

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(validated, null, 2), "utf8");

    console.log(`[ps] Compiled: ${inputFile} → ${outputFile}`);
    console.log(`[ps] Goal: ${validated.goal}`);
    console.log(`[ps] Steps: ${validated.steps.length}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ps] Error: ${message}`);
    process.exit(1);
  }
}

async function handleCompilePlanspec(): Promise<void> {
  const inputFile = Bun.argv[3];
  const outputFile = argValue("--out");

  if (!inputFile) {
    console.error("Error: Missing <planspec.json>");
    printUsage();
    process.exit(1);
  }

  if (!outputFile) {
    console.error("Error: Missing --out <workflow.ps>");
    printUsage();
    process.exit(1);
  }

  try {
    const json = await fs.readFile(inputFile, "utf8");
    const planSpec = PlanSpecSchema.parse(JSON.parse(json));

    const promptScript = planSpecToPromptScript(planSpec);

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, promptScript, "utf8");

    console.log(`[ps] Compiled: ${inputFile} → ${outputFile}`);
    console.log(`[ps] Goal: ${planSpec.goal}`);
    console.log(`[ps] Steps: ${planSpec.steps.length}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ps] Error: ${message}`);
    process.exit(1);
  }
}

async function handleReplay(): Promise<void> {
  const runId = Bun.argv[3];

  if (!runId) {
    console.error("Error: Missing <runId>");
    printUsage();
    process.exit(1);
  }

  const project = argValue("--project") ?? process.cwd();
  const projectRoot = path.resolve(project);
  const runDir = path.join(projectRoot, ".ps-runs", runId);

  try {
    const eventsFile = path.join(runDir, "events.jsonl");
    const summaryFile = path.join(runDir, "summary.json");

    const eventsContent = await fs.readFile(eventsFile, "utf8");
    const events = eventsContent
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    console.log(`\n=== Replay: ${runId} ===\n`);

    if (await fs.stat(summaryFile).catch(() => null)) {
      const summary = JSON.parse(await fs.readFile(summaryFile, "utf8"));
      console.log(`Started: ${summary.runId}`);
      console.log(`Finished: ${summary.finishedAt}`);
      console.log(`Events: ${summary.eventCount}`);
      console.log("");
    }

    console.log("Timeline:\n");

    for (const event of events) {
      if (event.type === "stmt") {
        console.log(`[${event.step}] ${event.detail}`);
      } else if (event.type === "tool") {
        console.log(`[${event.step}] TOOL: ${event.name}`);
        console.log(`  Input: ${JSON.stringify(event.input).slice(0, 100)}...`);
      } else if (event.type === "llm") {
        console.log(`[${event.step}] LLM Call`);
        if (event.usage) {
          console.log(
            `  Tokens: ${event.usage.totalTokens} (${event.latencyMs}ms)`
          );
        }
      } else if (event.type === "loop_warning") {
        console.log(`[${event.step}] LOOP WARNING: ${event.loopType}`);
      } else if (event.type === "error") {
        console.log(`[${event.step}] ERROR: ${event.error}`);
      }
    }

    console.log(`\n=== End Replay ===\n`);
    console.log(`Full logs: ${runDir}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ps] Error: ${message}`);
    process.exit(1);
  }
}

await main();
