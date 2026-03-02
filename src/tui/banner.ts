// ============================================================================
// TUI Banner — PromptScript v0.5
// ASCII art banner using cli-ascii-logo with custom gradient
// ============================================================================

import logo from "cli-ascii-logo";
import { applyGradient, dim } from "./colors";

/**
 * Print the PromptScript ASCII art banner with a blue gradient
 * matching the landing page palette (#3b82f6 → #60a5fa).
 * Falls back to the 'ocean' preset palette if custom gradient fails.
 */
export function printBanner(version: string): void {
  try {
    // Get raw ASCII text without gradient applied
    const rawText = logo
      .setText("PromptScript")
      .addFontStyle("ANSI Shadow")
      .getText();

    // Apply custom gradient with dramatic blue range
    const bannerText = applyGradient(rawText, "#1d4ed8", "#93c5fd");
    console.log(bannerText);
  } catch {
    // Fallback: use built-in 'ocean' palette (deep blue → purple)
    try {
      const fallback = logo
        .setText("PromptScript")
        .addFontStyle("ANSI Shadow")
        .build("ocean");
      console.log(fallback);
    } catch {
      // Last resort: plain text
      console.log("\n  PromptScript\n");
    }
  }

  console.log(dim(`  v${version}  •  AI Workflow Language`));
  console.log();
}
