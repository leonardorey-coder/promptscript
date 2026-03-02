// ============================================================================
// TUI Workflow Explorer — PromptScript v0.5
// Scan and display available .ps workflow files
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { colorize, dim, bold } from "./colors";
import { sectionTitle, divider } from "./panels";

export interface WorkflowEntry {
  path: string; // Relative to project root
  absolutePath: string;
  size: number; // Bytes
  directory: string; // Grouping directory
}

/**
 * Recursively scan for .ps files in a project.
 */
export async function listWorkflows(
  projectRoot: string
): Promise<WorkflowEntry[]> {
  const entries: WorkflowEntry[] = [];

  async function scanDir(dir: string): Promise<void> {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        // Skip hidden dirs and node_modules
        if (
          item.name.startsWith(".") ||
          item.name === "node_modules" ||
          item.name === "promptscript-vscode"
        ) {
          continue;
        }

        if (item.isDirectory()) {
          await scanDir(fullPath);
        } else if (item.isFile() && item.name.endsWith(".ps")) {
          const stat = await fs.stat(fullPath);
          const relativePath = path.relative(projectRoot, fullPath);
          const relativeDir = path.relative(projectRoot, dir) || ".";

          entries.push({
            path: relativePath,
            absolutePath: fullPath,
            size: stat.size,
            directory: relativeDir,
          });
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await scanDir(projectRoot);

  // Sort by directory then filename
  entries.sort((a, b) => {
    if (a.directory !== b.directory)
      return a.directory.localeCompare(b.directory);
    return a.path.localeCompare(b.path);
  });

  return entries;
}

/**
 * Format file size for display.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/**
 * Print workflow list to stdout grouped by directory.
 */
export function printWorkflowList(
  workflows: WorkflowEntry[],
  projectRoot: string
): void {
  console.log(sectionTitle("Workflows disponibles", "📋"));
  console.log(
    `\n  ${dim("Directorio:")} ${colorize(projectRoot, "dimWhite")}\n`
  );

  if (workflows.length === 0) {
    console.log(`  ${dim("No se encontraron archivos .ps")}\n`);
    return;
  }

  let currentDir = "";

  for (const wf of workflows) {
    // Print directory header when it changes
    if (wf.directory !== currentDir) {
      currentDir = wf.directory;
      console.log(`  ${colorize(currentDir + "/", "purple")}`);
    }

    const filename = path.basename(wf.path);
    const size = formatSize(wf.size);
    const padding = " ".repeat(Math.max(1, 32 - filename.length));

    console.log(`    ${colorize(filename, "lightBlue")}${padding}${dim(size)}`);
  }

  console.log(
    `\n  ${dim("Total:")} ${colorize(String(workflows.length), "white")} ${dim("workflows encontrados")}\n`
  );
}
