import type { PlanSpec, PlanStep } from "../runtime/planspec";

export function planSpecToPromptScript(spec: PlanSpec): string {
  const lines: string[] = [];

  lines.push(`log("Plan: ${spec.title || spec.goal}")`);
  lines.push("");

  if (spec.llm) {
    lines.push("client = LLMClient({");
    if (spec.llm.provider) lines.push(`  provider: "${spec.llm.provider}",`);
    if (spec.llm.apiKeyEnv) lines.push(`  apiKey: "${spec.llm.apiKeyEnv}",`);
    if (spec.llm.model) lines.push(`  model: "${spec.llm.model}",`);
    if (spec.llm.noAsk !== undefined) lines.push(`  no_ask: ${spec.llm.noAsk},`);
    if (spec.llm.maxTokens) lines.push(`  maxTokens: ${spec.llm.maxTokens},`);
    if (spec.llm.temperature !== undefined) lines.push(`  temperature: ${spec.llm.temperature},`);
    lines.push("})");
    lines.push("");
  }

  if (spec.policy) {
    lines.push("with policy {");
    if (spec.policy.allowActions) {
      const actions = spec.policy.allowActions.map((a) => `"${a}"`).join(",");
      lines.push(`  allowActions: [${actions}],`);
    }
    if (spec.policy.allowWriteGlobs) {
      const globs = spec.policy.allowWriteGlobs.map((g) => `"${g}"`).join(",");
      lines.push(`  allowWriteGlobs: [${globs}],`);
    }
    if (spec.policy.denyWriteGlobs) {
      const globs = spec.policy.denyWriteGlobs.map((g) => `"${g}"`).join(",");
      lines.push(`  denyWriteGlobs: [${globs}],`);
    }
    if (spec.policy.allowCommands) {
      const cmds = spec.policy.allowCommands.map((c) => `"${c}"`).join(",");
      lines.push(`  allowCommands: [${cmds}],`);
    }
    if (spec.policy.budgets) {
      const b = spec.policy.budgets;
      const budgetParts: string[] = [];
      if (b.maxSteps) budgetParts.push(`maxSteps: ${b.maxSteps}`);
      if (b.maxLLMCalls) budgetParts.push(`maxLLMCalls: ${b.maxLLMCalls}`);
      if (b.maxTimeMs) budgetParts.push(`maxTimeMs: ${b.maxTimeMs}`);
      if (b.maxCostUsd) budgetParts.push(`maxCostUsd: ${b.maxCostUsd}`);
      if (budgetParts.length > 0) {
        lines.push(`  budgets: { ${budgetParts.join(", ")} },`);
      }
    }
    if (spec.policy.haltOnLoop !== undefined) {
      lines.push(`  haltOnLoop: ${spec.policy.haltOnLoop},`);
    }
    lines.push("}:");

    for (const step of spec.steps) {
      lines.push(...compileStep(step, spec, "  "));
    }
  } else {
    for (const step of spec.steps) {
      lines.push(...compileStep(step, spec, ""));
    }
  }

  return lines.join("\n") + "\n";
}

