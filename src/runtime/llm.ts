import { PlanSchema, type Plan } from "./plan";

// v0: mock planner (para probar loop sin API)
export async function llmCall(input: any): Promise<Plan> {
  // Si el usuario pasa un "mock_plan" lo respetamos
  if (input?.mock_plan) return PlanSchema.parse(input.mock_plan);

  // Default: pedir al usuario qué hacer (seguro)
  return PlanSchema.parse({
    action: "ASK_USER",
    args: {
      question: "Mock LLM: define next action (set input.mock_plan to bypass)",
      choices: ["SEARCH", "READ_FILE", "WRITE_FILE", "PATCH_FILE", "RUN_CMD", "REPORT"],
    },
    done: false,
    confidence: 0.2,
    reason: "Mock adapter",
  });
}
