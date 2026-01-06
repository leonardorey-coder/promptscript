import fs from "node:fs/promises";
import path from "node:path";
import { tokenize } from "./dsl/tokenizer";
import { parse } from "./dsl/parser";
import { VM } from "./dsl/vm";
import { createDefaultRegistry } from "./runtime/tools";
import { RunLogger } from "./runtime/logger";

function argValue(flag: string) {
  const idx = Bun.argv.indexOf(flag);
  if (idx === -1) return null;
  return Bun.argv[idx + 1] ?? null;
}

async function main() {
  const cmd = Bun.argv[2];
  if (!cmd || cmd !== "run") {
    console.log("Usage:");
    console.log("  bun run src/cli.ts run <file.ps> --project <dir>");
    process.exit(1);
  }

  const file = Bun.argv[3];
  if (!file) throw new Error("Missing <file.ps>");

  const project = argValue("--project") ?? process.cwd();
  const projectRoot = path.resolve(project);

  const src = await fs.readFile(file, "utf8");
  const toks = tokenize(src);
  const ast = parse(toks);

  const registry = createDefaultRegistry();

  const logger = new RunLogger(path.join(projectRoot, ".ps-runs"));
  await logger.init();

  const ctx = {
    projectRoot,
    cwd: projectRoot,
    policy: {
      allowTools: ["READ_FILE", "SEARCH", "WRITE_FILE", "PATCH_FILE", "RUN_CMD"],
      allowCommands: ["bun", "node", "git", "rg"],
      requireApproval: false,
      maxFileBytes: 200_000,
    },
  };

  const vm = new VM(registry, ctx, logger, {
    maxSteps: 50_000,
    maxTimeMs: 10 * 60_000,
    maxToolCalls: 2_000,
  });

  await vm.run(ast);

  console.log(`\n✅ Run complete. Logs: ${logger.dir}`);
}

await main();
