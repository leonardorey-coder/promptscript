import { z } from "zod";

const Action = z.enum([
  "READ_FILE",
  "SEARCH",
  "WRITE_FILE",
  "PATCH_FILE",
  "RUN_CMD",
  "ASK_USER",
  "REPORT",
]);

const ReadFileArgs = z.object({
  path: z.string().min(1),
  maxBytes: z.number().int().positive().max(500_000).optional(),
});

const SearchArgs = z.object({
  query: z.string().min(1),
  globs: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().max(5000).optional(),
});

const WriteFileArgs = z.object({
  path: z.string().min(1),
  content: z.string(),
  mode: z.enum(["overwrite", "create_only"]).optional(),
});

const PatchFileArgs = z.object({
  path: z.string().min(1),
  patch: z.string().min(1),
});

const RunCmdArgs = z.object({
  cmd: z.string().min(1),
  args: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

const AskUserArgs = z.object({
  question: z.string().min(1),
  choices: z.array(z.string()).min(1).optional(),
});

const ReportArgs = z.object({
  message: z.string(),
  filesChanged: z.array(z.string()).optional(),
  nextSuggestions: z.array(z.string()).optional(),
});

// Base fields that every plan has
const PlanBase = z.object({
  done: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

// Each action type extends base with its specific args
export const PlanSchema = z.discriminatedUnion("action", [
  PlanBase.extend({ action: z.literal("READ_FILE"), args: ReadFileArgs }),
  PlanBase.extend({ action: z.literal("SEARCH"), args: SearchArgs }),
  PlanBase.extend({ action: z.literal("WRITE_FILE"), args: WriteFileArgs }),
  PlanBase.extend({ action: z.literal("PATCH_FILE"), args: PatchFileArgs }),
  PlanBase.extend({ action: z.literal("RUN_CMD"), args: RunCmdArgs }),
  PlanBase.extend({ action: z.literal("ASK_USER"), args: AskUserArgs }),
  PlanBase.extend({ action: z.literal("REPORT"), args: ReportArgs }),
]);

export type Plan = z.infer<typeof PlanSchema>;
export type ActionType = z.infer<typeof Action>;
