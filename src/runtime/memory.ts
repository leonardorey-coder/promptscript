import fs from "node:fs/promises";
import path from "node:path";
import { LLMClient } from "./llm";

export interface MemoryConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  budget_tokens?: number;
}

export interface LongTermMemory {
  facts: Record<string, any>;
  file_summaries: Record<string, string>;
  capabilities: string[];
  glossary: Record<string, string>;
  index: Record<string, string[]>;
}

export interface ShortTermMemory {
  summary: string;
  objective?: string;
  context?: any;
  recent_events: Array<{
    type: string;
    detail: string;
    timestamp: string;
  }>;
  window_steps: number;
}

export interface Checkpoint {
  milestones: Record<string, { ok: boolean; evidence?: string }>;
  next: string;
  timestamp: string;
}

export interface RecallResult {
  chunks: Array<{
    source: string;
    content: string;
    relevance: number;
  }>;
  query: string;
}

export class MemoryStore {
  private storageDir: string;
  private longMemories = new Map<string, LongTermMemory>();
  private shortMemories = new Map<string, ShortTermMemory>();
  private checkpoints = new Map<string, Checkpoint>();
  private configs = new Map<string, MemoryConfig>();

  constructor(projectRoot: string) {
    this.storageDir = path.join(projectRoot, ".ps-memory");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  async buildMemory(
    name: string,
    options: {
      globs: string[];
      mode?: "full" | "incremental";
      config?: MemoryConfig;
    }
  ): Promise<void> {
    const config = options.config || this.configs.get(name) || {};
    this.configs.set(name, config);

    const ltm: LongTermMemory = this.longMemories.get(name) || {
      facts: {},
      file_summaries: {},
      capabilities: [],
      glossary: {},
      index: {},
    };

    console.log(
      `[memory] Building long-term memory '${name}' with globs: ${options.globs.join(", ")}`
    );

    const memoryDir = path.join(this.storageDir, name);
    await fs.mkdir(memoryDir, { recursive: true });

    this.longMemories.set(name, ltm);

    await fs.writeFile(
      path.join(memoryDir, "ltm.json"),
      JSON.stringify(ltm, null, 2),
      "utf8"
    );

    console.log(`[memory] Memory '${name}' built and saved`);
  }

  async recall(
    name: string,
    query: string,
    options: { top_k?: number } = {}
  ): Promise<RecallResult> {
    const ltm = this.longMemories.get(name);
    if (!ltm) {
      console.warn(`[memory] No long-term memory found for '${name}'`);
      return { chunks: [], query };
    }

    const topK = options.top_k || 5;
    const chunks: RecallResult["chunks"] = [];

    for (const [filePath, summary] of Object.entries(ltm.file_summaries)) {
      if (summary.toLowerCase().includes(query.toLowerCase())) {
        chunks.push({
          source: filePath,
          content: summary,
          relevance: 1.0,
        });
      }
    }

    for (const [term, definition] of Object.entries(ltm.glossary)) {
      if (
        term.toLowerCase().includes(query.toLowerCase()) ||
        definition.toLowerCase().includes(query.toLowerCase())
      ) {
        chunks.push({
          source: `glossary:${term}`,
          content: definition,
          relevance: 0.9,
        });
      }
    }

    chunks.sort((a, b) => b.relevance - a.relevance);

    return {
      chunks: chunks.slice(0, topK),
      query,
    };
  }

  getShortMemory(key: string): ShortTermMemory | undefined {
    return this.shortMemories.get(key);
  }

  setShortMemory(key: string, memory: ShortTermMemory): void {
    this.shortMemories.set(key, memory);
  }

  updateShortMemory(key: string, updates: Partial<ShortTermMemory>): void {
    const existing = this.shortMemories.get(key) || {
      summary: "",
      recent_events: [],
      window_steps: 8,
    };
    this.shortMemories.set(key, { ...existing, ...updates });
  }

  getCheckpoint(key: string): Checkpoint | undefined {
    return this.checkpoints.get(key);
  }

  setCheckpoint(key: string, checkpoint: Checkpoint): void {
    this.checkpoints.set(key, checkpoint);
  }

  async forget(
    memoryKey: string,
    mode: "compact" | "reset" | "keep_last",
    options: { keep_n?: number } = {}
  ): Promise<{ before_tokens: number; after_tokens: number }> {
    const stm = this.shortMemories.get(memoryKey);
    if (!stm) {
      console.warn(`[memory] No short-term memory found for '${memoryKey}'`);
      return { before_tokens: 0, after_tokens: 0 };
    }

    const beforeTokens = this.estimateTokens(JSON.stringify(stm));

    switch (mode) {
      case "compact": {
        const checkpoint = this.checkpoints.get(memoryKey) || {
          milestones: {},
          next: stm.objective || "",
          timestamp: new Date().toISOString(),
        };

        const compactedSummary = `Checkpoint: ${Object.keys(checkpoint.milestones).length} milestones completed. Next: ${checkpoint.next}`;

        stm.summary = compactedSummary;
        stm.recent_events = stm.recent_events.slice(-3);
        break;
      }

      case "reset": {
        const checkpoint = this.checkpoints.get(memoryKey);
        stm.summary = checkpoint ? `Checkpoint: ${checkpoint.next}` : "";
        stm.recent_events = [];
        stm.context = {};
        break;
      }

      case "keep_last": {
        const keepN = options.keep_n || 5;
        stm.recent_events = stm.recent_events.slice(-keepN);
        break;
      }
    }

    this.shortMemories.set(memoryKey, stm);

    const afterTokens = this.estimateTokens(JSON.stringify(stm));

    console.log(
      `[memory] Forgot memory '${memoryKey}' (${mode}): ${beforeTokens} -> ${afterTokens} tokens (${Math.round((1 - afterTokens / beforeTokens) * 100)}% reduction)`
    );

    return { before_tokens: beforeTokens, after_tokens: afterTokens };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async compactMemory(
    memoryKey: string,
    checkpointKey: string,
    client?: LLMClient
  ): Promise<void> {
    const stm = this.shortMemories.get(memoryKey);
    if (!stm) return;

    const existingCheckpoint = this.checkpoints.get(checkpointKey) || {
      milestones: {},
      next: "",
      timestamp: new Date().toISOString(),
    };

    const newCheckpoint: Checkpoint = {
      ...existingCheckpoint,
      timestamp: new Date().toISOString(),
    };

    this.checkpoints.set(checkpointKey, newCheckpoint);

    console.log(
      `[memory] Compacted memory '${memoryKey}' into checkpoint '${checkpointKey}'`
    );
  }

  async archive(
    memoryKey: string,
    options: {
      to_ltm?: string;
      clear_stm?: boolean;
    } = {}
  ): Promise<{ archived: boolean; events_count: number }> {
    const stm = this.shortMemories.get(memoryKey);
    if (!stm) {
      console.warn(`[memory] No short-term memory found for '${memoryKey}'`);
      return { archived: false, events_count: 0 };
    }

    const eventsCount = stm.recent_events.length;

    if (options.to_ltm) {
      const ltm = this.longMemories.get(options.to_ltm);
      if (ltm) {
        const archiveKey = `archived_${memoryKey}_${Date.now()}`;
        ltm.facts[archiveKey] = {
          summary: stm.summary,
          objective: stm.objective,
          events_count: eventsCount,
          archived_at: new Date().toISOString(),
        };

        this.longMemories.set(options.to_ltm, ltm);

        const memoryDir = path.join(this.storageDir, options.to_ltm);
        await fs.mkdir(memoryDir, { recursive: true });
        await fs.writeFile(
          path.join(memoryDir, "ltm.json"),
          JSON.stringify(ltm, null, 2),
          "utf8"
        );

        console.log(
          `[memory] Archived STM '${memoryKey}' to LTM '${options.to_ltm}'`
        );
      }
    }

    if (options.clear_stm) {
      this.shortMemories.delete(memoryKey);
      console.log(`[memory] Cleared STM '${memoryKey}'`);
    }

    return { archived: true, events_count: eventsCount };
  }
}
