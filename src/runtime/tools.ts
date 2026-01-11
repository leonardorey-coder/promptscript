import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { safeResolve, isSensitivePath } from "./sandbox";

export type ToolContext = {
  projectRoot: string;
  cwd: string;
  policy: {
    allowTools: string[];
    allowCommands: string[];
    requireApproval: boolean;
    maxFileBytes: number;
  };
};

export type ToolResult = any;

export type Tool<Args> = {
  name: string;
  description: string;
  schema: z.ZodType<Args>;
  run: (ctx: ToolContext, args: Args) => Promise<ToolResult>;
};

export class ToolRegistry {
  private map = new Map<string, Tool<any>>();

  register<T>(t: Tool<T>) {
    if (this.map.has(t.name))
      throw new Error(`Tool already registered: ${t.name}`);
    this.map.set(t.name, t);
  }

  get(name: string) {
    const t = this.map.get(name);
    if (!t) throw new Error(`Unknown tool: ${name}`);
    return t;
  }

  has(name: string) {
    return this.map.has(name);
  }
}

// ---------- Tools ----------

export const READ_FILE: Tool<{ path: string; maxBytes?: number }> = {
  name: "READ_FILE",
  description: "Read a text file from workspace.",
  schema: z.object({
    path: z.string().min(1),
    maxBytes: z.number().int().positive().max(500_000).optional(),
  }),
  async run(ctx, args) {
    const p = safeResolve(ctx.projectRoot, args.path);
    try {
      const buf = await fs.readFile(p);
      const max = args.maxBytes ?? ctx.policy.maxFileBytes;
      if (buf.byteLength > max)
        throw new Error(`File too large: ${buf.byteLength} > ${max}`);
      return buf.toString("utf8");
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(
          `File not found: ${args.path}\n` +
            `Suggestion: Use SEARCH to verify the file exists, or use WRITE_FILE to create it.`
        );
      }
      if (err.code === "EISDIR") {
        throw new Error(
          `Path is a directory, not a file: ${args.path}\n` +
            `Suggestion: Use SEARCH to list files in this directory.`
        );
      }
      if (err.code === "EACCES") {
        throw new Error(`Permission denied: ${args.path}`);
      }
      throw err;
    }
  },
};

export const WRITE_FILE: Tool<{
  path: string;
  content: string;
  mode?: "overwrite" | "create_only";
}> = {
  name: "WRITE_FILE",
  description: "Write a file in workspace.",
  schema: z.object({
    path: z.string().min(1),
    content: z.string(),
    mode: z.enum(["overwrite", "create_only"]).optional(),
  }),
  async run(ctx, args) {
    const p = safeResolve(ctx.projectRoot, args.path);

    try {
      if (args.mode === "create_only") {
        try {
          await fs.access(p);
          throw new Error(
            `File already exists: ${args.path}\n` +
              `Suggestion: Use mode "overwrite" to replace it, or use READ_FILE to check its contents first.`
          );
        } catch (err: any) {
          if (err.code !== "ENOENT") throw err;
        }
      }

      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, args.content, "utf8");
      return `WROTE ${args.path} (${args.content.length} chars)`;
    } catch (err: any) {
      if (err.code === "EISDIR") {
        throw new Error(
          `Cannot write: path is a directory: ${args.path}\n` +
            `Suggestion: Specify a file path, not a directory.`
        );
      }
      if (err.code === "EACCES") {
        throw new Error(`Cannot write: permission denied: ${args.path}`);
      }
      if (err.code === "ENOSPC") {
        throw new Error(`Cannot write: no space left on device: ${args.path}`);
      }
      throw err;
    }
  },
};

// Minimal unified-diff patch applier (simple): supports replacing whole file via patch markers
export const PATCH_FILE: Tool<{ path: string; patch: string }> = {
  name: "PATCH_FILE",
  description: "Apply a unified diff patch to a file (simple implementation).",
  schema: z.object({ path: z.string().min(1), patch: z.string().min(1) }),
  async run(ctx, args) {
    const p = safeResolve(ctx.projectRoot, args.path);
    try {
      const before = await fs.readFile(p, "utf8");
      if (args.patch.startsWith("REPLACE:\n")) {
        const content = args.patch.slice("REPLACE:\n".length);
        await fs.writeFile(p, content, "utf8");
        return `PATCHED ${args.path} (replaced)`;
      }
      throw new Error(
        "PATCH_FILE: unsupported patch format. Use 'REPLACE:\\n<content>' in v0."
      );
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(
          `Cannot patch: file not found: ${args.path}\n` +
            `Suggestion: Use WRITE_FILE to create the file first, or verify the path with SEARCH.`
        );
      }
      if (err.code === "EISDIR") {
        throw new Error(`Cannot patch: path is a directory: ${args.path}`);
      }
      if (err.code === "EACCES") {
        throw new Error(`Cannot patch: permission denied: ${args.path}`);
      }
      throw err;
    }
  },
};

