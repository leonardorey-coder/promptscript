import fs from "node:fs/promises";
import path from "node:path";

export type StepEvent =
  | { step: number; type: "stmt"; detail: string; ts: string }
  | { step: number; type: "llm"; input: any; output: any; ts: string }
  | { step: number; type: "tool"; name: string; input: any; output: any; ts: string }
  | { step: number; type: "error"; error: string; ts: string };

export class RunLogger {
  runId: string;
  dir: string;
  file: string;

  constructor(private baseDir: string) {
    this.runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.dir = path.join(baseDir, this.runId);
    this.file = path.join(this.dir, "events.jsonl");
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file, "", "utf8");
  }

  async append(ev: StepEvent) {
    await fs.appendFile(this.file, JSON.stringify(ev) + "\n", "utf8");
  }
}
