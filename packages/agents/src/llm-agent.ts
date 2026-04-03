import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import type {
  ContextPack,
  ImplementationPlan,
} from "@horcruxsys/nagini/domain";
import { ImplementationPlanSchema } from "@horcruxsys/nagini/domain";
import type { PlanningAgent } from "./index.js";

export class LLMPlanningAgent implements PlanningAgent {
  private openai: ReturnType<typeof createOpenAI>;

  constructor(apiKey?: string) {
    this.openai = createOpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  async createPlan(contextPack: ContextPack): Promise<ImplementationPlan> {
    const prompt = `
You are an expert software engineer and architect. Your task is to analyze an issue and a set of context citations, and output a detailed implementation plan.

# Issue Key: ${contextPack.issueKey}
# Summary: ${contextPack.summary}

## Requirements
${contextPack.requirements.map((r) => `- ${r}`).join("\n")}

## Citations
${contextPack.citations
  .map(
    (c) => `
### Source: ${c.source} (${c.title})
${c.snippet}
`,
  )
  .join("\n")}

## Impacted Areas
${contextPack.impactedAreas.map((area) => `- ${area}`).join("\n")}

Format your response as a valid ImplementationPlan JSON object.
Make sure branchName follows a standard pattern like: "feat/{issueKey}-short-desc".
    `.trim();

    const result = await generateObject({
      model: this.openai("gpt-4o"),
      schema: ImplementationPlanSchema,
      prompt,
    });

    return result.object;
  }
}
