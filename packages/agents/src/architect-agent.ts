import type { ContextPack, ImplementationPlan } from "@horcruxsys/nagini/domain";

import type { PlanningAgent } from "./index.js";

export interface ArchitectureMap {
  apps: string[];
  packages: string[];
  workflow: string[];
}

export interface ArchitectOutput {
  architecture: ArchitectureMap;
  plan: ImplementationPlan;
}

export class ArchitectAgent {
  constructor(private readonly planner: PlanningAgent) {}

  async design(contextPack: ContextPack): Promise<ArchitectOutput> {
    const plan = await this.planner.createPlan(contextPack);

    return {
      architecture: {
        apps: ["apps/web", "apps/orchestrator"],
        packages: [
          "packages/agents",
          "packages/execution",
          "packages/persistence",
          "packages/workflows",
          "packages/telemetry",
        ],
        workflow: [
          "Gather context",
          "Create implementation plan",
          "Run validation loop",
          "Await human approval if required",
          "Deploy when validation is green",
        ],
      },
      plan,
    };
  }
}
