// ============================================================================
// TUI Interactive Menu — PromptScript v0.5
// Arrow-key navigable main menu launched with `psc --tui`
// ============================================================================

import { colorize, bold, dim } from "./colors";

export interface MenuItem {
  icon: string;
  label: string;
  description: string;
  id: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    icon: "🚀",
    label: "Run workflow",
    description: "Ejecutar un archivo .ps",
    id: "run",
  },
  {
    icon: "📋",
    label: "List workflows",
    description: "Ver workflows disponibles",
    id: "list",
  },
  {
    icon: "🔄",
    label: "Replay run",
    description: "Reproducir una ejecución pasada",
    id: "replay",
  },
  {
    icon: "🔨",
    label: "Compile MD → PS",
    description: "Compilar Markdown a PromptScript",
    id: "compile",
  },
  {
    icon: "❓",
    label: "Help",
    description: "Mostrar ayuda completa",
    id: "help",
  },
  { icon: "⏻ ", label: "Exit", description: "Salir", id: "exit" },
];

const MAX_LABEL = Math.max(...MENU_ITEMS.map((i) => i.label.length));

/** Return the menu as an array of plain strings (one per line), no newlines. */
function buildLines(selectedIndex: number): string[] {
  const lines: string[] = [""];

  for (let i = 0; i < MENU_ITEMS.length; i++) {
    const item = MENU_ITEMS[i]!;
    const isSel = i === selectedIndex;

    const cursor = isSel ? colorize("❯", "lightBlue") : " ";
    const label = isSel
      ? bold(colorize(item.label.padEnd(MAX_LABEL), "white"))
      : colorize(item.label.padEnd(MAX_LABEL), "dimWhite");
    const desc = dim(item.description);

    lines.push(`  ${cursor} ${item.icon}  ${label}   ${desc}`);
  }

  lines.push("");
  lines.push(dim("  ↑/↓ Navegar  •  Enter Seleccionar  •  q Salir"));

  return lines;
}

/** Write lines to stdout for the first time. */
function printMenu(lines: string[]): void {
  process.stdout.write(lines.join("\n"));
}

/**
 * Move cursor up `n` lines, then overwrite each line cleanly.
 * \x1b[nA = move cursor up n rows
 * \x1b[2K = erase entire current line
 * \r      = move to column 0
 */
function redrawMenu(oldLineCount: number, lines: string[]): void {
  // Move cursor up to first line of the menu
  process.stdout.write(`\x1b[${oldLineCount - 1}A`);

  // Overwrite every line: move to col 0, erase, write new content
  for (let i = 0; i < lines.length; i++) {
    process.stdout.write(`\r\x1b[2K${lines[i]}`);
    if (i < lines.length - 1) process.stdout.write("\n");
  }
}

/**
 * Show the interactive main menu.
 * Returns the selected menu item id, or null if user exits.
 */
export async function showMainMenu(): Promise<string | null> {
  let selectedIndex = 0;

  // Initial draw
  let currentLines = buildLines(selectedIndex);
  printMenu(currentLines);

  return new Promise<string | null>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function cleanup(): void {
      if (stdin.isRaw) stdin.setRawMode(wasRaw ?? false);
      stdin.removeListener("data", onKey);
      stdin.pause();
    }

    function update(newIndex: number): void {
      selectedIndex = newIndex;
      const newLines = buildLines(selectedIndex);
      redrawMenu(currentLines.length, newLines);
      currentLines = newLines;
    }

    function onKey(key: string): void {
      // Ctrl+C
      if (key === "\x03") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }

      // q or bare Escape
      if (key === "q" || key === "\x1b") {
        cleanup();
        process.stdout.write("\n");
        resolve(null);
        return;
      }

      // Arrow Up / k
      if (key === "\x1b[A" || key === "k") {
        update((selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
        return;
      }

      // Arrow Down / j
      if (key === "\x1b[B" || key === "j") {
        update((selectedIndex + 1) % MENU_ITEMS.length);
        return;
      }

      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(MENU_ITEMS[selectedIndex]!.id);
        return;
      }
    }

    stdin.on("data", onKey);
  });
}
