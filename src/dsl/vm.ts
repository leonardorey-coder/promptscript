import type { Program, Stmt, Expr } from "./ast";
import type { Plan } from "../runtime/plan";
import { PlanSchema } from "../runtime/plan";
import type { ToolRegistry, ToolContext } from "../runtime/tools";
import type { RunLogger, TokenUsage } from "../runtime/logger";
import { llmCallWithMeta, type LLMCallResult } from "../runtime/llm";
import { LoopDetector, type LoopState } from "../runtime/loop-detector";

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
              return String(l) + String(r);
            case "==":
              return l === r;
            case "!=":
              return l !== r;
            case "and":
              return Boolean(l) && Boolean(r);
            case "or":
              return Boolean(l) || Boolean(r);
            case "in":
              if (typeof r === "string") return r.includes(String(l));
              if (Array.isArray(r)) return r.includes(l);
              return false;
          }
          throw new Error(`Unknown op: ${e.op}`);
        }
        case "Call": {
          const callArgs: Value[] = [];
          for (const a of e.args) callArgs.push(await evalExpr(a, env));

          // builtins
          if (e.name === "log") {
            console.log("[ps]", callArgs[0]);
            return null;
          }

          if (e.name === "llm") {
            llmCalls++;
            const input = callArgs[0] ?? {};

            let result: LLMCallResult;
            let success = true;

            try {
              result = await llmCallWithMeta(input);
            } catch (err: unknown) {
              success = false;
              // Record failed LLM call
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

            // Record usage
            this.logger.budgetTracker.recordLLMUsage(result.usage);

            // Log the LLM call
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

            // Loop detection
            const loopState = this.loopDetector.record(plan, success);

            if (loopState.loopDetected) {
              console.warn(`[ps] Loop detected: ${loopState.loopType}`);
              console.warn(`[ps] ${loopState.suggestion}`);

              await this.logger.logLoopWarning(
                steps,
                loopState.loopType ?? "unknown",
                loopState.suggestion ?? "No suggestion available",
              );

              // Callback if provided
              if (this.config.loopWarningCallback) {
                this.config.loopWarningCallback(loopState);
              }

              // Halt if configured
              if (this.config.haltOnLoop) {
                throw new Error(`LoopDetected: ${loopState.loopType} - ${loopState.suggestion}`);
              }
            }

            return plan as unknown as Value;
          }

          if (e.name === "tool") {
            this.logger.budgetTracker.incrementToolCall();
            const name = String(callArgs[0]);
            const toolArgs = (callArgs[1] ?? {}) as Record<string, unknown>;

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
          }

          // user funcs
          const f = this.funcs.get(e.name);
          if (!f) throw new Error(`Unknown function: ${e.name}`);
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
