// ============================================================================
// TUI Color System — PromptScript v0.5
// ANSI truecolor helpers aligned with the landing page palette
// ============================================================================

// Landing page palette
export const palette = {
  blue: [59, 130, 246] as const, // #3b82f6
  lightBlue: [96, 165, 250] as const, // #60a5fa
  purple: [139, 92, 246] as const, // #8b5cf6
  lightPurple: [192, 132, 252] as const, // #c084fc
  green: [134, 239, 172] as const, // #86efac
  red: [248, 113, 113] as const, // #f87171
  yellow: [253, 251, 168] as const, // #fdfba8
  white: [255, 255, 255] as const,
  dimWhite: [140, 140, 160] as const,
} as const;

type RGB = readonly [number, number, number];

// ── ANSI escape helpers ────────────────────────────────────────────────────

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

function rgb(r: number, g: number, b: number): string {
  return `${ESC}38;2;${r};${g};${b}m`;
}

// ── Public colorize API ────────────────────────────────────────────────────

export type ColorName = keyof typeof palette;

export function colorize(text: string, color: ColorName): string {
  const [r, g, b] = palette[color];
  return `${rgb(r, g, b)}${text}${RESET}`;
}

export function bold(text: string): string {
  return `${ESC}1m${text}${RESET}`;
}

export function dim(text: string): string {
  return `${ESC}2m${text}${RESET}`;
}

export function italic(text: string): string {
  return `${ESC}3m${text}${RESET}`;
}

export function underline(text: string): string {
  return `${ESC}4m${text}${RESET}`;
}

// ── Gradient helpers ───────────────────────────────────────────────────────

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Apply a horizontal gradient to a multi-line string.
 * Each character gets a color interpolated between fromHex and toHex
 * based on its position in the line.
 */
export function applyGradient(
  text: string,
  fromHex: string,
  toHex: string
): string {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const lines = text.split("\n");

  // Find the max line length for consistent gradient across all lines
  const maxLen = Math.max(...lines.map((l) => l.length), 1);

  return lines
    .map((line) => {
      if (line.length === 0) return "";
      return (
        line
          .split("")
          .map((char, i) => {
            if (char === " ") return char;
            const t = maxLen > 1 ? i / (maxLen - 1) : 0;
            const [r, g, b] = lerpColor(from, to, t);
            return `${rgb(r, g, b)}${char}`;
          })
          .join("") + RESET
      );
    })
    .join("\n");
}

/**
 * Apply a vertical gradient (each line gets a different color).
 */
export function applyVerticalGradient(
  text: string,
  fromHex: string,
  toHex: string
): string {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const lines = text.split("\n");
  const total = Math.max(lines.length - 1, 1);

  return lines
    .map((line, i) => {
      if (line.length === 0) return "";
      const t = total > 0 ? i / total : 0;
      const [r, g, b] = lerpColor(from, to, t);
      return `${rgb(r, g, b)}${line}${RESET}`;
    })
    .join("\n");
}

// ── Symbols ────────────────────────────────────────────────────────────────

export const symbols = {
  check: colorize("✓", "green"),
  cross: colorize("✗", "red"),
  arrow: colorize("❯", "lightBlue"),
  dot: colorize("•", "dimWhite"),
  info: colorize("ℹ", "blue"),
  warn: colorize("⚠", "yellow"),
  bar: {
    filled: "█",
    empty: "░",
  },
} as const;
