import type { PlanSpec, PlanStep } from "../runtime/planspec";

interface MarkdownPlan {
  goal: string;
  constraints: string[];
  steps: string[];
  raw: string;
}

export function parseMarkdownPlan(markdown: string): MarkdownPlan {
  const lines = markdown.split("\n");
  let goal = "";
  const constraints: string[] = [];
  const steps: string[] = [];
  let section: "none" | "goal" | "constraints" | "steps" = "none";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# Goal")) {
      section = "goal";
      continue;
    }
    if (trimmed.startsWith("# Constraints")) {
      section = "constraints";
      continue;
    }
    if (trimmed.startsWith("# Steps")) {
      section = "steps";
      continue;
    }

    if (trimmed.startsWith("#")) {
      section = "none";
      continue;
    }

    if (!trimmed) continue;

    if (section === "goal") {
      goal += (goal ? " " : "") + trimmed;
    } else if (section === "constraints") {
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        constraints.push(trimmed.replace(/^[-*]\s*/, ""));
      }
    } else if (section === "steps") {
      if (/^\d+\./.test(trimmed)) {
        steps.push(trimmed.replace(/^\d+\.\s*/, ""));
      }
    }
  }

  return { goal, constraints, steps, raw: markdown };
}

export function markdownToPlanSpec(markdown: string, options?: { title?: string }): PlanSpec {
  const parsed = parseMarkdownPlan(markdown);

  if (!parsed.goal) {
    throw new Error("Markdown plan must have a # Goal section");
  }
  if (parsed.steps.length === 0) {
    throw new Error("Markdown plan must have at least one step in # Steps section");
  }

  const allowWriteGlobs: string[] = [];
  const denyWriteGlobs: string[] = [];
  const allowCommands: string[] = [];

  for (const constraint of parsed.constraints) {
    const lower = constraint.toLowerCase();
    if (lower.includes("escribir solo en") || lower.includes("write only in")) {
      const match = constraint.match(/(?:en|in)\s+([^\s,]+)/);
      if (match && match[1]) {
        allowWriteGlobs.push(match[1]);
      }
    }
    if (lower.includes("no tocar") || lower.includes("don't touch") || lower.includes("do not touch")) {
      const match = constraint.match(/(?:tocar|touch)\s+([^\s,]+)/);
      if (match && match[1]) {
        denyWriteGlobs.push(match[1]);
      }
    }
    if (lower.includes("ejecutar comandos") || lower.includes("execute commands") || lower.includes("run commands")) {
      const matches = constraint.match(/(?:comandos|commands)[:\s]+([^.]+)/);
      if (matches && matches[1]) {
        const cmds = matches[1].split(/[,\s]+/).filter(Boolean);
        allowCommands.push(...cmds);
      }
    }
  }

  const steps: PlanStep[] = parsed.steps.map((stepText, idx): PlanStep => {
    const id = `s${idx + 1}`;
    const lower = stepText.toLowerCase();

    if (lower.includes("crear") && (lower.includes(".html") || lower.includes(".css") || lower.includes(".js"))) {
      return {
        id,
        kind: "run_agent",
        title: stepText.slice(0, 50),
        prompt: stepText,
      } as PlanStep;
    }

    if (lower.includes("ejecutar") || lower.includes("run") || lower.includes("correr")) {
      const cmdMatch = stepText.match(/`([^`]+)`/);
      if (cmdMatch && cmdMatch[1]) {
        const fullCmd = cmdMatch[1];
        const parts = fullCmd.split(/\s+/).filter(Boolean);
        if (parts.length > 0) {
          return {
            id,
            kind: "run_cmd",
            title: stepText.slice(0, 50),
            cmd: parts[0],
            args: parts.slice(1),
          } as PlanStep;
        }
      }
    }

    if (lower.includes("reportar") || lower.includes("report")) {
      return {
        id,
        kind: "report",
        title: stepText.slice(0, 50),
        message: stepText,
        done: true,
      } as PlanStep;
    }

    if (lower.includes("resumir") || lower.includes("summarize")) {
      return {
        id,
        kind: "summarize",
        title: stepText.slice(0, 50),
        instruction: stepText,
      } as PlanStep;
    }

    return {
      id,
      kind: "run_agent",
      title: stepText.slice(0, 50),
      prompt: stepText,
    } as PlanStep;
  });

  const planSpec: PlanSpec = {
    version: 1,
    goal: parsed.goal,
    title: options?.title || parsed.goal.slice(0, 60),
    source: "human",
    steps,
  };

  if (allowWriteGlobs.length > 0 || denyWriteGlobs.length > 0 || allowCommands.length > 0) {
    planSpec.policy = {
      allowActions: ["READ_FILE", "SEARCH", "WRITE_FILE", "PATCH_FILE", "RUN_CMD", "REPORT"],
      allowWriteGlobs: allowWriteGlobs.length > 0 ? allowWriteGlobs : undefined,
      denyWriteGlobs: denyWriteGlobs.length > 0 ? denyWriteGlobs : undefined,
      allowCommands: allowCommands.length > 0 ? allowCommands : undefined,
    };
  }

  return planSpec;
}
