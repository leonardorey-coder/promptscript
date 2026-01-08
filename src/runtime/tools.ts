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
    if (this.map.has(t.name)) throw new Error(`Tool already registered: ${t.name}`);
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
    const buf = await fs.readFile(p);
    const max = args.maxBytes ?? ctx.policy.maxFileBytes;
    if (buf.byteLength > max) throw new Error(`File too large: ${buf.byteLength} > ${max}`);
    return buf.toString("utf8");
  },
};

export const WRITE_FILE: Tool<{ path: string; content: string; mode?: "overwrite" | "create_only" }> = {
  name: "WRITE_FILE",
  description: "Write a file in workspace.",
  schema: z.object({
    path: z.string().min(1),
    content: z.string(),
    mode: z.enum(["overwrite", "create_only"]).optional(),
  }),
  async run(ctx, args) {
    const p = safeResolve(ctx.projectRoot, args.path);
    if (args.mode === "create_only") {
      try {
        await fs.access(p);
        throw new Error(`File exists: ${args.path}`);
      } catch {}
    }
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, args.content, "utf8");
    return `WROTE ${args.path} (${args.content.length} chars)`;
  },
};

// Minimal unified-diff patch applier (simple): supports replacing whole file via patch markers
export const PATCH_FILE: Tool<{ path: string; patch: string }> = {
  name: "PATCH_FILE",
  description: "Apply a unified diff patch to a file (simple implementation).",
  schema: z.object({ path: z.string().min(1), patch: z.string().min(1) }),
  async run(ctx, args) {
    const p = safeResolve(ctx.projectRoot, args.path);
    const before = await fs.readFile(p, "utf8");
    // Simple strategy: require patch to contain a full replacement block marker
    // v0 implementation: if patch starts with 'REPLACE:' then replace file.
    if (args.patch.startsWith("REPLACE:\n")) {
      const content = args.patch.slice("REPLACE:\n".length);
      await fs.writeFile(p, content, "utf8");
      return `PATCHED ${args.path} (replaced)`;
    }
    // fallback: refuse (so you don't silently corrupt)
    throw new Error("PATCH_FILE: unsupported patch format. Use 'REPLACE:\\n<content>' in v0.");
  },
};

export const RUN_CMD: Tool<{ cmd: string; args?: string[]; timeoutMs?: number }> = {
  name: "RUN_CMD",
  description: "Run an allowlisted command inside workspace.",
  schema: z.object({
    cmd: z.string().min(1),
    args: z.array(z.string()).optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional(),
  }),
  async run(ctx, args) {
    if (!ctx.policy.allowCommands.includes(args.cmd)) {
      throw new Error(`Command not allowed: ${args.cmd}`);
    }

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
  },
};

export const SEARCH: Tool<{ query?: string; globs?: string[]; maxResults?: number }> = {
  name: "SEARCH",
  description: "Search for a substring in workspace files, or list files matching globs if query is empty.",
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
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const rel = path.relative(ctx.projectRoot, path.join(dir, e.name));
        if (isSensitivePath(rel)) continue;

        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.isFile()) {
          // Check glob filter first
          if (!matchesAnyGlob(rel)) continue;

          // If no query, just list matching files
          if (!query) {
            results.push({ path: rel });
            if (results.length >= maxResults) return;
            continue;
          }

          // skip big/binary-ish quickly
          const stat = await fs.stat(full);
          if (stat.size > 500_000) continue;

          const content = await fs.readFile(full, "utf8").catch(() => null);
          if (!content) continue;
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line && line.includes(query)) {
              results.push({ path: rel, line: i + 1, text: line.slice(0, 300) });
              if (results.length >= maxResults) return;
            }
          }
        }
        if (results.length >= maxResults) return;
      }
    }

    await walk(ctx.projectRoot);
    return results;
  },
};

export function createDefaultRegistry() {
  const r = new ToolRegistry();
  r.register(READ_FILE);
  r.register(WRITE_FILE);
  r.register(PATCH_FILE);
  r.register(SEARCH);
  r.register(RUN_CMD);
  return r;
}