export const RUN_CMD: Tool<{
  cmd: string;
  args?: string[];
  timeoutMs?: number;
}> = {
  name: "RUN_CMD",
  description: "Run an allowlisted command inside workspace.",
  schema: z.object({
    cmd: z.string().min(1),
    args: z.array(z.string()).optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional(),
  }),
  async run(ctx, args) {
    if (!ctx.policy.allowCommands.includes(args.cmd)) {
      const allowed = ctx.policy.allowCommands.join(", ");
      throw new Error(
        `Command not allowed: ${args.cmd}\n` +
          `Allowed commands: ${allowed || "none"}\n` +
          `Suggestion: Check the policy configuration or use an allowed command.`
      );
    }

    try {
      const proc = Bun.spawn([args.cmd, ...(args.args ?? [])], {
        cwd: ctx.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });

      const timeoutMs = args.timeoutMs ?? 60_000;
      const timer = setTimeout(() => proc.kill(), timeoutMs);

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      clearTimeout(timer);

      const code = await proc.exited;
      return `exit=${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(
          `Command not found: ${args.cmd}\n` +
            `Suggestion: Verify the command is installed and available in PATH.`
        );
      }
      if (err.code === "EACCES") {
        throw new Error(`Permission denied to execute: ${args.cmd}`);
      }
      throw err;
    }
  },
};

export const RECALL: Tool<{
  memory_name: string;
  query: string;
  top_k?: number;
}> = {
  name: "RECALL",
  description: "Recall relevant information from long-term memory.",
  schema: z.object({
    memory_name: z.string().min(1),
    query: z.string().min(1),
    top_k: z.number().int().positive().max(20).optional(),
  }),
  async run(ctx, args) {
    return {
      memory_name: args.memory_name,
      query: args.query,
      top_k: args.top_k ?? 5,
      _note: "RECALL tool invoked - VM will handle memory retrieval",
    };
  },
};

export const SEARCH: Tool<{
  query?: string;
  globs?: string[];
  maxResults?: number;
}> = {
  name: "SEARCH",
  description:
    "Search for a substring in workspace files, or list files matching globs if query is empty.",
  schema: z.object({
    query: z.string().optional().default(""),
    globs: z.array(z.string()).optional(),
    maxResults: z.number().int().positive().max(5000).optional(),
  }),
  async run(ctx, args) {
    const maxResults = args.maxResults ?? 200;
    const query = args.query ?? "";
    const globs = args.globs ?? [];
    const results: { path: string; line?: number; text?: string }[] = [];

    // Simple glob matching (supports * and **)
    function matchGlob(filePath: string, pattern: string): boolean {
      const regex = pattern
        .replace(/\*\*/g, "<<<GLOBSTAR>>>")
        .replace(/\*/g, "[^/]*")
        .replace(/<<<GLOBSTAR>>>/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${regex}$`).test(filePath);
    }

    function matchesAnyGlob(filePath: string): boolean {
      if (globs.length === 0) return true;
      return globs.some((g) => matchGlob(filePath, g));
    }

    async function walk(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const rel = path.relative(ctx.projectRoot, path.join(dir, e.name));
          if (isSensitivePath(rel)) continue;

          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            await walk(full);
          } else if (e.isFile()) {
            if (!matchesAnyGlob(rel)) continue;

            if (!query) {
              results.push({ path: rel });
              if (results.length >= maxResults) return;
              continue;
            }

            const stat = await fs.stat(full);
            if (stat.size > 500_000) continue;

            const content = await fs.readFile(full, "utf8").catch(() => null);
            if (!content) continue;
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line && line.includes(query)) {
                results.push({
                  path: rel,
                  line: i + 1,
                  text: line.slice(0, 300),
                });
                if (results.length >= maxResults) return;
              }
            }
          }
          if (results.length >= maxResults) return;
        }
      } catch (err: any) {
        if (err.code === "ENOENT") {
          return;
        }
        if (err.code === "EACCES") {
          return;
        }
        throw err;
      }
    }

    try {
      await walk(ctx.projectRoot);

      if (results.length === 0 && globs.length > 0) {
        return {
          results: [],
          message:
            `No files found matching globs: ${globs.join(", ")}\n` +
            `Suggestion: Verify the glob patterns or try a broader search.`,
        };
      }

      return results;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new Error(
          `Project root not found: ${ctx.projectRoot}\n` +
            `Suggestion: Verify the project path configuration.`
        );
      }
      throw err;
    }
  },
};

export function createDefaultRegistry() {
  const r = new ToolRegistry();
  r.register(READ_FILE);
  r.register(WRITE_FILE);
  r.register(PATCH_FILE);
  r.register(SEARCH);
  r.register(RECALL);
  r.register(RUN_CMD);
  return r;
}
