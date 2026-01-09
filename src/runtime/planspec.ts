import { z } from "zod";

export const ProvenanceSchema = z.object({
  repo: z.string().optional(),
  branch: z.string().optional(),
  commit_sha: z.string().optional(),
  pr_url: z.string().url().optional(),
  issue_url: z.string().url().optional(),
  slack_thread_url: z.string().url().optional(),
});

export const CodeRefSchema = z.object({
  file_path: z.string(),
  symbol_name: z.string().optional(),
  symbol_id: z.string().optional(),
});

export const PolicySchema = z.object({
  allowActions: z.array(z.string()).optional(),
  allowWriteGlobs: z.array(z.string()).optional(),
  denyWriteGlobs: z.array(z.string()).optional(),
  allowCommands: z.array(z.string()).optional(),
  budgets: z
    .object({
      maxSteps: z.number().int().positive().optional(),
      maxLLMCalls: z.number().int().positive().optional(),
      maxTimeMs: z.number().int().positive().optional(),
      maxCostUsd: z.number().positive().optional(),
    })
    .optional(),
  haltOnLoop: z.boolean().optional(),
});

export const LLMConfigSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  noAsk: z.boolean().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const MemoryConfigSchema = z.object({
  key: z.string(),
  maxChars: z.number().int().positive().optional(),
  keepLastToolResults: z.number().int().positive().optional(),
  storeDiffSummary: z.boolean().optional(),
});

const StepBaseSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  requireApproval: z.boolean().optional(),
  code_refs: z.array(CodeRefSchema).optional(),
  provenance: ProvenanceSchema.optional(),
});

const ReadFileStepSchema = StepBaseSchema.extend({
  kind: z.literal("read_file"),
  path: z.string(),
  maxBytes: z.number().int().positive().optional(),
});

const SearchStepSchema = StepBaseSchema.extend({
  kind: z.literal("search"),
  query: z.string(),
  globs: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().optional(),
});

const WriteFileStepSchema = StepBaseSchema.extend({
  kind: z.literal("write_file"),
  path: z.string(),
  content: z.string().optional(),
  generated: z.boolean().optional(),
});

const PatchFileStepSchema = StepBaseSchema.extend({
  kind: z.literal("patch_file"),
  path: z.string(),
  patch: z.string().optional(),
  generated: z.boolean().optional(),
});

const RunCmdStepSchema = StepBaseSchema.extend({
  kind: z.literal("run_cmd"),
  cmd: z.string(),
  args: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const RunAgentStepSchema = StepBaseSchema.extend({
  kind: z.literal("run_agent"),
  prompt: z.string(),
  maxIterations: z.number().int().positive().optional(),
  requireWrite: z.boolean().optional(),
  contextFiles: z.array(z.string()).optional(),
  memory: MemoryConfigSchema.optional(),
});

const PlanApplyStepSchema = StepBaseSchema.extend({
  kind: z.literal("plan_apply"),
  prompt: z.string(),
  allowActions: z.array(z.string()).optional(),
});

const DecideStepSchema = StepBaseSchema.extend({
  kind: z.literal("decide"),
  question: z.string(),
  schema: z.record(z.unknown()).optional(),
  memory: MemoryConfigSchema.optional(),
});

const JudgeStepSchema = StepBaseSchema.extend({
  kind: z.literal("judge"),
  question: z.string(),
  memory: MemoryConfigSchema.optional(),
});

const SummarizeStepSchema = StepBaseSchema.extend({
  kind: z.literal("summarize"),
  instruction: z.string(),
  memory: MemoryConfigSchema.optional(),
});

const ParallelStepSchema = StepBaseSchema.extend({
  kind: z.literal("parallel"),
  steps: z.array(z.string()),
  max: z.number().int().positive().optional(),
  failFast: z.boolean().optional(),
});

const TimeoutStepSchema = StepBaseSchema.extend({
  kind: z.literal("timeout"),
  durationMs: z.number().int().positive(),
  stepId: z.string(),
});

const RetryStepSchema = StepBaseSchema.extend({
  kind: z.literal("retry"),
  count: z.number().int().positive(),
  backoffMs: z.number().int().positive().optional(),
  stepId: z.string(),
});

const ReportStepSchema = StepBaseSchema.extend({
  kind: z.literal("report"),
  message: z.string(),
  filesChanged: z.array(z.string()).optional(),
  nextSuggestions: z.array(z.string()).optional(),
  done: z.boolean().optional(),
});

export const PlanStepSchema = z.discriminatedUnion("kind", [
  ReadFileStepSchema,
  SearchStepSchema,
  WriteFileStepSchema,
  PatchFileStepSchema,
  RunCmdStepSchema,
  RunAgentStepSchema,
  PlanApplyStepSchema,
  DecideStepSchema,
  JudgeStepSchema,
  SummarizeStepSchema,
  ParallelStepSchema,
  TimeoutStepSchema,
  RetryStepSchema,
  ReportStepSchema,
]);

export const PlanSpecSchema = z.object({
  version: z.literal(1),
  goal: z.string(),
  title: z.string().optional(),
  source: z.enum(["human", "llm", "mixed"]).optional(),
  inputDoc: z.string().optional(),
  policy: PolicySchema.optional(),
  llm: LLMConfigSchema.optional(),
  memory: MemoryConfigSchema.optional(),
  steps: z.array(PlanStepSchema),
});

export type PlanSpec = z.infer<typeof PlanSpecSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
