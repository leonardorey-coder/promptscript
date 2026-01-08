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

export const DEFAULT_SYSTEM_PROMPT = `You are a SENIOR web developer AI. Generate PROFESSIONAL quality code. Respond with ONLY valid JSON.

## FORMAT
{"action":"ACTION","args":{...},"done":false,"reason":"brief"}

## ACTIONS

READ_FILE - Read file contents
{"action":"READ_FILE","args":{"path":"public/index.html"},"done":false,"reason":"check file"}

WRITE_FILE - Create/update file (ESCAPE quotes as \\" and newlines as \\n)
{"action":"WRITE_FILE","args":{"path":"file.html","content":"..."},"done":false,"reason":"create file"}

REPORT - Task complete (done:true)
{"action":"REPORT","args":{"message":"Done"},"done":true,"reason":"complete"}

## RULES
1. JSON ONLY - escape " as \\" and newlines as \\n
2. MAX 3000 chars content - write quality code, not minimal
3. HTML must be complete: <!DOCTYPE html> to </html>
4. One action per response
5. done:true ONLY with REPORT

## QUALITY STANDARDS
- Use modern CSS: flexbox, grid, gradients, shadows
- Include hover effects and transitions
- Use semantic HTML (header, main, section, footer)
- Professional color schemes (pastels, gradients)
- Good typography (line-height, font-weight)

## EXAMPLE - Premium landing page
{"action":"WRITE_FILE","args":{"path":"public/index.html","content":"<!DOCTYPE html>\\n<html lang..."},"done":false,"reason":"create page"}

## MODIFYING FILES
1. READ_FILE first to see content
2. WRITE_FILE with ALL existing content + your additions`;

export function getDefaultSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}

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

/**
 * Try to recover a truncated WRITE_FILE action from partial JSON.
 * Extracts the path and content, and completes the HTML if possible.
 */
function recoverTruncatedWriteFile(text: string): object | null {
  // Check if this looks like a truncated WRITE_FILE
  const actionMatch = text.match(/"action"\s*:\s*"WRITE_FILE"/i);
  if (!actionMatch) return null;

  // Extract the path
  const pathMatch = text.match(/"path"\s*:\s*"([^"]+)"/);
  if (!pathMatch || !pathMatch[1]) return null;
  const path = pathMatch[1];

  // Extract partial content - find the content field
  const contentStart = text.indexOf('"content"');
  if (contentStart === -1) return null;

  // Find the opening quote of the content value
  const contentValueMatch = text.slice(contentStart).match(/"content"\s*:\s*"/);
  if (!contentValueMatch) return null;

  const contentBegin = contentStart + contentValueMatch[0].length;
  let content = text.slice(contentBegin);

  // Remove trailing JSON structure that might be included
  // Look for patterns like "},"done": or just "}, which indicate end of content field

  // First, try to find where the content string actually ends
  // The content is a JSON string value, so it ends at an unescaped quote
  // followed by JSON structure like }," or just }

  // For HTML files, we can be smarter - find </html> and truncate there
  const htmlEndMatch = content.match(/<\/html\s*>/i);
  if (htmlEndMatch) {
    const htmlEndIndex = content.indexOf(htmlEndMatch[0]) + htmlEndMatch[0].length;
    content = content.slice(0, htmlEndIndex);
  } else {
    // For non-HTML or if </html> not found, remove trailing JSON patterns
    // Remove everything after the last occurrence of common file endings or JSON markers
    content = content.replace(/"\s*}\s*,\s*"done"[\s\S]*$/, ''); // Remove "},"done":... pattern
    content = content.replace(/"\s*}\s*$/, ''); // Remove trailing "}
    content = content.replace(/\\n?$/, ''); // Remove trailing \n or \
    content = content.replace(/"[^"]*$/, ''); // Remove trailing partial quote
  }

  // Unescape the JSON string content
  try {
    // Add closing quote and parse as JSON string to unescape
    const tempJson = `"${content}"`;
    content = JSON.parse(tempJson);
  } catch {
    // Manual unescape for common cases
    content = content
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  // If it's HTML, try to complete it
  if (path.endsWith('.html') || path.endsWith('.htm')) {
    const lowerContent = content.toLowerCase();

    // Add missing closing tags
    if (!lowerContent.includes('</body>')) {
      content += '\n</body>';
    }
    if (!lowerContent.includes('</html>')) {
      content += '\n</html>';
    }

    // Check if we have the basic structure
    if (!lowerContent.includes('<!doctype')) {
      // Too truncated, can't recover
      console.log('[llm] HTML too truncated to recover, missing DOCTYPE');
      return null;
    }
  }

  console.log(`[llm] Recovered truncated WRITE_FILE for ${path} (${content.length} chars)`);

  return {
    action: "WRITE_FILE",
    args: { path, content },
    done: false,
    reason: "recovered truncated"
  };
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
    // Try to recover truncated WRITE_FILE
    const recovered = recoverTruncatedWriteFile(text);
    if (recovered) {
      return recovered;
    }

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
    return DEFAULT_SYSTEM_PROMPT;
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
    let rateLimitCount = 0;
    const maxRateLimitRetries = 10; // Max rate limit waits before giving up

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

          // Handle rate limiting - don't count as attempt, just wait
          if (response.status === 429) {
            rateLimitCount++;
            if (rateLimitCount > maxRateLimitRetries) {
              throw new Error(`Rate limited too many times (${rateLimitCount}). Giving up.`);
            }

            // Parse retry-after from header or error body
            let retryAfter = parseInt(response.headers.get("retry-after") ?? "0", 10);

            // Try to extract from error body if not in header
            if (retryAfter === 0) {
              const waitMatch = errorBody.match(/try again in (\d+(?:\.\d+)?)\s*s/i);
              if (waitMatch && waitMatch[1]) {
                retryAfter = Math.ceil(parseFloat(waitMatch[1]));
              } else {
                retryAfter = 5 * rateLimitCount; // Exponential backoff: 5s, 10s, 15s...
              }
            }

            console.log(`[llm] Rate limited (${rateLimitCount}/${maxRateLimitRetries}). Waiting ${retryAfter}s...`);
            await this.sleep(retryAfter * 1000);

            // Don't increment attempt - rate limits are external, retry same attempt
            attempt--;
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

          const usage = data.usage
            ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
            : undefined;

          // Instead of ASK_USER (which ignores no_ask), throw an error
          // This allows the agent to handle it and retry with a different approach
          console.log("[llm] LLM response was not valid JSON after retries");
          const snippet = rawContent.slice(0, 500);
          throw new Error(
            `LLM response was not valid JSON after ${this.config.maxRetries} retries. ` +
            `The model may be generating content that's too long. ` +
            `Raw response (truncated): ${snippet}...`
          );
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
