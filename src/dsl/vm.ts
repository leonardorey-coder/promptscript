import type { Program, Stmt, Expr } from "./ast";
import type { Plan } from "../runtime/plan";
import { PlanSchema } from "../runtime/plan";
import type { ToolRegistry, ToolContext } from "../runtime/tools";
import type { RunLogger, TokenUsage } from "../runtime/logger";
import { llmCallWithMeta, LLMClient, DEFAULT_SYSTEM_PROMPT, type LLMCallResult } from "../runtime/llm";
import { LoopDetector, type LoopState } from "../runtime/loop-detector";
import { createInterface } from "node:readline/promises";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Value = any;

class ReturnSignal {
  constructor(public value: Value) {}
}
class BreakSignal {}

export interface VMConfig {
  maxSteps: number;
  maxTimeMs: number;
  maxToolCalls: number;
  maxLLMCalls: number;
  haltOnLoop: boolean;
  loopWarningCallback?: (state: LoopState) => void;
}

const DEFAULT_VM_CONFIG: VMConfig = {
  maxSteps: 50_000,
  maxTimeMs: 10 * 60_000,
  maxToolCalls: 2_000,
  maxLLMCalls: 500,
  haltOnLoop: false,
};

export class VM {
  private funcs = new Map<string, { params: string[]; body: Stmt[] }>();
  private config: VMConfig;
  private loopDetector: LoopDetector;
  private memoryStore = new Map<string, { summary: string; objective?: string; context?: any }>();

  constructor(
    private registry: ToolRegistry,
    private ctx: ToolContext,
    private logger: RunLogger,
    config: Partial<VMConfig> = {},
  ) {
    this.config = { ...DEFAULT_VM_CONFIG, ...config };
    this.loopDetector = new LoopDetector();
  }

