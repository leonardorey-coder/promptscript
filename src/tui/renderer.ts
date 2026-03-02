// ============================================================================
// TUI Renderer — PromptScript v0.5
// Main orchestrator that coordinates all TUI components
// ============================================================================

import { colorize, bold, dim, symbols } from "./colors";
import { box, header, sectionTitle, keyValue, divider } from "./panels";
import { Spinner, createSpinner } from "./spinner";
import { ProgressBar, createProgress } from "./progress";
import { StatusLine, createStatusLine } from "./status";
import { printBanner } from "./banner";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TUIConfig {
  version: string;
  verbose?: boolean;
}

export interface Budget {
  steps: number;
  llmCalls: number;
  tokens: number;
  costUsd: number;
  timeMs: number;
}

export interface PipelineResults {
  stages: Array<{
    name: string;
    status: "complete" | "failed";
    budget?: Budget;
  }>;
  totalLLMCalls: number;
  totalCostUsd: number;
  totalTimeMs: number;
}

// ── Renderer class ─────────────────────────────────────────────────────────

export class TUIRenderer {
  private config: TUIConfig | null = null;
  private spinner: Spinner | null = null;
  private progress: ProgressBar | null = null;
  private statusLine: StatusLine | null = null;
  private stageNames: string[] = [];

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(config: TUIConfig): void {
    this.config = config;

    // Show banner
    printBanner(config.version);

    // Start status line
    this.statusLine = createStatusLine();
    this.statusLine.start(config.version);
  }

  stop(): void {
    this.spinner?.stop();
    this.statusLine?.stop();
    console.log(); // Clean final newline
  }

  // ── Pipeline events ──────────────────────────────────────────────────────

  initPipeline(stageNames: string[]): void {
    this.stageNames = stageNames;
    this.progress = createProgress(stageNames);
    this.progress.render();
  }

  onStageStart(stage: string): void {
    this.statusLine?.setStage(stage);

    if (this.progress) {
      this.progress.update(stage, 0);
    }

    this.spinner = createSpinner(`Ejecutando ${stage}...`, "lightBlue");
    this.spinner.start();
  }

  onStageProgress(stage: string, percent: number): void {
    this.progress?.update(stage, percent);
  }

  onStageComplete(stage: string, budget?: Budget): void {
    this.spinner?.succeed(`${stage} completado`);
    this.spinner = null;

    this.progress?.complete(stage);

    if (budget) {
      this.statusLine?.setCost(budget.costUsd);
      console.log(
        `  ${dim("Budget:")} ${colorize(`${budget.llmCalls} LLM calls`, "dimWhite")}${dim(",")} ${colorize(`$${budget.costUsd.toFixed(3)}`, "yellow")}${dim(",")} ${colorize(`${budget.timeMs}ms`, "dimWhite")}`
      );
    }
  }

  onStageFail(stage: string, error: string): void {
    this.spinner?.fail(`${stage} falló`);
    this.spinner = null;

    this.progress?.fail(stage);

    console.log(`  ${colorize("Error:", "red")} ${error}`);
  }

  // ── Granular events ──────────────────────────────────────────────────────

  onLLMCall(callNumber: number, maxCalls: number): void {
    this.statusLine?.setLLMCalls(callNumber, maxCalls);
    this.spinner?.update(`Llamando LLM (${callNumber}/${maxCalls})...`);
  }

  onToolCall(name: string, _args?: unknown): void {
    this.spinner?.update(`Ejecutando ${name}...`);
  }

  onLog(message: string): void {
    // Pause spinner, print, resume
    this.spinner?.stop();
    console.log(`  ${dim("│")} ${message}`);
    this.spinner?.start();
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  showSummary(results: PipelineResults): void {
    this.stop();

    console.log();

    const summaryContent = [
      bold("Pipeline Complete"),
      "",
      ...results.stages.map((s) => {
        const icon = s.status === "complete" ? symbols.check : symbols.cross;
        return `${icon} ${s.name}`;
      }),
      "",
      `${dim("Total LLM calls:")} ${colorize(String(results.totalLLMCalls), "lightBlue")}`,
      `${dim("Total cost:")}      ${colorize(`$${results.totalCostUsd.toFixed(3)}`, "yellow")}`,
      `${dim("Total time:")}      ${colorize(`${(results.totalTimeMs / 1000).toFixed(1)}s`, "dimWhite")}`,
    ];

    console.log(
      box(summaryContent, { width: 50, style: "double", color: "blue" })
    );
    console.log();
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createRenderer(): TUIRenderer {
  return new TUIRenderer();
}
