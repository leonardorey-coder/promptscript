import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Event Types
// ============================================================================

export type StepEvent =
  | { step: number; type: "stmt"; detail: string; ts: string }
  | {
      step: number;
      type: "llm";
      input: unknown;
      output: unknown;
      usage?: TokenUsage;
      latencyMs?: number;
      retryCount?: number;
      ts: string;
    }
  | { step: number; type: "tool"; name: string; input: unknown; output: unknown; ts: string }
  | { step: number; type: "error"; error: string; ts: string }
  | { step: number; type: "loop_warning"; loopType: string; suggestion: string; ts: string }
  | { step: number; type: "budget_update"; budget: BudgetSnapshot; ts: string };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============================================================================
// Budget Tracking
// ============================================================================

export interface BudgetConfig {
  maxSteps: number;
  maxTimeMs: number;
  maxToolCalls: number;
  maxLLMCalls: number;
  maxTokens: number;
  maxCostUsd: number;
}

export interface BudgetSnapshot {
  steps: { current: number; max: number; percent: number };
  timeMs: { current: number; max: number; percent: number };
  toolCalls: { current: number; max: number; percent: number };
  llmCalls: { current: number; max: number; percent: number };
  tokens: { current: number; max: number; percent: number };
  costUsd: { current: number; max: number; percent: number };
}

export interface BudgetState {
  steps: number;
  startTime: number;
  toolCalls: number;
  llmCalls: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

const DEFAULT_BUDGET: BudgetConfig = {
  maxSteps: 50_000,
  maxTimeMs: 10 * 60_000, // 10 minutes
  maxToolCalls: 2_000,
  maxLLMCalls: 500,
  maxTokens: 1_000_000,
  maxCostUsd: 10.0,
};

// Rough cost estimates per 1K tokens (input/output averaged)
const COST_PER_1K_TOKENS: Record<string, number> = {
  "gpt-4o": 0.005,
  "gpt-4o-mini": 0.00015,
  "gpt-4-turbo": 0.01,
  "claude-3-opus": 0.015,
  "claude-sonnet-4": 0.003,
  "claude-3-haiku": 0.00025,
  default: 0.002,
};

export class BudgetTracker {
  private config: BudgetConfig;
  private state: BudgetState;
  private model: string;