  async run(program: Program): Promise<void> {
    const start = Date.now();
    let steps = 0;
    let llmCalls = 0;

    const checkBudgets = async () => {
      // Check logger's budget tracker
      const budgetCheck = this.logger.budgetTracker.checkBudget();
      if (budgetCheck.exceeded) {
        throw new Error(`BudgetExceeded: ${budgetCheck.reason}`);
      }

      // Also check VM-level budgets
      if (steps > this.config.maxSteps) throw new Error("BudgetExceeded: maxSteps");
      if (Date.now() - start > this.config.maxTimeMs) throw new Error("BudgetExceeded: maxTimeMs");
      if (llmCalls > this.config.maxLLMCalls) throw new Error("BudgetExceeded: maxLLMCalls");
    };

    const step = async (detail: string) => {
      steps++;
      this.logger.budgetTracker.incrementStep();
      await this.logger.append({ step: steps, type: "stmt", detail, ts: new Date().toISOString() });
      await checkBudgets();
    };

    const runToolAction = async (name: string, toolArgs: Record<string, unknown>) => {
      this.logger.budgetTracker.incrementToolCall();

      if (!this.ctx.policy.allowTools.includes(name)) {
        throw new Error(`PolicyViolation: tool not allowed: ${name}`);
      }

      const tool = this.registry.get(name);
      const parsed = tool.schema.parse(toolArgs);

      const out = await tool.run(this.ctx, parsed);
      await this.logger.append({
        step: steps,
        type: "tool",
        name,
        input: parsed,
        output: out,
        ts: new Date().toISOString(),
      });
      return out as Value;
    };

    const applyNoAsk = (system: string, noAsk?: boolean): string => {
      if (!noAsk) return system;
      return (
        system +
        "\n\nNo-Ask: If you need details, make reasonable assumptions and proceed. " +
        "Do not return ASK_USER unless absolutely blocked."
      );
    };

    const runLLMPlan = async (input: any, clientOverride?: LLMClient): Promise<Plan> => {
      llmCalls++;

      // Inject memory context if memory_key is provided
      const enhancedInput = { ...input };
      if (typeof input.memory_key === "string") {
        const memoryKey = input.memory_key;
        const memory = this.memoryStore.get(memoryKey);
        
        if (memory) {
          const contextParts = [enhancedInput.system || ""];
          contextParts.push("\n--- Memory Context ---");
          if (memory.objective) {
            contextParts.push(`Objective: ${memory.objective}`);
          }
          if (memory.summary) {
            contextParts.push(`Previous context: ${memory.summary}`);
          }
          contextParts.push("--- End Memory ---\n");
          
          enhancedInput.system = contextParts.join("\n");
        }
      }

      let result: LLMCallResult;
      let success = true;

      try {
        if (clientOverride) {
          result = await clientOverride.call(enhancedInput);
        } else {
          result = await llmCallWithMeta(enhancedInput);
        }
      } catch (err: unknown) {
        success = false;
        const errorMessage = err instanceof Error ? err.message : String(err);
        await this.logger.append({
          step: steps,
          type: "error",
          error: `LLM call failed: ${errorMessage}`,
          ts: new Date().toISOString(),
        });
        throw err;
      }

      const plan: Plan = result.plan;

      if (typeof plan.reason === "string" && plan.reason.trim().length > 0) {
        console.log("[llm]", plan.reason.trim());
      }

      this.logger.budgetTracker.recordLLMUsage(result.usage);

      await this.logger.append({
        step: steps,
        type: "llm",
        input,
        output: plan,
        usage: result.usage,
        latencyMs: result.latencyMs,
        retryCount: result.retryCount,
        ts: new Date().toISOString(),
      });

      const loopState = this.loopDetector.record(plan, success);

      if (loopState.loopDetected) {
        console.warn(`[ps] Loop detected: ${loopState.loopType}`);
        console.warn(`[ps] ${loopState.suggestion}`);

        await this.logger.logLoopWarning(
          steps,
          loopState.loopType ?? "unknown",
          loopState.suggestion ?? "No suggestion available",
        );

        if (this.config.loopWarningCallback) {
          this.config.loopWarningCallback(loopState);
        }

        if (this.config.haltOnLoop) {
          throw new Error(`LoopDetected: ${loopState.loopType} - ${loopState.suggestion}`);
        }
      }

      return plan;
    };

    const applyPlan = async (
      planInput: Plan,
      config?: { allowActions?: string[]; logReport?: boolean; returnReport?: boolean },
    ): Promise<Value> => {
      const plan = PlanSchema.parse(planInput);
      const allowActions = config?.allowActions;
      if (allowActions && !allowActions.includes(plan.action)) {
        throw new Error(`Action not allowed by apply_plan: ${plan.action}`);
      }

      switch (plan.action) {
        case "SEARCH":
        case "READ_FILE":
        case "WRITE_FILE":
        case "PATCH_FILE":
        case "RUN_CMD":
          return await runToolAction(plan.action, plan.args as Record<string, unknown>);
        case "REPORT": {
          const msg = (plan.args as any)?.message;
          if (config?.logReport !== false && msg !== undefined) {
            console.log("[ps]", msg);
          }
          return config?.returnReport === false ? null : msg ?? null;
        }
        case "ASK_USER": {
          const question = (plan.args as any)?.question ?? "";
          const choices = (plan.args as any)?.choices;
          if (config?.logReport !== false && question) {
            console.log("[ps]", question);
          }
          const promptLabel =
            Array.isArray(choices) && choices.length > 0
              ? `A[${choices.join("|")}]: `
              : "A[options|other option]: ";
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(promptLabel);
          rl.close();
          return answer;
        }
        default:
          throw new Error(`Unknown plan action: ${(plan as any).action}`);
      }
    };

    const evalExpr = async (e: Expr, env: Map<string, Value>): Promise<Value> => {
      switch (e.type) {
        case "Num":
          return e.value;
        case "Str":
          return e.value;
        case "Bool":
          return e.value;
        case "Null":
          return null;
        case "Var": {
          if (env.has(e.name)) return env.get(e.name)!;
          return null;
        }
        case "Obj": {
          const out: Record<string, unknown> = {};
          for (const p of e.pairs) out[p.key] = await evalExpr(p.value, env);
          return out;
        }
        case "Arr": {
          const out: unknown[] = [];
          for (const it of e.items) out.push(await evalExpr(it, env));
          return out;
        }
        case "Member": {
          const obj = await evalExpr(e.object, env);
          if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            return (obj as Record<string, unknown>)[e.property] ?? null;
          }
          return null;
        }
        case "Index": {
          const obj = await evalExpr(e.object, env);
          const idx = await evalExpr(e.index, env);
          if (Array.isArray(obj) && typeof idx === "number") {
            return obj[idx] ?? null;
          }
          if (obj && typeof obj === "object" && typeof idx === "string") {
            return (obj as Record<string, unknown>)[idx] ?? null;
          }
          return null;
        }
        case "Binary": {
          const l = await evalExpr(e.left, env);
          const r = await evalExpr(e.right, env);
          switch (e.op) {
            case "+":
              // Si ambos son números, sumar; sino concatenar strings
              if (typeof l === "number" && typeof r === "number") {
                return l + r;
              }
              return String(l) + String(r);
            case "==":
              return l === r;
            case "!=":
              return l !== r;
            case ">":
              return Number(l) > Number(r);
            case "<":
              return Number(l) < Number(r);
            case ">=":
              return Number(l) >= Number(r);
            case "<=":
              return Number(l) <= Number(r);
            case "and":
              return Boolean(l) && Boolean(r);
            case "or":
              return Boolean(l) || Boolean(r);
            case "in":
              if (typeof r === "string") return r.includes(String(l));
              if (Array.isArray(r)) return r.includes(l);
              return false;
          }
          throw new Error(`Unknown op: ${(e as any).op}`);
        }
        case "Unary": {
          const val = await evalExpr(e.expr, env);
          if (e.op === "not") return !Boolean(val);
          throw new Error(`Unknown unary op: ${(e as any).op}`);
        }
        case "Call": {
          const callArgs: Value[] = [];
          for (const a of e.args) callArgs.push(await evalExpr(a, env));

          const maybeCallable = env.get(e.name);
          if (maybeCallable && typeof maybeCallable === "object" && (maybeCallable as any).__ps_llm_client) {
            const prompt = String(callArgs[0] ?? "");
            const client = (maybeCallable as any).client as LLMClient;
            const mockPlan = (maybeCallable as any).mockPlan;
            const noAsk = (maybeCallable as any).noAsk as boolean | undefined;
            const input: Record<string, unknown> = {
              system: applyNoAsk(DEFAULT_SYSTEM_PROMPT, noAsk),
              user: prompt,
            };
            if (mockPlan !== undefined) input.mock_plan = mockPlan;
            const plan = await runLLMPlan(input, client);
            return plan as unknown as Value;
          }

          // builtins
          if (e.name === "log") {
            console.log("[ps]", callArgs[0]);
            return null;
          }

          if (e.name === "len") {
            const val = callArgs[0];
            if (Array.isArray(val)) return val.length;
            if (typeof val === "string") return val.length;
            return 0;
          }

          if (e.name === "range") {
            const args = callArgs;
            if (args.length === 1) {
              // range(n) -> 0 to n-1
              const n = Number(args[0]) || 0;
              return Array.from({ length: Math.max(0, n) }, (_, i) => i);
            } else if (args.length === 2) {
              // range(start, end) -> start to end-1
              const start = Number(args[0]) || 0;
              const end = Number(args[1]) || 0;
              const length = Math.max(0, end - start);
              return Array.from({ length }, (_, i) => start + i);
            } else if (args.length === 3) {
              // range(start, end, step) -> start to end-1 with step
              const start = Number(args[0]) || 0;
              const end = Number(args[1]) || 0;
              const step = Number(args[2]) || 1;
              if (step === 0) return [];
              const result: number[] = [];
              if (step > 0) {
                for (let i = start; i < end; i += step) {
                  result.push(i);
                }
              } else {
                for (let i = start; i > end; i += step) {
                  result.push(i);
                }
              }
              return result;
            }
            return [];
          }

          if (e.name === "llm") {
            const input = callArgs[0] ?? {};
            const plan = await runLLMPlan(input);
            return plan as unknown as Value;
          }

          if (e.name === "llm_user") {
            const prompt = String(callArgs[0] ?? "");
            const input = { system: DEFAULT_SYSTEM_PROMPT, user: prompt };
            const plan = await runLLMPlan(input);
            return plan as unknown as Value;
          }

          if (e.name === "llm_user_cfg") {
            const prompt = String(callArgs[0] ?? "");
            const cfg = (callArgs[1] ?? {}) as Record<string, unknown>;

            const baseSystem = typeof cfg.system === "string" ? cfg.system : DEFAULT_SYSTEM_PROMPT;
            const system = applyNoAsk(baseSystem, typeof cfg.no_ask === "boolean" ? cfg.no_ask : undefined);
            const input: Record<string, unknown> = {
              system,
              user: prompt,
            };

            if (typeof cfg.context === "string") input.context = cfg.context;
            if (Array.isArray(cfg.history)) input.history = cfg.history;
            if (cfg.mock_plan) input.mock_plan = cfg.mock_plan;

            const overrides: Record<string, unknown> = {};
            if (typeof cfg.provider === "string") overrides.provider = cfg.provider;
            if (typeof cfg.apiKey === "string") overrides.apiKey = cfg.apiKey;
            if (typeof cfg.baseUrl === "string") overrides.baseUrl = cfg.baseUrl;
            if (typeof cfg.model === "string") overrides.model = cfg.model;
            if (typeof cfg.temperature === "number") overrides.temperature = cfg.temperature;
            if (typeof cfg.maxTokens === "number") overrides.maxTokens = cfg.maxTokens;
            if (typeof cfg.maxRetries === "number") overrides.maxRetries = cfg.maxRetries;
            if (typeof cfg.retryDelayMs === "number") overrides.retryDelayMs = cfg.retryDelayMs;
            if (typeof cfg.timeoutMs === "number") overrides.timeoutMs = cfg.timeoutMs;

            const useOverrides = Object.keys(overrides).length > 0;
            const clientOverride = useOverrides ? new LLMClient(overrides as any) : undefined;

            const plan = await runLLMPlan(input, clientOverride);
            return plan as unknown as Value;
          }

          if (e.name === "LLMClient") {
            const cfg = (callArgs[0] ?? {}) as Record<string, unknown>;
            const cfgAny = cfg as Record<string, unknown> & {
              mock_plan?: unknown;
              mockPlan?: unknown;
              no_ask?: unknown;
            };
            const rawApiKey = cfgAny.apiKey;
            const resolvedApiKey =
              typeof rawApiKey === "string" && process.env[rawApiKey]
                ? process.env[rawApiKey]
                : rawApiKey;
            const { mock_plan, mockPlan, no_ask, ...rest } = cfgAny;
            const clientConfig: Record<string, unknown> = { ...rest };
            if (rawApiKey !== undefined) {
              clientConfig.apiKey = resolvedApiKey ?? rawApiKey;
            }
            const client = new LLMClient(clientConfig as any);
            return {
              __ps_llm_client: true,
              client,
              mockPlan: mock_plan ?? mockPlan,
              noAsk: typeof no_ask === "boolean" ? no_ask : undefined,
            } as Value;
          }

          if (e.name === "apply_plan") {
            const planInput = callArgs[0];
            const result = await applyPlan(planInput, {
              logReport: true,
              returnReport: true,
            });
            return result as Value;
          }

          if (e.name === "apply_plan_cfg") {
            const planInput = callArgs[0];
            const cfg = (callArgs[1] ?? {}) as Record<string, unknown>;
            const result = await applyPlan(planInput, {
              allowActions: Array.isArray(cfg.allowActions) ? (cfg.allowActions as string[]) : undefined,
              logReport: typeof cfg.logReport === "boolean" ? cfg.logReport : undefined,
              returnReport: typeof cfg.returnReport === "boolean" ? cfg.returnReport : undefined,
            });
            return result as Value;
          }

          if (e.name === "plan") {
            const prompt = String(callArgs[0] ?? "");
            const opts = (callArgs[1] ?? {}) as Record<string, unknown>;
            
            const baseSystem = typeof opts.system === "string" ? opts.system : DEFAULT_SYSTEM_PROMPT;
            const system = applyNoAsk(baseSystem, typeof opts.no_ask === "boolean" ? opts.no_ask : undefined);
            const input: Record<string, unknown> = {
              system,
              user: prompt,
            };

            if (typeof opts.context === "string") input.context = opts.context;
            if (typeof opts.memory_key === "string") input.memory_key = opts.memory_key;
            if (opts.mock_plan) input.mock_plan = opts.mock_plan;

            // Create client override if needed
            const overrides: Record<string, unknown> = {};
            if (typeof opts.provider === "string") overrides.provider = opts.provider;
            if (typeof opts.apiKey === "string") overrides.apiKey = opts.apiKey;
            if (typeof opts.baseUrl === "string") overrides.baseUrl = opts.baseUrl;
            if (typeof opts.model === "string") overrides.model = opts.model;
            if (typeof opts.temperature === "number") overrides.temperature = opts.temperature;
            if (typeof opts.maxTokens === "number") overrides.maxTokens = opts.maxTokens;
            if (typeof opts.maxRetries === "number") overrides.maxRetries = opts.maxRetries;
            if (typeof opts.retryDelayMs === "number") overrides.retryDelayMs = opts.retryDelayMs;
            if (typeof opts.timeoutMs === "number") overrides.timeoutMs = opts.timeoutMs;

            const useOverrides = Object.keys(overrides).length > 0;
            const clientOverride = useOverrides ? new LLMClient(overrides as any) : undefined;

            const plan = await runLLMPlan(input, clientOverride);
            return plan as unknown as Value;
          }

          if (e.name === "do") {
            // Sugar for apply(plan(prompt))
            const prompt = String(callArgs[0] ?? "");
            const opts = (callArgs[1] ?? {}) as Record<string, unknown>;
            
            // First generate plan
            const baseSystem = typeof opts.system === "string" ? opts.system : DEFAULT_SYSTEM_PROMPT;
            const system = applyNoAsk(baseSystem, typeof opts.no_ask === "boolean" ? opts.no_ask : undefined);
            const input: Record<string, unknown> = {
              system,
              user: prompt,
            };

            if (typeof opts.context === "string") input.context = opts.context;
            if (typeof opts.memory_key === "string") input.memory_key = opts.memory_key;
            if (opts.mock_plan) input.mock_plan = opts.mock_plan;

            const overrides: Record<string, unknown> = {};
            if (typeof opts.provider === "string") overrides.provider = opts.provider;
            if (typeof opts.apiKey === "string") overrides.apiKey = opts.apiKey;
            if (typeof opts.baseUrl === "string") overrides.baseUrl = opts.baseUrl;
            if (typeof opts.model === "string") overrides.model = opts.model;
            if (typeof opts.temperature === "number") overrides.temperature = opts.temperature;
            if (typeof opts.maxTokens === "number") overrides.maxTokens = opts.maxTokens;

            const useOverrides = Object.keys(overrides).length > 0;
            const clientOverride = useOverrides ? new LLMClient(overrides as any) : undefined;

            const plan = await runLLMPlan(input, clientOverride);
            
            // Then apply it
            const result = await applyPlan(plan, {
              logReport: true,
              returnReport: true,
            });
            return result as Value;
          }

          if (e.name === "apply") {
            // apply("ACTION", args) -> direct tool call
            if (typeof callArgs[0] === "string") {
              const actionName = callArgs[0];
              const actionArgs = (callArgs[1] ?? {}) as Record<string, unknown>;
              return await runToolAction(actionName, actionArgs);
            }
            // apply(plan) -> execute plan (NO LLM)
            const planInput = callArgs[0];
            const result = await applyPlan(planInput, {
              logReport: true,
              returnReport: true,
            });
            return result as Value;
          }

          if (e.name === "parallel") {
            const items = Array.isArray(callArgs[0]) ? callArgs[0] : [];
            const opts = (callArgs[1] ?? {}) as Record<string, unknown>;
            const max = typeof opts.max === "number" ? opts.max : 4;
            const failFast = typeof opts.fail_fast === "boolean" ? opts.fail_fast : true;
            
            // Restrict to safe actions in v0.3
            const safeActions = new Set(["READ_FILE", "SEARCH"]);
            
            const results: Array<{ ok: boolean; value?: any; error?: string }> = [];
            const promises: Promise<void>[] = [];
            
            // Process in batches of max
            for (let i = 0; i < items.length; i += max) {
              const batch = items.slice(i, i + max);
              const batchPromises = batch.map(async (item: any, batchIdx: number) => {
                const globalIdx = i + batchIdx;
                results[globalIdx] = { ok: false, error: "pending" };
                
                try {
                  if (!item || typeof item.action !== "string") {
                    throw new Error("Invalid item: missing action");
                  }
                  
                  if (!safeActions.has(item.action)) {
                    throw new Error(`Action not allowed in parallel: ${item.action}`);
                  }
                  
                  const actionArgs = item.args || {};
                  const result = await runToolAction(item.action, actionArgs);
                  results[globalIdx] = { ok: true, value: result };
                } catch (err: unknown) {
                  const error = err instanceof Error ? err.message : String(err);
                  results[globalIdx] = { ok: false, error };
                  
                  if (failFast) {
                    throw err;
                  }
                }
              });
              
              promises.push(...batchPromises);
              
              // Wait for current batch
              if (failFast) {
                await Promise.all(batchPromises);
              }
            }
            
            if (!failFast) {
              await Promise.allSettled(promises);
            }
            
            return results;
          }

          // run_agent(clientOrOpts, prompt, opts?) - iterative agent loop until done
          if (e.name === "run_agent") {
            const firstArg = callArgs[0];
            const initialPrompt = String(callArgs[1] ?? "");
            const opts = (callArgs[2] ?? {}) as Record<string, unknown>;
            
            let client: LLMClient;
            let noAsk: boolean | undefined;
            let mockPlan: any;
            
            // Check if first argument is LLMClient or inline config
            if (firstArg && typeof firstArg === "object" && (firstArg as any).__ps_llm_client) {
              // Explicit LLMClient
              client = (firstArg as any).client as LLMClient;
              noAsk = (firstArg as any).noAsk as boolean | undefined;
              mockPlan = (firstArg as any).mockPlan;
            } else if (firstArg && typeof firstArg === "object") {
              // Inline config - create LLMClient
              const cfg = firstArg as Record<string, unknown>;
              const rawApiKey = cfg.apiKey;
              const resolvedApiKey =
                typeof rawApiKey === "string" && process.env[rawApiKey]
                  ? process.env[rawApiKey]
                  : rawApiKey;
              
              const { mock_plan, mockPlan: mockPlanAlt, no_ask, ...rest } = cfg;
              const clientConfig: Record<string, unknown> = { ...rest };
              if (rawApiKey !== undefined) {
                clientConfig.apiKey = resolvedApiKey ?? rawApiKey;
              }
              client = new LLMClient(clientConfig as any);
              noAsk = typeof no_ask === "boolean" ? no_ask : undefined;
              mockPlan = mock_plan ?? mockPlanAlt;
            } else {
              throw new Error("run_agent: first argument must be an LLMClient or config object");
            }

            // No max_iterations by default (indefinite)
            const maxIterations = typeof opts.max_iterations === "number" ? opts.max_iterations : Number.MAX_SAFE_INTEGER;
            const requireWrite = typeof opts.require_write === "boolean" ? opts.require_write : false;
            const stopOnReport = typeof opts.stop_on_report === "boolean" ? opts.stop_on_report : true;
            const memoryKey = typeof opts.memory_key === "string" ? opts.memory_key : undefined;
            const contextFiles = Array.isArray(opts.context_files) ? opts.context_files : [];

            const history: { role: string; content: string }[] = [];
            let currentPrompt = initialPrompt;
            let iteration = 0;
            let lastResult: Value = null;
            let hasWritten = false;

            while (iteration < maxIterations) {
              iteration++;
              
              const input: Record<string, unknown> = {
                system: applyNoAsk(DEFAULT_SYSTEM_PROMPT, noAsk),
                user: currentPrompt,
              };
              if (history.length > 0) {
                input.history = history;
              }
              if (mockPlan !== undefined) {
                input.mock_plan = mockPlan;
              }
              if (memoryKey) {
                input.memory_key = memoryKey;
              }
              // Add context files if specified
              if (contextFiles.length > 0) {
                input.context_files = contextFiles;
              }

              const plan = await runLLMPlan(input, client);

              // Execute the action with error handling
              let actionResult: Value;
              let actionError: string | null = null;
              
              try {
                actionResult = await applyPlan(plan, {
                  logReport: stopOnReport,
                  returnReport: true,
                });
              } catch (err: unknown) {
                actionError = err instanceof Error ? err.message : String(err);
                actionResult = null;
                console.log(`[ps] Action error: ${actionError}`);
              }

              // Add to history for context (keep it compact)
              if (history.length > 20) {
                history.splice(0, history.length - 20); // Keep last 20 entries
              }
              history.push({ role: "assistant", content: JSON.stringify(plan) });
              if (actionError) {
                history.push({ role: "user", content: `Action ERROR: ${actionError}. Try a different approach.` });
              } else {
                history.push({ role: "user", content: `Action result: ${JSON.stringify(actionResult)}` });
              }

              lastResult = actionResult;

              // Track if we've written anything
              if (plan.action === "WRITE_FILE" || plan.action === "PATCH_FILE") {
                hasWritten = true;
              }

              // Check if REPORT with done=true (v0.3 behavior)
              if (plan.action === "REPORT" && plan.done === true && !actionError) {
                if (stopOnReport) {
                  if (requireWrite && !hasWritten) {
                    console.log(`[ps] Agent tried to complete without writing. Forcing continuation...`);
                    currentPrompt = `You reported done but haven't made any changes yet. You MUST use WRITE_FILE or PATCH_FILE to modify the file before reporting done. DO NOT just read and report - actually make the changes requested.`;
                    continue;
                  }
                  console.log(`[ps] Agent completed after ${iteration} iterations`);
                  break;
                }
              }

              // For other cases, check done flag
              if (plan.done === true && plan.action !== "REPORT" && !actionError) {
                if (requireWrite && !hasWritten) {
                  console.log(`[ps] Agent tried to complete without writing. Forcing continuation...`);
                  currentPrompt = `You reported done but haven't made any changes yet. You MUST use WRITE_FILE or PATCH_FILE to modify the file before reporting done. DO NOT just read and report - actually make the changes requested.`;
                  continue;
                }
                console.log(`[ps] Agent completed after ${iteration} iterations`);
                break;
              }

              // Prepare next prompt based on the action result
              if (actionError) {
                currentPrompt = `Previous action ${plan.action} FAILED with error: ${actionError}\n\nTry a different approach. If the file doesn't exist, create it with WRITE_FILE.`;
              } else {
                currentPrompt = `Previous action: ${plan.action}\nResult: ${JSON.stringify(actionResult)}\n\nContinue with the task. If complete, use REPORT with done: true.`;
              }
            }

            if (iteration >= maxIterations && maxIterations !== Number.MAX_SAFE_INTEGER) {
              console.warn(`[ps] Agent reached max iterations (${maxIterations})`);
            }

            return lastResult;
          }

          if (e.name === "decide") {
            const config = (callArgs[0] ?? {}) as Record<string, unknown>;
            const question = String(config.question ?? "");
            const schema = config.schema || {};
            const memoryKey = typeof config.memory_key === "string" ? config.memory_key : undefined;
            
            const systemPrompt = `You are an AI assistant that makes structured decisions. 
            
Return a JSON object that matches the provided schema exactly. Do not include any explanation or markdown.

Schema: ${JSON.stringify(schema)}`;

            const input: Record<string, unknown> = {
              system: systemPrompt,
              user: question,
            };
            
            if (memoryKey) {
              input.memory_key = memoryKey;
            }

            // Handle provider overrides
            const overrides: Record<string, unknown> = {};
            if (typeof config.provider === "string") overrides.provider = config.provider;
            if (typeof config.model === "string") overrides.model = config.model;
            
            const useOverrides = Object.keys(overrides).length > 0;
            const clientOverride = useOverrides ? new LLMClient(overrides as any) : undefined;
            
            const plan = await runLLMPlan(input, clientOverride);
            
            // Extract the structured response from plan.args or parse plan content
            if (plan.args && typeof plan.args === "object") {
              return plan.args;
            }
            return {};
          }

          if (e.name === "judge") {
            const question = String(callArgs[0] ?? "");
            const opts = (callArgs[1] ?? {}) as Record<string, unknown>;
            const memoryKey = typeof opts.memory_key === "string" ? opts.memory_key : undefined;
            
            const systemPrompt = `You are an AI assistant that makes boolean judgments.

Answer with exactly one of these JSON responses:
{"action": "REPORT", "args": {"message": true}, "done": true}
{"action": "REPORT", "args": {"message": false}, "done": true}

Do not include any explanation. Only respond with the JSON.`;

            const input: Record<string, unknown> = {
              system: systemPrompt,
              user: question,
            };
            
            if (memoryKey) {
              input.memory_key = memoryKey;
            }

            // Handle provider overrides
            const overrides: Record<string, unknown> = {};
            if (typeof opts.provider === "string") overrides.provider = opts.provider;
            if (typeof opts.model === "string") overrides.model = opts.model;
            
            const useOverrides = Object.keys(overrides).length > 0;
            const clientOverride = useOverrides ? new LLMClient(overrides as any) : undefined;
            
            const plan = await runLLMPlan(input, clientOverride);
            
            // Extract boolean result
            if (plan.args && typeof plan.args === "object") {
              const result = (plan.args as any).message;
              return Boolean(result);
            }
            return false;
          }

          if (e.name === "summarize") {
            const instruction = String(callArgs[0] ?? "");
            const opts = (callArgs[1] ?? {}) as Record<string, unknown>;
            const memoryKey = typeof opts.memory_key === "string" ? opts.memory_key : undefined;
            
            if (!memoryKey) {
              console.warn("[ps] summarize() called without memory_key - no effect");
              return null;
            }

            const systemPrompt = `You are an AI assistant that creates concise summaries for memory management.

Your task is to summarize the current context/memory according to the given instruction. 
Keep the summary concise (under 200 words) but include all essential information.
Focus on what has been accomplished, current state, and any important decisions made.

Return a REPORT action with the summary.`;

            const input: Record<string, unknown> = {
              system: systemPrompt,
              user: instruction,
              memory_key: memoryKey,
            };

            // Handle provider overrides
            const overrides: Record<string, unknown> = {};
            if (typeof opts.provider === "string") overrides.provider = opts.provider;
            if (typeof opts.model === "string") overrides.model = opts.model;
            
            const useOverrides = Object.keys(overrides).length > 0;
            const clientOverride = useOverrides ? new LLMClient(overrides as any) : undefined;
            
            const plan = await runLLMPlan(input, clientOverride);
            
            // Apply the plan to get summary content
            const result = await applyPlan(plan, {
              logReport: true,
              returnReport: true,
            });
            
            // Update memory store with the summary
            const summaryText = typeof result === "string" ? result : JSON.stringify(result);
            const existingMemory = this.memoryStore.get(memoryKey) || { summary: "", objective: "", context: {} };
            this.memoryStore.set(memoryKey, {
              ...existingMemory,
              summary: summaryText,
            });
            
            console.log(`[ps] Memory ${memoryKey} summarized`);
            return result;
          }

          if (e.name === "tool") {
            const name = String(callArgs[0]);
            const toolArgs = (callArgs[1] ?? {}) as Record<string, unknown>;
            const out = await runToolAction(name, toolArgs);
            return out as Value;
          }

          // user funcs
          const f = this.funcs.get(e.name);
          if (!f) throw new Error(`Unknown function: ${e.name}`);
          
          // Handle class constructor
          if ((f as any).__ps_class) {
            const className = (f as any).className || e.name;
            const instance: Record<string, any> = { __ps_class_instance: true, __ps_class_name: className };
            
            // Create local environment with 'self' pointing to instance
            const local = new Map<string, Value>();
            local.set("self", instance);
            f.params.forEach((p, idx) => local.set(p, callArgs[idx] ?? null));

            try {
              await execBlock(f.body, local);
              // Bind methods to instance
              for (const [methodName, methodFunc] of this.funcs.entries()) {
                if (methodName.startsWith(`${className}.`) || methodName.includes("__init__")) {
                  // Skip for now - simplified class implementation
                }
              }
              return instance;
            } catch (sig) {
              if (sig instanceof ReturnSignal) return sig.value;
              throw sig;
            }
          }
          
          // Regular function call
          const local = new Map<string, Value>();
          f.params.forEach((p, idx) => local.set(p, callArgs[idx] ?? null));

          try {
            await execBlock(f.body, local);
            return null;
          } catch (sig) {
            if (sig instanceof ReturnSignal) return sig.value;
            throw sig;
          }
        }
      }
    };

