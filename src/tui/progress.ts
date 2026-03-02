// ============================================================================
// TUI Progress Bar — PromptScript v0.5
// Visual progress tracking for pipeline stages
// ============================================================================

import { colorize, bold, dim, symbols, type ColorName } from "./colors";
import { stripAnsi } from "./panels";

type StageState = "pending" | "active" | "complete" | "failed";

interface StageInfo {
  name: string;
  state: StageState;
  percent: number;
}

export class ProgressBar {
  private stages: StageInfo[];
  private barWidth: number;
  private startLine: number = 0;

  constructor(stageNames: string[], barWidth: number = 30) {
    this.stages = stageNames.map((name) => ({
      name,
      state: "pending",
      percent: 0,
    }));
    this.barWidth = barWidth;
  }

  /**
   * Render all stages (initial draw).
   */
  render(): void {
    this.startLine = 0;
    const output = this.stages.map((s) => this.formatStage(s)).join("\n");
    console.log(`\n${output}\n`);
  }

  /**
   * Update a stage's progress.
   */
  update(stageName: string, percent: number): void {
    const stage = this.stages.find((s) => s.name === stageName);
    if (!stage) return;
    stage.percent = Math.min(100, Math.max(0, percent));
    stage.state = "active";
    this.rerender();
  }

  /**
   * Mark a stage as complete.
   */
  complete(stageName: string): void {
    const stage = this.stages.find((s) => s.name === stageName);
    if (!stage) return;
    stage.percent = 100;
    stage.state = "complete";
    this.rerender();
  }

  /**
   * Mark a stage as failed.
   */
  fail(stageName: string): void {
    const stage = this.stages.find((s) => s.name === stageName);
    if (!stage) return;
    stage.state = "failed";
    this.rerender();
  }

  private rerender(): void {
    // Move cursor up to redraw
    const linesUp = this.stages.length + 2; // + padding
    process.stdout.write(`\x1b[${linesUp}A`);
    const output = this.stages.map((s) => this.formatStage(s)).join("\n");
    process.stdout.write(`\n${output}\n\n`);
  }

  private formatStage(stage: StageInfo): string {
    const maxNameLen = Math.max(...this.stages.map((s) => s.name.length));
    const paddedName = stage.name.padEnd(maxNameLen);

    // Label
    const nameColor: ColorName =
      stage.state === "active"
        ? "lightBlue"
        : stage.state === "complete"
          ? "green"
          : stage.state === "failed"
            ? "red"
            : "dimWhite";

    const label = colorize(paddedName, nameColor);

    // Bar
    const filled = Math.round((stage.percent / 100) * this.barWidth);
    const empty = this.barWidth - filled;
    const filledChar =
      stage.state === "failed"
        ? colorize(symbols.bar.filled, "red")
        : colorize(symbols.bar.filled, "blue");
    const emptyChar = dim(symbols.bar.empty);
    const bar = filledChar.repeat(filled) + emptyChar.repeat(empty);

    // Percentage / status
    let status: string;
    if (stage.state === "complete") {
      status = colorize("✓", "green");
    } else if (stage.state === "failed") {
      status = colorize("✗", "red");
    } else if (stage.state === "active") {
      status = colorize(`${stage.percent}%`, "lightBlue");
    } else {
      status = dim("—");
    }

    return `  ${label}  ${bar}  ${status}`;
  }
}

export function createProgress(
  stageNames: string[],
  barWidth?: number
): ProgressBar {
  return new ProgressBar(stageNames, barWidth);
}
