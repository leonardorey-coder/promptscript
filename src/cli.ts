import fs from "node:fs/promises";
import path from "node:path";
import { tokenize } from "./dsl/tokenizer";
import { parse } from "./dsl/parser";
import { VM } from "./dsl/vm";
import { createDefaultRegistry } from "./runtime/tools";
import { RunLogger } from "./runtime/logger";
import { configureLLM, type LLMProvider } from "./runtime/llm";

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function argValue(flag: string): string | null {
  const idx = Bun.argv.indexOf(flag);
  if (idx === -1) return null;
  return Bun.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return Bun.argv.includes(flag);
}

function printUsage(): void {
  console.log(`
PromptScript CLI

Usage:
  bun run src/cli.ts run <file.ps> [options]

Options:
  --project <dir>       Project root directory (default: cwd)
  --provider <name>     LLM provider: openai, openrouter, anthropic (default: auto-detect)
  --model <model>       Model name (default: provider-specific)
  --max-steps <n>       Maximum execution steps (default: 50000)
  --max-time <ms>       Maximum execution time in ms (default: 600000)
  --max-llm-calls <n>   Maximum LLM calls (default: 500)
  --max-cost <usd>      Maximum estimated cost in USD (default: 10.0)
  --halt-on-loop        Stop execution when loop is detected
  --verbose             Enable verbose output

Environment Variables:
  OPENAI_API_KEY        OpenAI API key
  OPENROUTER_API_KEY    OpenRouter API key
  ANTHROPIC_API_KEY     Anthropic API key

Examples:
  bun run src/cli.ts run examples/workflow.ps --project .
  bun run src/cli.ts run agent.ps --provider openrouter --model anthropic/claude-sonnet-4
  bun run src/cli.ts run task.ps --max-cost 5.0 --halt-on-loop
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

  // Read and parse source
  const src = await fs.readFile(file, "utf8");
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
    model ?? undefined,
  );
  await logger.init();

  if (verbose) {
    console.log(`[ps] Run ID: ${logger.runId}`);
    console.log(`[ps] Logs: ${logger.dir}`);
    console.log("");
  }

  // Setup context
  const ctx = {
    projectRoot,
    cwd: projectRoot,
    policy: {
      allowTools: ["READ_FILE", "SEARCH", "WRITE_FILE", "PATCH_FILE", "RUN_CMD"],
      allowCommands: ["bun", "node", "git", "rg", "ls", "cat", "grep"],
      requireApproval: false,
      maxFileBytes: 200_000,
    },
  };

  // Create and run VM
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

await main();