    const execStmt = async (s: Stmt, env: Map<string, Value>) => {
      await step(s.type);
      switch (s.type) {
        case "Def":
          this.funcs.set(s.name, { params: s.params, body: s.body });
          return;
        case "Class": {
          // Simple class implementation - store as constructor function
          const classFunc = {
            params: [],
            body: s.body,
            __ps_class: true,
            className: s.name,
          };
          this.funcs.set(s.name, classFunc);
          return;
        }
        case "Assign": {
          const v = await evalExpr(s.value, env);
          env.set(s.name, v);
          return;
        }
        case "ExprStmt":
          await evalExpr(s.expr, env);
          return;
        case "Return": {
          const v = s.value ? await evalExpr(s.value, env) : null;
          throw new ReturnSignal(v);
        }
        case "Break":
          throw new BreakSignal();
        case "If": {
          const c = await evalExpr(s.cond, env);
          if (Boolean(c)) return await execBlock(s.then, env);
          if (s.else) return await execBlock(s.else, env);
          return;
        }
        case "While": {
          while (true) {
            const c = await evalExpr(s.cond, env);
            if (!Boolean(c)) break;
            try {
              await execBlock(s.body, env);
            } catch (sig) {
              if (sig instanceof BreakSignal) break;
              if (sig instanceof ReturnSignal) throw sig;
              throw sig;
            }
          }
          return;
        }
        case "For": {
          const iterValue = await evalExpr(s.iter, env);
          if (!Array.isArray(iterValue)) {
            throw new Error(`For loop iterator must be an array, got ${typeof iterValue}`);
          }
          
          for (const item of iterValue) {
            env.set(s.var, item);
            try {
              await execBlock(s.body, env);
            } catch (sig) {
              if (sig instanceof BreakSignal) break;
              if (sig instanceof ReturnSignal) throw sig;
              throw sig;
            }
          }
          return;
        }
        case "WithPolicy": {
          const policyValue = await evalExpr(s.policy, env);
          if (!policyValue || typeof policyValue !== "object") {
            throw new Error("Policy must be an object");
          }
          
          // Save current policy
          const originalPolicy = { ...this.ctx.policy };
          
          try {
            // Apply new policy scope
            const newPolicy = policyValue as any;
            if (Array.isArray(newPolicy.allowActions)) {
              this.ctx.policy.allowTools = newPolicy.allowActions;
            }
            if (Array.isArray(newPolicy.allowCommands)) {
              this.ctx.policy.allowCommands = newPolicy.allowCommands;
            }
            if (typeof newPolicy.requireApproval === "boolean") {
              this.ctx.policy.requireApproval = newPolicy.requireApproval;
            }
            if (typeof newPolicy.maxFileBytes === "number") {
              this.ctx.policy.maxFileBytes = newPolicy.maxFileBytes;
            }
            
            await execBlock(s.body, env);
          } finally {
            // Restore original policy
            this.ctx.policy = originalPolicy;
          }
          return;
        }
        case "Retry": {
          const countValue = await evalExpr(s.count, env);
          const maxRetries = Number(countValue) || 1;
          const backoffMs = s.backoff ? Number(await evalExpr(s.backoff, env)) || 0 : 0;
          
          let lastError: unknown = null;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              await execBlock(s.body, env);
              return; // Success - exit retry loop
            } catch (err) {
              lastError = err;
              if (err instanceof ReturnSignal || err instanceof BreakSignal) {
                throw err; // Don't retry control flow signals
              }
              
              if (attempt < maxRetries - 1 && backoffMs > 0) {
                await new Promise(resolve => setTimeout(resolve, backoffMs));
              }
            }
          }
          
          // All retries failed
          throw lastError || new Error("Retry block failed");
        }
        case "Timeout": {
          const durationValue = await evalExpr(s.duration, env);
          const timeoutMs = Number(durationValue) || 0;
          
          if (timeoutMs <= 0) {
            await execBlock(s.body, env);
            return;
          }
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Timeout: operation exceeded ${timeoutMs}ms`)), timeoutMs);
          });
          
          const bodyPromise = execBlock(s.body, env);
          
          await Promise.race([bodyPromise, timeoutPromise]);
          return;
        }
        case "Guard": {
          const guardValue = await evalExpr(s.expr, env);
          if (!Boolean(guardValue)) {
            throw new Error(`Guard failed: ${JSON.stringify(s.expr)}`);
          }
          return;
        }
      }
    };

    const execBlock = async (stmts: Stmt[], env: Map<string, Value>) => {
      for (const s of stmts) await execStmt(s, env);
    };

    const globalEnv = new Map<string, Value>();
    try {
      await execBlock(program.body, globalEnv);
      await this.logger.finalize();
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      await this.logger.append({
        step: steps,
        type: "error",
        error: errorMessage,
        ts: new Date().toISOString(),
      });
      await this.logger.finalize();
      throw e;
    }
  }

  getLoopDetector(): LoopDetector {
    return this.loopDetector;
  }
}
