// ============================================================================
// Loop Detection System
// ============================================================================
// Detects when the LLM is stuck in repetitive patterns and prevents infinite loops

import type { Plan } from "./plan";

export interface LoopDetectorConfig {
  windowSize: number; // Number of recent actions to track
  similarityThreshold: number; // 0-1, how similar actions must be to count as "same"
  maxRepeats: number; // Max times same action can repeat before flagging
  maxConsecutiveFailures: number; // Max consecutive failed actions
}

export interface LoopState {
  recentActions: ActionFingerprint[];
  consecutiveFailures: number;
  loopDetected: boolean;
  loopType: LoopType | null;
  suggestion: string | null;
}

export type LoopType =
  | "exact_repeat" // Same action with same args
  | "action_cycle" // A->B->A->B pattern
  | "failure_loop" // Keeps trying same failing action
  | "oscillation"; // Alternating between two states

interface ActionFingerprint {
  action: string;
  argsHash: string;
  timestamp: number;
  success: boolean;
}

const DEFAULT_CONFIG: LoopDetectorConfig = {
  windowSize: 20,
  similarityThreshold: 0.9,
  maxRepeats: 4,
  maxConsecutiveFailures: 5,
};

export class LoopDetector {
  private config: LoopDetectorConfig;
  private state: LoopState;

  constructor(config: Partial<LoopDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      recentActions: [],
      consecutiveFailures: 0,
      loopDetected: false,
      loopType: null,
      suggestion: null,
    };
  }

  private hashArgs(args: unknown): string {
    try {
      if (args === null || args === undefined) return "empty";
      if (typeof args !== "object") return String(args);
      const sorted = JSON.stringify(args, Object.keys(args as object).sort());
      // Simple hash for comparison
      let hash = 0;
      for (let i = 0; i < sorted.length; i++) {
        const char = sorted.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    } catch {
      return "unhashable";
    }
  }

  record(plan: Plan, success: boolean): LoopState {
    const fingerprint: ActionFingerprint = {
      action: plan.action,
      argsHash: this.hashArgs(plan.args),
      timestamp: Date.now(),
      success,
    };

    this.state.recentActions.push(fingerprint);

    // Keep window size bounded
    if (this.state.recentActions.length > this.config.windowSize) {
      this.state.recentActions.shift();
    }

    // Update consecutive failures
    if (!success) {
      this.state.consecutiveFailures++;
    } else {
      this.state.consecutiveFailures = 0;
    }

    // Run detection
    this.detect();

    return this.getState();
  }

  private detect(): void {
    this.state.loopDetected = false;
    this.state.loopType = null;
    this.state.suggestion = null;

    const actions = this.state.recentActions;
    if (actions.length < 3) return;

    // Check for exact repeats
    const exactRepeat = this.detectExactRepeat();
    if (exactRepeat) {
      this.state.loopDetected = true;
      this.state.loopType = "exact_repeat";
      this.state.suggestion =
        `Action "${exactRepeat.action}" repeated ${exactRepeat.count} times. ` +
        "Consider a different approach or asking for clarification.";
      return;
    }

    // Check for action cycles (A->B->A->B)
    const cycle = this.detectCycle();
    if (cycle) {
      this.state.loopDetected = true;
      this.state.loopType = "action_cycle";
      this.state.suggestion =
        `Detected cycle: ${cycle.pattern.join(" -> ")}. ` +
        "The agent may be oscillating between strategies.";
      return;
    }

    // Check for failure loops
    if (this.state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      this.state.loopDetected = true;
      this.state.loopType = "failure_loop";
      this.state.suggestion =
        `${this.state.consecutiveFailures} consecutive failures. ` +
        "Consider stopping and reviewing the approach.";
      return;
    }

    // Check for oscillation between two states
    const oscillation = this.detectOscillation();
    if (oscillation) {
      this.state.loopDetected = true;
      this.state.loopType = "oscillation";
      this.state.suggestion =
        `Oscillating between "${oscillation.a}" and "${oscillation.b}". ` +
        "Agent may be stuck in decision conflict.";
      return;
    }
  }

  private detectExactRepeat(): { action: string; count: number } | null {
    const actions = this.state.recentActions;
    const last = actions[actions.length - 1];
    if (!last) return null;

    let count = 0;
    for (let i = actions.length - 1; i >= 0; i--) {
      const a = actions[i];
      if (a && a.action === last.action && a.argsHash === last.argsHash) {
        count++;
      } else {
        break;
      }
    }

    if (count >= this.config.maxRepeats) {
      return { action: last.action, count };
    }
    return null;
  }

  private detectCycle(): { pattern: string[]; length: number } | null {
    const actions = this.state.recentActions;
    if (actions.length < 4) return null;

    for (let patternLen = 2; patternLen <= 4; patternLen++) {
      if (actions.length < patternLen * 2) continue;

      const pattern = actions.slice(-patternLen).map((a) => a.action);
      const prev = actions.slice(-patternLen * 2, -patternLen).map((a) => a.action);

      if (JSON.stringify(pattern) === JSON.stringify(prev)) {
        let repeats = 2;
        for (let i = actions.length - patternLen * 3; i >= 0; i -= patternLen) {
          const segment = actions.slice(i, i + patternLen).map((a) => a.action);
          if (JSON.stringify(segment) === JSON.stringify(pattern)) {
            repeats++;
          } else {
            break;
          }
        }

        if (repeats >= 3) {
          return { pattern, length: patternLen };
        }
      }
    }

    return null;
  }

  private detectOscillation(): { a: string; b: string } | null {
    const actions = this.state.recentActions;
    if (actions.length < 6) return null;

    const last6 = actions.slice(-6);
    if (last6.length < 6) return null;

    const a1 = last6[0]?.action;
    const b1 = last6[1]?.action;
    const a2 = last6[2]?.action;
    const b2 = last6[3]?.action;
    const a3 = last6[4]?.action;
    const b3 = last6[5]?.action;

    if (a1 && b1 && a1 === a2 && a2 === a3 && b1 === b2 && b2 === b3 && a1 !== b1) {
      return { a: a1, b: b1 };
    }

    return null;
  }

  getState(): LoopState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      recentActions: [],
      consecutiveFailures: 0,
      loopDetected: false,
      loopType: null,
      suggestion: null,
    };
  }

  // Get a summary for logging
  getSummary(): string {
    const { recentActions, consecutiveFailures, loopDetected, loopType, suggestion } = this.state;

    const lines: string[] = [
      `Actions tracked: ${recentActions.length}/${this.config.windowSize}`,
      `Consecutive failures: ${consecutiveFailures}`,
    ];

    if (loopDetected) {
      lines.push(`LOOP DETECTED: ${loopType}`);
      if (suggestion) lines.push(`Suggestion: ${suggestion}`);
    }

    return lines.join("\n");
  }
}

// Singleton for easy access
let globalDetector: LoopDetector | null = null;

export function getLoopDetector(config?: Partial<LoopDetectorConfig>): LoopDetector {
  if (!globalDetector) {
    globalDetector = new LoopDetector(config);
  }
  return globalDetector;
}

export function resetLoopDetector(): void {
  globalDetector = null;
}