function compileStep(step: PlanStep, spec: PlanSpec, indent: string): string[] {
  const lines: string[] = [];

  switch (step.kind) {
    case "read_file":
      lines.push(
        `${indent}apply("READ_FILE", { path: "${step.path}"${step.maxBytes ? `, maxBytes: ${step.maxBytes}` : ""} })`,
      );
      break;

    case "search":
      lines.push(`${indent}apply("SEARCH", { query: "${escapeString(step.query)}" })`);
      break;

    case "write_file":
      if (step.generated) {
        lines.push(`${indent}run_agent(client, "${escapeString(step.title || `Write ${step.path}`)}")`);
      } else if (step.content) {
        lines.push(
          `${indent}apply("WRITE_FILE", { path: "${step.path}", content: ${JSON.stringify(step.content)} })`,
        );
      }
      break;

    case "patch_file":
      if (step.generated) {
        lines.push(`${indent}run_agent(client, "${escapeString(step.title || `Patch ${step.path}`)}")`);
      } else if (step.patch) {
        lines.push(`${indent}apply("PATCH_FILE", { path: "${step.path}", patch: ${JSON.stringify(step.patch)} })`);
      }
      break;

    case "run_cmd": {
      const argsStr = step.args ? `, args: [${step.args.map((a) => `"${a}"`).join(", ")}]` : "";
      lines.push(`${indent}apply("RUN_CMD", { cmd: "${step.cmd}"${argsStr} })`);
      break;
    }

    case "run_agent": {
      const opts: string[] = [];
      if (step.maxIterations) opts.push(`max_iterations: ${step.maxIterations}`);
      if (step.requireWrite) opts.push(`require_write: ${step.requireWrite}`);
      
      const memoryKey = step.memory?.key || spec.memory?.key;
      if (memoryKey) opts.push(`memory_key: "${memoryKey}"`);
      
      if (step.contextFiles && step.contextFiles.length > 0) {
        opts.push(`context_files: [${step.contextFiles.map((f) => `"${f}"`).join(", ")}]`);
      }

      const clientRef = spec.llm ? "client" : "{}";
      const optsStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      lines.push(`${indent}run_agent(${clientRef},`);
      lines.push(`${indent}  "${escapeString(step.prompt)}"${optsStr}`);
      lines.push(`${indent})`);
      break;
    }

    case "plan_apply": {
      const allowActionsStr = step.allowActions
        ? `, allowActions: [${step.allowActions.map((a) => `"${a}"`).join(", ")}]`
        : "";
      lines.push(`${indent}apply(plan("${escapeString(step.prompt)}"${allowActionsStr}))`);
      break;
    }

    case "decide": {
      const opts: string[] = [`question: "${escapeString(step.question)}"`];
      if (step.schema) opts.push(`schema: ${JSON.stringify(step.schema)}`);
      if (step.memory?.key) opts.push(`memory_key: "${step.memory.key}"`);
      lines.push(`${indent}decide({ ${opts.join(", ")} })`);
      break;
    }

    case "judge": {
      const opts: string[] = [];
      if (step.memory?.key) opts.push(`memory_key: "${step.memory.key}"`);
      const optsStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      lines.push(`${indent}judge("${escapeString(step.question)}"${optsStr})`);
      break;
    }

    case "summarize": {
      const opts: string[] = [];
      if (step.memory?.key) opts.push(`memory_key: "${step.memory.key}"`);
      const optsStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      lines.push(`${indent}summarize("${escapeString(step.instruction)}"${optsStr})`);
      break;
    }

    case "parallel": {
      lines.push(`${indent}parallel([`);
      for (const subStepId of step.steps) {
        lines.push(`${indent}  { action: "...", args: {} },`);
      }
      lines.push(`${indent}])`);
      break;
    }

    case "timeout":
      lines.push(`${indent}timeout ${step.durationMs}:`);
      lines.push(`${indent}  log("Timeout step: ${step.stepId}")`);
      break;

    case "retry":
      lines.push(`${indent}retry ${step.count}${step.backoffMs ? ` backoff ${step.backoffMs}` : ""}:`);
      lines.push(`${indent}  log("Retry step: ${step.stepId}")`);
      break;

    case "report": {
      const args: string[] = [`message: "${escapeString(step.message)}"`];
      if (step.filesChanged && step.filesChanged.length > 0) {
        args.push(`filesChanged: [${step.filesChanged.map((f) => `"${f}"`).join(",")}]`);
      }
      if (step.nextSuggestions && step.nextSuggestions.length > 0) {
        args.push(`nextSuggestions: [${step.nextSuggestions.map((s) => `"${escapeString(s)}"`).join(",")}]`);
      }
      if (step.done !== undefined) {
        args.push(`done: ${step.done}`);
      }
      lines.push(`${indent}apply("REPORT", {`);
      lines.push(`${indent}  ${args.join(",\n" + indent + "  ")}`);
      lines.push(`${indent}})`);
      break;
    }
  }

  lines.push("");
  return lines;
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
