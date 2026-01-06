import { z } from "zod";
import { PlanSchema, type Plan } from "./plan";

// ============================================================================
// LLM Provider Configuration
// ============================================================================

export type LLMProvider = "openai" | "openrouter" | "anthropic" | "custom";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
}

// Default configs from environment (Bun auto-loads .env)
const DEFAULT_CONFIGS: Record<LLMProvider, Partial<LLMConfig>> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
  },
  custom: {},
};

// ============================================================================
// Response Types
// ============================================================================

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChoice {
  message: { content: string };
  finish_reason: string;
}

interface OpenAIResponse {
  id: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// LLM Call Result with metadata
// ============================================================================

export interface LLMCallResult {
  plan: Plan;
  rawResponse: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  retryCount: number;
  latencyMs: number;
}

// ============================================================================
// JSON Extraction & Retry Logic
// ============================================================================

function extractJSON(text: string): string {
  // Try to find JSON in markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch && jsonMatch[0]) {
    return jsonMatch[0];
  }

  return text.trim();
}

function parseJSONSafe(text: string): unknown {
  const extracted = extractJSON(text);

  // Handle common LLM mistakes
  let cleaned = extracted
    .replace(/,\s*}/g, "}") // trailing commas in objects
    .replace(/,\s*]/g, "]") // trailing commas in arrays
    .replace(/'/g, '"') // single quotes to double
    .replace(/(\w+):/g, '"$1":') // unquoted keys
    .replace(/"(\w+)":/g, (_, k) => `"${k}":`) // already quoted, skip
    .replace(/:\s*'([^']*)'/g, ': "$1"'); // single-quoted values

  // Fix double-quoted keys that got double-processed
  cleaned = cleaned.replace(/""+/g, '"');

  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: try original
    return JSON.parse(extracted);
  }
}

// ============================================================================
// LLM Client Class
// ============================================================================

export class LLMClient {
  private config: Required<LLMConfig>;

  constructor(config: Partial<LLMConfig> = {}) {
    const provider = config.provider ?? this.detectProvider();
    const defaults = DEFAULT_CONFIGS[provider];

    this.config = {
      provider,
      apiKey: config.apiKey ?? this.getApiKey(provider),
      baseUrl: config.baseUrl ?? defaults.baseUrl ?? "",
      model: config.model ?? defaults.model ?? "gpt-4o",
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      timeoutMs: config.timeoutMs ?? 60_000,
      temperature: config.temperature ?? 0.1,
      maxTokens: config.maxTokens ?? 4096,
    };
  }

  private detectProvider(): LLMProvider {
    if (process.env.OPENROUTER_API_KEY) return "openrouter";
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    if (process.env.OPENAI_API_KEY) return "openai";
    return "openai"; // fallback
  }

