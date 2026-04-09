import type {
  ContextPack,
  ImplementationPlanTask,
  ImplementationPlan,
  ValidationReport,
} from "@horcruxsys/nagini/domain";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface PlanningAgent {
  createPlan(contextPack: ContextPack): Promise<ImplementationPlan>;
}

export { LLMPlanningAgent } from "./llm-agent.js";
export {
  ArchitectAgent,
  type ArchitectOutput,
  type ArchitectureMap,
} from "./architect-agent.js";
export {
  CoderAgent,
  type CoderTaskInput,
  type CoderTaskResult,
} from "./coder-agent.js";
export {
  QAFixerAgent,
  type SelfCorrectionResult,
  type ValidationRunner,
} from "./qa-fixer-agent.js";
export {
  DevOpsAgent,
  type DeploymentInput,
  type DeploymentResult,
} from "./devops-agent.js";

export class DeterministicPlanningAgent implements PlanningAgent {
  async createPlan(contextPack: ContextPack): Promise<ImplementationPlan> {
    const branchName = `feat/${contextPack.issueKey}-${toSlug(contextPack.summary).slice(0, 40)}`;

    return {
      summary: `Deliver ${contextPack.issueKey} with a grounded plan, safe execution loop, and validation evidence.`,
      branchName,
      approvalRequired: false,
      tasks: [
        {
          id: `${contextPack.issueKey}-analysis`,
          title: "Gather context and impacted areas",
          reason:
            "The ticket must be grounded in Jira, Confluence, and repo evidence before execution.",
          targetPaths: [
            "packages/knowledge/src/index.ts",
            "packages/connectors/src/index.ts",
          ],
          testStrategy: [
            "Validate context pack shape",
            "Confirm citations are present",
          ],
        },
        {
          id: `${contextPack.issueKey}-orchestration`,
          title: "Build workflow and API surface",
          reason:
            "The orchestrator needs a typed runtime and command endpoint to drive implementation.",
          targetPaths: [
            "packages/workflows/src/index.ts",
            "apps/orchestrator/src/server.ts",
          ],
          testStrategy: [
            "POST run request returns a structured run record",
            "SSE timeline can be emitted",
          ],
        },
      ],
      risks: [
        "Approval policies still need project-specific configuration.",
        "Live connector and database access still depend on valid project credentials.",
      ],
    };
  }
}

export function summarizeReview(validation?: ValidationReport): string[] {
  if (!validation) {
    return ["No validation output is available yet."];
  }

  if (validation.status === "pass") {
    return ["Validation succeeded for the current execution plan."];
  }

  return [
    "Validation needs revision before the run can be considered complete.",
  ];
}

export function toCoderTasks(plan: ImplementationPlan): ImplementationPlanTask[] {
  return plan.tasks;
}