  constructor(config: Partial<BudgetConfig> = {}, model: string = "default") {
    this.config = { ...DEFAULT_BUDGET, ...config };
    this.model = model;
    this.state = {
      steps: 0,
      startTime: Date.now(),
      toolCalls: 0,
      llmCalls: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
  }

  incrementStep(): void {
    this.state.steps++;
  }

  incrementToolCall(): void {
    this.state.toolCalls++;
  }

  recordLLMUsage(usage?: TokenUsage): void {
    this.state.llmCalls++;
    if (usage) {
      this.state.totalTokens += usage.totalTokens;
      const costPer1K = COST_PER_1K_TOKENS[this.model] ?? COST_PER_1K_TOKENS["default"] ?? 0.002;
      this.state.estimatedCostUsd += (usage.totalTokens / 1000) * costPer1K;
    }
  }

  getSnapshot(): BudgetSnapshot {
    const elapsed = Date.now() - this.state.startTime;

    return {
      steps: {
        current: this.state.steps,
        max: this.config.maxSteps,
        percent: (this.state.steps / this.config.maxSteps) * 100,
      },
      timeMs: {
        current: elapsed,
        max: this.config.maxTimeMs,
        percent: (elapsed / this.config.maxTimeMs) * 100,
      },
      toolCalls: {
        current: this.state.toolCalls,
        max: this.config.maxToolCalls,
        percent: (this.state.toolCalls / this.config.maxToolCalls) * 100,
      },
      llmCalls: {
        current: this.state.llmCalls,
        max: this.config.maxLLMCalls,
        percent: (this.state.llmCalls / this.config.maxLLMCalls) * 100,
      },
      tokens: {
        current: this.state.totalTokens,
        max: this.config.maxTokens,
        percent: (this.state.totalTokens / this.config.maxTokens) * 100,
      },
      costUsd: {
        current: this.state.estimatedCostUsd,
        max: this.config.maxCostUsd,
        percent: (this.state.estimatedCostUsd / this.config.maxCostUsd) * 100,
      },
    };
  }

  checkBudget(): { exceeded: boolean; reason: string | null } {
    const elapsed = Date.now() - this.state.startTime;

    if (this.state.steps > this.config.maxSteps) {
      return { exceeded: true, reason: `maxSteps exceeded: ${this.state.steps}/${this.config.maxSteps}` };
    }
    if (elapsed > this.config.maxTimeMs) {
      return { exceeded: true, reason: `maxTimeMs exceeded: ${elapsed}ms/${this.config.maxTimeMs}ms` };
    }
    if (this.state.toolCalls > this.config.maxToolCalls) {
      return { exceeded: true, reason: `maxToolCalls exceeded: ${this.state.toolCalls}/${this.config.maxToolCalls}` };
    }
    if (this.state.llmCalls > this.config.maxLLMCalls) {
      return { exceeded: true, reason: `maxLLMCalls exceeded: ${this.state.llmCalls}/${this.config.maxLLMCalls}` };
    }
    if (this.state.totalTokens > this.config.maxTokens) {
      return { exceeded: true, reason: `maxTokens exceeded: ${this.state.totalTokens}/${this.config.maxTokens}` };
    }
    if (this.state.estimatedCostUsd > this.config.maxCostUsd) {
      return {
        exceeded: true,
        reason: `maxCostUsd exceeded: $${this.state.estimatedCostUsd.toFixed(4)}/$${this.config.maxCostUsd}`,
      };
    }

    return { exceeded: false, reason: null };
  }

  getSummary(): string {
    const snapshot = this.getSnapshot();
    return [
      `Steps: ${snapshot.steps.current}/${snapshot.steps.max} (${snapshot.steps.percent.toFixed(1)}%)`,
      `Time: ${(snapshot.timeMs.current / 1000).toFixed(1)}s/${(snapshot.timeMs.max / 1000).toFixed(0)}s`,
      `Tool calls: ${snapshot.toolCalls.current}/${snapshot.toolCalls.max}`,
      `LLM calls: ${snapshot.llmCalls.current}/${snapshot.llmCalls.max}`,
      `Tokens: ${snapshot.tokens.current.toLocaleString()}/${snapshot.tokens.max.toLocaleString()}`,
      `Est. cost: $${snapshot.costUsd.current.toFixed(4)}/$${snapshot.costUsd.max}`,
    ].join(" | ");
  }
}

// ============================================================================
// Run Logger
// ============================================================================

export class RunLogger {
  runId: string;
  dir: string;
  file: string;
  budgetTracker: BudgetTracker;
  private eventCount: number = 0;

  constructor(
    private baseDir: string,
    budgetConfig?: Partial<BudgetConfig>,
    model?: string,
  ) {
    this.runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.dir = path.join(baseDir, this.runId);
    this.file = path.join(this.dir, "events.jsonl");
    this.budgetTracker = new BudgetTracker(budgetConfig, model);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file, "", "utf8");

    // Write initial metadata
    const meta = {
      runId: this.runId,
      startedAt: new Date().toISOString(),
      pid: process.pid,
      cwd: process.cwd(),
    };
    await fs.writeFile(path.join(this.dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  }

  async append(ev: StepEvent): Promise<void> {
    this.eventCount++;
    await fs.appendFile(this.file, JSON.stringify(ev) + "\n", "utf8");

    // Periodically log budget updates (every 50 events)
    if (this.eventCount % 50 === 0) {
      await this.logBudgetUpdate(ev.step);
    }
  }

  async logBudgetUpdate(step: number): Promise<void> {
    const ev: StepEvent = {
      step,
      type: "budget_update",
      budget: this.budgetTracker.getSnapshot(),
      ts: new Date().toISOString(),
    };
    await fs.appendFile(this.file, JSON.stringify(ev) + "\n", "utf8");
  }

  async logLoopWarning(step: number, loopType: string, suggestion: string): Promise<void> {
    const ev: StepEvent = {
      step,
      type: "loop_warning",
      loopType,
      suggestion,
      ts: new Date().toISOString(),
    };
    await fs.appendFile(this.file, JSON.stringify(ev) + "\n", "utf8");
  }

  async finalize(): Promise<void> {
    // Write final summary
    const summary = {
      runId: this.runId,
      finishedAt: new Date().toISOString(),
      budget: this.budgetTracker.getSnapshot(),
      eventCount: this.eventCount,
    };
    await fs.writeFile(path.join(this.dir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  }
}
