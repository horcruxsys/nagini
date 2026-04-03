import { randomUUID } from "node:crypto";

import { DeterministicPlanningAgent } from "@horcruxsys/nagini/agents";
import { loadPartialConfig } from "@horcruxsys/nagini/config";
import { createConnectorBundle } from "@horcruxsys/nagini/connectors";
import type {
  ContextCitation,
  RunEvent,
  RunRecord,
  RunRequest,
  SourceDocument,
  WorkItem,
} from "@horcruxsys/nagini/domain";
import { LocalExecutionService } from "@horcruxsys/nagini/execution";
import { HybridKnowledgeService } from "@horcruxsys/nagini/knowledge";
import { createPersistenceLayer } from "@horcruxsys/nagini/persistence";

export class OrchestratorWorkflowService {
  private readonly config = loadPartialConfig();
  private readonly connectors = createConnectorBundle(this.config);
  private readonly persistence = createPersistenceLayer(this.config.postgres);
  private readonly knowledgeService = new HybridKnowledgeService(
    this.persistence,
  );
  private readonly planningAgent = new DeterministicPlanningAgent();
  private readonly executionService = new LocalExecutionService();

  async listRuns(): Promise<RunRecord[]> {
    return this.persistence.listRuns();
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.persistence.getRun(runId);
  }

  async run(request: RunRequest): Promise<RunRecord> {
    const timestamp = new Date().toISOString();
    const runId = randomUUID();
    const initialRun: RunRecord = {
      id: runId,
      projectId: request.projectId,
      issueKey: request.issueKey,
      mode: request.mode,
      repo: request.repo,
      baseBranch: request.baseBranch,
      status: "gathering_context",
      summary: `Gathering context for ${request.issueKey}.`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.persistence.saveRun(initialRun);

    try {
      const workItem = await this.connectors.jira.getWorkItem(request.issueKey);
      const citations = await this.connectors.confluence.getRelatedPages(
        request.issueKey,
      );
      const impactedAreas = await this.connectors.github.findRelevantFiles(
        request.repo,
        request.issueKey,
      );

      const documents = await this.collectDocuments(
        request.projectId,
        request.issueKey,
        workItem,
        citations,
      );
      await this.knowledgeService.ingestDocuments(request.projectId, documents);

      const contextPack = await this.knowledgeService.createContextPack({
        projectId: request.projectId,
        workItem,
        citations,
        repoHints: impactedAreas,
      });
      const plan = await this.planningAgent.createPlan(contextPack);
      const validation =
        request.mode === "implement"
          ? await this.executionService.runValidation(plan, request.repo)
          : undefined;
      const updatedAt = new Date().toISOString();
      const finalRun: RunRecord = {
        ...initialRun,
        status: validation?.status === "fail" ? "failed" : "completed",
        summary: plan.summary,
        updatedAt,
        contextPack,
        plan,
        validation,
      };

      await this.persistence.saveRun(finalRun);
      return finalRun;
    } catch (error) {
      const failedRun: RunRecord = {
        ...initialRun,
        status: "failed",
        updatedAt: new Date().toISOString(),
        summary:
          error instanceof Error
            ? `Run failed: ${error.message}`
            : "Run failed unexpectedly.",
      };
      await this.persistence.saveRun(failedRun);
      throw error;
    }
  }

  private async collectDocuments(
    projectId: string,
    issueKey: string,
    workItem: WorkItem,
    citations: ContextCitation[],
  ): Promise<SourceDocument[]> {
    const documents: SourceDocument[] = [];

    if (typeof this.connectors.jira.getIssueAsDocument === "function") {
      documents.push(
        await this.connectors.jira.getIssueAsDocument(issueKey, projectId),
      );
    } else {
      documents.push({
        id: `jira-${issueKey}`,
        projectId,
        provider: "jira",
        externalId: issueKey,
        title: workItem.title,
        bodyMarkdown: workItem.description,
        bodyText: workItem.description,
        url: `jira://${issueKey}`,
        author: workItem.comments[0]?.author,
        labels: workItem.labels,
        aclPrincipals: [],
        checksum: workItem.comments[0]?.createdAt ?? new Date().toISOString(),
        updatedAt: workItem.comments[0]?.createdAt ?? new Date().toISOString(),
        metadata: { priority: workItem.priority ?? null },
      });
    }

    for (const [index, citation] of citations.entries()) {
      documents.push({
        id: `${citation.source}-${issueKey}-${index}`,
        projectId,
        provider: citation.source,
        externalId: `${issueKey}-${index}`,
        title: citation.title,
        bodyMarkdown: citation.snippet,
        bodyText: citation.snippet,
        url: citation.url,
        labels: [],
        aclPrincipals: [],
        checksum: citation.updatedAt,
        updatedAt: citation.updatedAt,
        metadata: { score: citation.score },
      });
    }

    return documents;
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
