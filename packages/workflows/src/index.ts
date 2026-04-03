import { randomUUID } from "node:crypto";

import { DeterministicPlanningAgent } from "@horcruxsys/nagini/agents";
import { createConnectorBundle } from "@horcruxsys/nagini/connectors";
import type {
  RunEvent,
  RunRecord,
  RunRequest,
} from "@horcruxsys/nagini/domain";
import { LocalExecutionService } from "@horcruxsys/nagini/execution";
import { StaticKnowledgeService } from "@horcruxsys/nagini/knowledge";

export class OrchestratorWorkflowService {
  private readonly connectors = createConnectorBundle();
  private readonly knowledgeService = new StaticKnowledgeService();
  private readonly planningAgent = new DeterministicPlanningAgent();
  private readonly executionService = new LocalExecutionService();

  async run(request: RunRequest): Promise<RunRecord> {
    const workItem = await this.connectors.jira.getWorkItem(request.issueKey);
    const citations = await this.connectors.confluence.getRelatedPages(
      request.issueKey,
    );
    const impactedAreas = await this.connectors.github.findRelevantFiles(
      request.repo,
      request.issueKey,
    );
    const contextPack = await this.knowledgeService.createContextPack({
      workItem,
      citations,
      repoHints: impactedAreas,
    });
    const plan = await this.planningAgent.createPlan(contextPack);
    const validation =
      request.mode === "implement"
        ? await this.executionService.runValidation(plan, request.repo)
        : undefined;
    const timestamp = new Date().toISOString();

    return {
      id: randomUUID(),
      projectId: request.projectId,
      issueKey: request.issueKey,
      mode: request.mode,
      repo: request.repo,
      baseBranch: request.baseBranch,
      status: "completed",
      summary: plan.summary,
      createdAt: timestamp,
      updatedAt: timestamp,
      contextPack,
      plan,
      validation,
    };
  }
}

export function buildRunTimeline(run: RunRecord): RunEvent[] {
  const createdAt = run.createdAt;

  return [
    {
      id: `${run.id}-queued`,
      runId: run.id,
      type: "run.created",
      title: "Run accepted",
      detail: `Command ${run.mode} ${run.issueKey} has been accepted for ${run.repo}.`,
      createdAt,
    },
    {
      id: `${run.id}-context`,
      runId: run.id,
      type: "run.status_changed",
      title: "Context gathered",
      detail: `Collected ${run.contextPack?.citations.length ?? 0} citations and ${run.contextPack?.impactedAreas.length ?? 0} impacted areas.`,
      createdAt,
    },
    {
      id: `${run.id}-plan`,
      runId: run.id,
      type: "run.step_finished",
      title: "Plan created",
      detail: run.plan?.summary ?? "A structured execution plan is ready.",
      createdAt,
    },
    {
      id: `${run.id}-validation`,
      runId: run.id,
      type: "run.validation_result",
      title: "Validation prepared",
      detail:
        run.validation?.summary ??
        "This mode does not execute validation, but the plan and context are available for review.",
      createdAt,
    },
  ];
}
