// ============================================================================
// TUI Picker — PromptScript v0.5
// Generic interactive list picker for terminal (arrow keys + enter)
// ============================================================================

import { colorize, bold, dim } from "./colors";

export interface PickerItem {
  label: string;
  value: string;
  detail?: string;
}

/**
 * Show an interactive picker. Returns the selected item's value, or null.
 */
export async function showPicker(
  title: string,
  items: PickerItem[],
  icon = "📋"
): Promise<string | null> {
  if (items.length === 0) {
    process.stdout.write(`\n  ${dim("No hay opciones disponibles.")}\n`);
    return null;
  }

  let selected = 0;
  const maxLabel = Math.max(...items.map((i) => i.label.length));

  function buildLines(): string[] {
    const lines: string[] = [
      "",
      `  ${icon}  ${bold(colorize(title, "lightBlue"))}`,
      "",
    ];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isSel = i === selected;
      const cursor = isSel ? colorize("❯", "lightBlue") : " ";
      const label = isSel
        ? bold(item.label.padEnd(maxLabel))
        : colorize(item.label.padEnd(maxLabel), "dimWhite");
      const detail = item.detail ? `   ${dim(item.detail)}` : "";
      lines.push(`  ${cursor} ${label}${detail}`);
    }

    lines.push("");
    lines.push(dim("  ↑/↓ Navegar  •  Enter Seleccionar  •  q Cancelar"));
    return lines;
  }

  // Initial draw
  let currentLines = buildLines();
  process.stdout.write(currentLines.join("\n"));

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

    function redraw(): void {
      process.stdout.write(`\x1b[${currentLines.length - 1}A`);
      const newLines = buildLines();
      for (let i = 0; i < newLines.length; i++) {
        process.stdout.write(`\r\x1b[2K${newLines[i]}`);
        if (i < newLines.length - 1) process.stdout.write("\n");
      }
      currentLines = newLines;
    }

    function onKey(key: string): void {
      if (key === "\x03") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }
      if (key === "q" || key === "\x1b") {
        cleanup();
        process.stdout.write("\n");
        resolve(null);
        return;
      }
      if (key === "\x1b[A" || key === "k") {
        selected = (selected - 1 + items.length) % items.length;
        redraw();
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        selected = (selected + 1) % items.length;
        redraw();
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(items[selected]!.value);
        return;
      }
    }

    stdin.on("data", onKey);
  });
}
