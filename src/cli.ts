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
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const cmd = Bun.argv[2];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
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
    console.log(`\n[ps] Run complete. Logs: ${logger.dir}`);
    console.log(`[ps] Budget: ${logger.budgetTracker.getSummary()}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[ps] Error: ${message}`);
    console.error(`[ps] Logs: ${logger.dir}`);
    process.exit(1);
  }
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
