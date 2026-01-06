import type { Program, Stmt, Expr } from "./ast";
import type { Plan } from "../runtime/plan";
import { PlanSchema } from "../runtime/plan";
import type { ToolRegistry, ToolContext } from "../runtime/tools";
import type { RunLogger } from "../runtime/logger";
import { llmCall } from "../runtime/llm";

type Value = string | number | boolean | null | Record<string, any> | any[];

class ReturnSignal {
  constructor(public value: Value) {}
}
class BreakSignal {}

export class VM {
  private funcs = new Map<string, { params: string[]; body: Stmt[] }>();

  constructor(
    private registry: ToolRegistry,
    private ctx: ToolContext,
    private logger: RunLogger,
    private budgets: { maxSteps: number; maxTimeMs: number; maxToolCalls: number },
  ) {}

  async run(program: Program) {
    const start = Date.now();
    let steps = 0;
    let toolCalls = 0;

    const step = async (detail: string) => {
      steps++;
      await this.logger.append({ step: steps, type: "stmt", detail, ts: new Date().toISOString() });
      if (steps > this.budgets.maxSteps) throw new Error("BudgetExceeded: maxSteps");
      if (Date.now() - start > this.budgets.maxTimeMs) throw new Error("BudgetExceeded: maxTimeMs");
      if (toolCalls > this.budgets.maxToolCalls) throw new Error("BudgetExceeded: maxToolCalls");
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
          const out: Record<string, any> = {};
          for (const p of e.pairs) out[p.key] = await evalExpr(p.value, env);
          return out;
        }
        case "Arr": {
          const out: any[] = [];
          for (const it of e.items) out.push(await evalExpr(it, env));
          return out;
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
          const args = [];
          for (const a of e.args) args.push(await evalExpr(a, env));

          // builtins
          if (e.name === "log") {
            console.log("[ps]", args[0]);
            return null;
          }

          if (e.name === "llm") {
            const input = args[0] ?? {};
            const planRaw = await llmCall(input);

            const plan: Plan = PlanSchema.parse(planRaw);
            await this.logger.append({ step: steps, type: "llm", input, output: plan, ts: new Date().toISOString() });
            return plan as any;
          }

          if (e.name === "tool") {
            toolCalls++;
            const name = String(args[0]);
            const toolArgs = (args[1] ?? {}) as any;

            if (!this.ctx.policy.allowTools.includes(name)) {
              throw new Error(`PolicyViolation: tool not allowed: ${name}`);
            }

            const tool = this.registry.get(name);
            const parsed = tool.schema.parse(toolArgs);

            const out = await tool.run(this.ctx, parsed);
            await this.logger.append({ step: steps, type: "tool", name, input: parsed, output: out, ts: new Date().toISOString() });
            return out as any;
          }

          // user funcs
          const f = this.funcs.get(e.name);
          if (!f) throw new Error(`Unknown function: ${e.name}`);
          const local = new Map<string, Value>();
          f.params.forEach((p, idx) => local.set(p, (args[idx] as any) ?? null));

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
    } catch (e: any) {
      await this.logger.append({ step: steps, type: "error", error: e?.message ?? String(e), ts: new Date().toISOString() });
      throw e;
    }
  }
}
