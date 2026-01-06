import path from "node:path";

export function safeResolve(projectRoot: string, userPath: string) {
  const resolved = path.resolve(projectRoot, userPath);
  const root = path.resolve(projectRoot) + path.sep;
  if (!resolved.startsWith(root)) throw new Error(`Path escape blocked: ${userPath}`);
  return resolved;
}

export function isSensitivePath(rel: string) {
  return rel.startsWith(".git") || rel.startsWith("node_modules");
}
