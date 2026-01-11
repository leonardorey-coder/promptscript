import fs from "node:fs/promises";
import path from "node:path";
import { tokenize } from "../dsl/tokenizer";
import { parse } from "../dsl/parser";
import type { Program } from "../dsl/ast";
import type { ToolRegistry, ToolContext } from "./tools";
import { RunLogger } from "./logger";
import { VM, type VMConfig } from "../dsl/vm";

export interface SubworkflowOptions {
  args?: Record<string, any>;
  inherit_policy?: boolean;
  inherit_memory?: boolean;
  timeout_ms?: number;
  budget_override?: Partial<VMConfig>;
  stage?: string;
  return_contract?: boolean;
}

export interface QualityContract {
  ok: boolean;
  issues: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
  }>;
  evidence?: Record<string, any>;
  metrics?: Record<string, number>;
}

export interface SubworkflowResult {
  ok: boolean;
  report?: {
    message: string;
    filesChanged?: string[];
    nextSuggestions?: string[];
  };
  contract?: QualityContract;
  childRunId: string;
  logsPath: string;
  stage?: string;
  budget?: {
    steps: number;
    llmCalls: number;
    tokens: number;
    costUsd: number;
    timeMs: number;
  };
  error?: string;
}

export class SubworkflowExecutor {
  constructor(
    private projectRoot: string,
    private registry: ToolRegistry,
    private parentCtx: ToolContext,
    private parentLogger: RunLogger,
    private parentVMConfig: VMConfig
  ) {}

  async execute(
    workflowPath: string,
    options: SubworkflowOptions = {}
  ): Promise<SubworkflowResult> {
    const startTime = Date.now();
    const childRunId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    await this.parentLogger.append({
      step: 0,
      type: "subworkflow_start",
      detail: workflowPath,
      childRunId,
      options,
      ts: new Date().toISOString(),
    } as any);

    try {
      const resolvedPath = path.isAbsolute(workflowPath)
        ? workflowPath
        : path.resolve(this.projectRoot, workflowPath);

      const code = await fs.readFile(resolvedPath, "utf8");
      const tokens = tokenize(code);
      const ast: Program = parse(tokens);

      const childCtx: ToolContext = {
        projectRoot: this.projectRoot,
        cwd: this.parentCtx.cwd,
        policy:
          options.inherit_policy !== false
            ? { ...this.parentCtx.policy }
            : {
                allowTools: ["READ_FILE", "SEARCH"],
                allowCommands: [],
                requireApproval: false,
                maxFileBytes: 100_000,
              },
      };

      const childConfig: VMConfig = {
        ...this.parentVMConfig,
        ...(options.budget_override || {}),
      };

      if (options.timeout_ms) {
        childConfig.maxTimeMs = Math.min(
          options.timeout_ms,
          childConfig.maxTimeMs
        );
      }

      const logsDir = path.join(this.projectRoot, ".ps-runs");

      const childLogger = new RunLogger(logsDir, {
        maxSteps: childConfig.maxSteps,
        maxToolCalls: childConfig.maxToolCalls,
        maxLLMCalls: childConfig.maxLLMCalls,
        maxTokens: 1_000_000,
      });

      await childLogger.init();
      const logsPath = childLogger.file;

      const vm = new VM(this.registry, childCtx, childLogger, childConfig);

      if (options.args) {
        for (const [key, value] of Object.entries(options.args)) {
          (vm as any).globalEnv?.set(key, value);
        }
      }

      await vm.run(ast);

      const endTime = Date.now();
      const budgetSnapshot = childLogger.budgetTracker.getSnapshot();

      const result: SubworkflowResult = {
        ok: true,
        childRunId,
        logsPath,
        stage: options.stage,
        budget: {
          steps: budgetSnapshot.steps.current,
          llmCalls: budgetSnapshot.llmCalls.current,
          tokens: budgetSnapshot.tokens.current,
          costUsd: budgetSnapshot.costUsd.current,
          timeMs: endTime - startTime,
        },
        report: {
          message: `Subworkflow completed successfully in ${endTime - startTime}ms`,
        },
      };

      if (options.return_contract) {
        result.contract = {
          ok: true,
          issues: [],
          evidence: {},
          metrics: {
            timeMs: endTime - startTime,
            steps: budgetSnapshot.steps.current,
            llmCalls: budgetSnapshot.llmCalls.current,
          },
        };
      }

      await this.parentLogger.append({
        step: 0,
        type: "subworkflow_end",
        childRunId,
        result,
        durationMs: endTime - startTime,
        ts: new Date().toISOString(),
      } as any);

      return result;
    } catch (error: any) {
      const endTime = Date.now();
      const result: SubworkflowResult = {
        ok: false,
        childRunId,
        logsPath: "",
        error: error instanceof Error ? error.message : String(error),
      };

      await this.parentLogger.append({
        step: 0,
        type: "subworkflow_end",
        childRunId,
        result,
        durationMs: endTime - startTime,
        ts: new Date().toISOString(),
      } as any);

      throw error;
    }
  }
}
