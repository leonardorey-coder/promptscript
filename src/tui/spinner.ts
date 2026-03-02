// ============================================================================
// TUI Spinner — PromptScript v0.5
// Animated spinner for in-progress operations
// ============================================================================

import { colorize, type ColorName } from "./colors";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const INTERVAL_MS = 80;

export class Spinner {
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private message: string;
  private color: ColorName;

  constructor(message: string = "", color: ColorName = "lightBlue") {
    this.message = message;
    this.color = color;
  }

  start(message?: string): this {
    if (message) this.message = message;
    this.frameIndex = 0;

    this.timer = setInterval(() => {
      this.render();
      this.frameIndex = (this.frameIndex + 1) % FRAMES.length;
    }, INTERVAL_MS);

    return this;
  }

  update(message: string): this {
    this.message = message;
    return this;
  }

  succeed(message?: string): void {
    this.stop();
    const msg = message ?? this.message;
    process.stdout.write(`\r\x1b[K  ${colorize("✓", "green")} ${msg}\n`);
  }

  fail(message?: string): void {
    this.stop();
    const msg = message ?? this.message;
    process.stdout.write(`\r\x1b[K  ${colorize("✗", "red")} ${msg}\n`);
  }

  warn(message?: string): void {
    this.stop();
    const msg = message ?? this.message;
    process.stdout.write(`\r\x1b[K  ${colorize("⚠", "yellow")} ${msg}\n`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stdout.write("\r\x1b[K");
  }

  private render(): void {
    const frame = colorize(FRAMES[this.frameIndex]!, this.color);
    process.stdout.write(`\r\x1b[K  ${frame} ${this.message}`);
  }
}

export function createSpinner(message?: string, color?: ColorName): Spinner {
  return new Spinner(message, color);
}
