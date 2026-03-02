// ============================================================================
// TUI Panels — PromptScript v0.5
// Unicode box drawing utilities for terminal output
// ============================================================================

import { colorize, dim, bold, type ColorName } from "./colors";

// Unicode box chars (rounded corners)
const chars = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  doubleTL: "╔",
  doubleTR: "╗",
  doubleBL: "╚",
  doubleBR: "╝",
  doubleH: "═",
  doubleV: "║",
} as const;

export interface BoxOptions {
  width?: number;
  padding?: number;
  color?: ColorName;
  style?: "rounded" | "double";
}

/**
 * Draw a box around content with optional title.
 */
export function box(
  content: string | string[],
  options: BoxOptions = {}
): string {
  const {
    width = 50,
    padding = 1,
    color = "dimWhite",
    style = "rounded",
  } = options;

  const lines = Array.isArray(content) ? content : content.split("\n");
  const innerWidth = width - 2; // subtract border chars
  const pad = " ".repeat(padding);

  const tl = style === "double" ? chars.doubleTL : chars.topLeft;
  const tr = style === "double" ? chars.doubleTR : chars.topRight;
  const bl = style === "double" ? chars.doubleBL : chars.bottomLeft;
  const br = style === "double" ? chars.doubleBR : chars.bottomRight;
  const h = style === "double" ? chars.doubleH : chars.horizontal;
  const v = style === "double" ? chars.doubleV : chars.vertical;

  const top = colorize(`${tl}${h.repeat(innerWidth)}${tr}`, color);
  const bottom = colorize(`${bl}${h.repeat(innerWidth)}${br}`, color);

  const body = lines.map((line) => {
    const stripped = stripAnsi(line);
    const available = innerWidth - padding * 2;
    const spaces = Math.max(0, available - stripped.length);
    return `${colorize(v, color)}${pad}${line}${" ".repeat(spaces)}${pad}${colorize(v, color)}`;
  });

  return [top, ...body, bottom].join("\n");
}

/**
 * Draw a horizontal divider line.
 */
export function divider(width: number = 50, char: string = "─"): string {
  return dim(char.repeat(width));
}

/**
 * Draw a header with double-line borders.
 */
export function header(
  title: string,
  subtitle?: string,
  width: number = 50
): string {
  const lines = [bold(title)];
  if (subtitle) lines.push(dim(subtitle));
  return box(lines, { width, style: "double", color: "blue" });
}

/**
 * Draw a section title with a subtle underline.
 */
export function sectionTitle(title: string, icon?: string): string {
  const prefix = icon ? `${icon}  ` : "";
  return `\n  ${colorize(`${prefix}${title}`, "lightBlue")}\n  ${dim("─".repeat(title.length + (icon ? 3 : 0)))}`;
}

/**
 * Format a key-value pair for display.
 */
export function keyValue(
  key: string,
  value: string,
  keyColor: ColorName = "dimWhite",
  valueColor: ColorName = "white"
): string {
  return `  ${colorize(key, keyColor)}  ${colorize(value, valueColor)}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip ANSI escape codes from a string (for length calculation).
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
