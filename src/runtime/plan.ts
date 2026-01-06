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

const PlanCore = z.discriminatedUnion("action", [
  z.object({ action: z.literal("READ_FILE"), args: ReadFileArgs }),
  z.object({ action: z.literal("SEARCH"), args: SearchArgs }),
  z.object({ action: z.literal("WRITE_FILE"), args: WriteFileArgs }),
  z.object({ action: z.literal("PATCH_FILE"), args: PatchFileArgs }),
  z.object({ action: z.literal("RUN_CMD"), args: RunCmdArgs }),
  z.object({ action: z.literal("ASK_USER"), args: AskUserArgs }),
  z.object({ action: z.literal("REPORT"), args: ReportArgs }),
]);

export const PlanSchema = PlanCore.extend({
  done: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

export type Plan = z.infer<typeof PlanSchema>;
export type Action = z.infer<typeof Action>;
