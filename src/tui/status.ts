// ============================================================================
// TUI Status Line — PromptScript v0.5
// Persistent bottom status bar with live updates
// ============================================================================

import { colorize, dim, type ColorName } from "./colors";

interface StatusData {
  version?: string;
  stage?: string;
  llmCalls?: { current: number; max: number };
  cost?: number;
  elapsed?: number;
}

export class StatusLine {
  private data: StatusData = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime: number = Date.now();

  start(version: string): void {
    this.data.version = version;
    this.startTime = Date.now();

    // Update elapsed time every second
    this.timer = setInterval(() => {
      this.data.elapsed = (Date.now() - this.startTime) / 1000;
      this.render();
    }, 1000);

    this.render();
  }

  setStage(stage: string): void {
    this.data.stage = stage;
    this.render();
  }

  setLLMCalls(current: number, max: number): void {
    this.data.llmCalls = { current, max };
    this.render();
  }

  setCost(cost: number): void {
    this.data.cost = cost;
    this.render();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stdout.write("\r\x1b[K"); // Clear the status line
  }

  private render(): void {
    const sep = dim(" │ ");
    const parts: string[] = [];

    if (this.data.version) {
      parts.push(colorize(`PromptScript v${this.data.version}`, "blue"));
    }

    if (this.data.stage) {
      parts.push(`${dim("Stage:")} ${colorize(this.data.stage, "purple")}`);
    }

    if (this.data.llmCalls) {
      const { current, max } = this.data.llmCalls;
      parts.push(
        `${dim("LLM:")} ${colorize(`${current}/${max}`, "lightBlue")}`
      );
    }

    if (this.data.cost !== undefined) {
      parts.push(
        `${dim("Cost:")} ${colorize(`$${this.data.cost.toFixed(3)}`, "yellow")}`
      );
    }

    if (this.data.elapsed !== undefined) {
      const elapsed = this.data.elapsed;
      const formatted =
        elapsed < 60
          ? `${elapsed.toFixed(1)}s`
          : `${Math.floor(elapsed / 60)}m${Math.floor(elapsed % 60)}s`;
      parts.push(`${dim("⏱")} ${colorize(formatted, "dimWhite")}`);
    }

    const line = ` ${parts.join(sep)} `;
    process.stdout.write(`\r\x1b[K${line}`);
  }
}

export function createStatusLine(): StatusLine {
  return new StatusLine();
}