  private getApiKey(provider: LLMProvider): string {
    switch (provider) {
      case "openrouter":
        return process.env.OPENROUTER_API_KEY ?? "";
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY ?? "";
      case "openai":
      case "custom":
        return process.env.OPENAI_API_KEY ?? "";
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    // OpenRouter specific headers
    if (this.config.provider === "openrouter") {
      headers["HTTP-Referer"] = process.env.OPENROUTER_REFERER ?? "https://promptscript.dev";
      headers["X-Title"] = "PromptScript";
    }

    return headers;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildSystemPrompt(): string {
    return `You are an AI coding assistant that plans actions step by step.

CRITICAL: You MUST respond with ONLY valid JSON matching this exact schema:
{
  "action": "READ_FILE" | "SEARCH" | "WRITE_FILE" | "PATCH_FILE" | "RUN_CMD" | "ASK_USER" | "REPORT",
  "args": { ... action-specific arguments ... },
  "done": boolean,
  "confidence": number (0-1),
  "reason": "brief explanation"
}

Action arguments:
- READ_FILE: { "path": "file/path" }
- SEARCH: { "query": "search term", "globs": ["*.ts"] (optional) }
- WRITE_FILE: { "path": "file/path", "content": "file content" }
- PATCH_FILE: { "path": "file/path", "patch": "REPLACE:\\n<new content>" }
- RUN_CMD: { "cmd": "command", "args": ["arg1", "arg2"] }
- ASK_USER: { "question": "what to ask", "choices": ["opt1", "opt2"] (optional) }
- REPORT: { "message": "summary", "filesChanged": ["file1.ts"] (optional) }

Set "done": true only when the task is fully complete.
DO NOT include any text outside the JSON object.`;
  }

  async call(input: {
    system?: string;
    user: string;
    context?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<LLMCallResult> {
    // Check for mock_plan (testing mode)
    if ((input as any).mock_plan) {
      const plan = PlanSchema.parse((input as any).mock_plan);
      return {
        plan,
        rawResponse: JSON.stringify(plan),
        retryCount: 0,
        latencyMs: 0,
      };
    }

    if (!this.config.apiKey) {
      throw new Error(
        `No API key found for provider: ${this.config.provider}. ` +
          `Set ${this.config.provider.toUpperCase()}_API_KEY in .env`,
      );
    }

    const messages: OpenAIMessage[] = [
      { role: "system", content: input.system ?? this.buildSystemPrompt() },
    ];

    // Add context if provided
    if (input.context) {
      messages.push({
        role: "user",
        content: `Current context:\n${input.context}`,
      });
    }

    // Add history
    if (input.history) {
      for (const msg of input.history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add user message
    messages.push({ role: "user", content: input.user });

    const startTime = Date.now();
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.buildHeaders(),
          signal: controller.signal,
          body: JSON.stringify({
            model: this.config.model,
            messages,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
            response_format: { type: "json_object" }, // OpenAI JSON mode
          }),
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();

          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get("retry-after") ?? "5", 10);
            console.warn(`[llm] Rate limited. Waiting ${retryAfter}s...`);
            await this.sleep(retryAfter * 1000);
            retryCount++;
            continue;
          }

          throw new Error(`LLM API error ${response.status}: ${errorBody}`);
        }

        const data = (await response.json()) as OpenAIResponse;
        const rawContent = data.choices[0]?.message?.content ?? "";

        // Parse and validate JSON
        try {
          const parsed = parseJSONSafe(rawContent);
          const plan = PlanSchema.parse(parsed);

          return {
            plan,
            rawResponse: rawContent,
            usage: data.usage
              ? {
                  promptTokens: data.usage.prompt_tokens,
                  completionTokens: data.usage.completion_tokens,
                  totalTokens: data.usage.total_tokens,
                }
              : undefined,
            retryCount,
            latencyMs: Date.now() - startTime,
          };
        } catch (parseError) {
          // JSON parse or Zod validation failed - retry with correction prompt
          console.warn(`[llm] JSON parse/validation failed (attempt ${attempt + 1}):`, parseError);

          if (attempt < this.config.maxRetries) {
            // Add the failed response and ask for correction
            messages.push({ role: "assistant", content: rawContent });
            messages.push({
              role: "user",
              content:
                "Your response was not valid JSON or didn't match the schema. " +
                "Please respond with ONLY a valid JSON object matching the required schema. " +
                "Do not include any explanation or markdown.",
            });
            retryCount++;
            await this.sleep(this.config.retryDelayMs * Math.pow(2, attempt));
            continue;
          }

          throw parseError;
        }
      } catch (error: any) {
        lastError = error;

        if (error.name === "AbortError") {
          throw new Error(`LLM request timed out after ${this.config.timeoutMs}ms`);
        }

        // Network errors - retry with backoff
        if (attempt < this.config.maxRetries) {
          console.warn(`[llm] Request failed (attempt ${attempt + 1}):`, error.message);
          retryCount++;
          await this.sleep(this.config.retryDelayMs * Math.pow(2, attempt));
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error("LLM call failed after all retries");
  }
}

// ============================================================================
// Global client instance & legacy wrapper
// ============================================================================

let globalClient: LLMClient | null = null;

export function configureLLM(config: Partial<LLMConfig>): void {
  globalClient = new LLMClient(config);
}

export function getLLMClient(): LLMClient {
  if (!globalClient) {
    globalClient = new LLMClient();
  }
  return globalClient;
}

// Legacy wrapper for VM compatibility
export async function llmCall(input: any): Promise<Plan> {
  const client = getLLMClient();
  const result = await client.call({
    system: input.system,
    user: input.user ?? input.prompt ?? "What should I do next?",
    context: input.context,
    history: input.history,
    ...(input.mock_plan ? { mock_plan: input.mock_plan } : {}),
  } as any);

  return result.plan;
}

// Extended call that returns full result with metadata
export async function llmCallWithMeta(input: any): Promise<LLMCallResult> {
  const client = getLLMClient();
  return client.call({
    system: input.system,
    user: input.user ?? input.prompt ?? "What should I do next?",
    context: input.context,
    history: input.history,
    ...(input.mock_plan ? { mock_plan: input.mock_plan } : {}),
  } as any);
}
