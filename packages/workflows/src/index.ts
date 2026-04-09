import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { DeterministicPlanningAgent, LLMPlanningAgent } from "@horcruxsys/nagini/agents";
import { loadPartialConfig } from "@horcruxsys/nagini/config";
import { createConnectorBundle } from "@horcruxsys/nagini/connectors";
import type {
  ApprovalAction,
  ApprovalDecisionInput,
  ContextCitation,
  DashboardActivityItem,
  DashboardSummary,
  RunEvent,
  SetupStateSummary,
  RunRecord,
  RunRequest,
  SourceDocument,
  WorkItem,
} from "@horcruxsys/nagini/domain";
import { LocalExecutionService } from "@horcruxsys/nagini/execution";
import { HybridKnowledgeService } from "@horcruxsys/nagini/knowledge";
import { createPersistenceLayer } from "@horcruxsys/nagini/persistence";
export { createApprovalInterrupt, type WorkflowInterrupt } from "./interrupt.js";

export class OrchestratorWorkflowService {
  private readonly config = loadPartialConfig();
  private readonly connectors = createConnectorBundle(this.config);
  private readonly persistence = createPersistenceLayer(this.config.postgres);
  private readonly knowledgeService = new HybridKnowledgeService(
    this.persistence,
  );
  private readonly planningAgent = process.env.OPENAI_API_KEY
    ? new LLMPlanningAgent()
    : new DeterministicPlanningAgent();
  private readonly executionService = new LocalExecutionService();
  public readonly emitter = new EventEmitter();

  private async updateRun(run: RunRecord): Promise<void> {
    await this.persistence.saveRun(run);
    this.emitter.emit("run:change", run);
  }

  async listRuns(): Promise<RunRecord[]> {
    return this.persistence.listRuns();
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.persistence.getRun(runId);
  }

  async getSetupState(): Promise<SetupStateSummary> {
    const [runs, jiraHealth, confluenceHealth, githubHealth] =
      await Promise.all([
        this.persistence.listRuns(),
        this.connectors.jira.getHealth(),
        this.connectors.confluence.getHealth(),
        this.connectors.github.getHealth(),
      ]);

    const connectorConfigs = {
      jira: this.config.jira,
      confluence: this.config.confluence,
      github: this.config.github,
    };
    const requiredEnv = {
      jira: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
      confluence: [
        "CONFLUENCE_BASE_URL",
        "CONFLUENCE_EMAIL",
        "CONFLUENCE_API_TOKEN",
      ],
      github: ["GITHUB_TOKEN"],
    } as const;

    const [jiraResources, confluenceResources, githubResources] =
      await Promise.all([
        jiraHealth.status === "ready"
          ? (this.connectors.jira.listProjects?.().catch(() => []) ?? [])
          : [],
        confluenceHealth.status === "ready"
          ? (this.connectors.confluence.listSpaces?.().catch(() => []) ?? [])
          : [],
        githubHealth.status === "ready"
          ? (this.connectors.github.listRepositories?.().catch(() => []) ?? [])
          : [],
      ]);

    const connectors: SetupStateSummary["connectors"] = [
      {
        provider: "jira",
        label: "Jira",
        configured: Boolean(connectorConfigs.jira),
        status: jiraHealth.status,
        message: jiraHealth.message,
        resources: jiraResources.slice(0, 4),
        requiredEnv: [...requiredEnv.jira],
        missingEnv: requiredEnv.jira.filter((key) => !process.env[key]),
      },
      {
        provider: "confluence",
        label: "Confluence",
        configured: Boolean(connectorConfigs.confluence),
        status: confluenceHealth.status,
        message: confluenceHealth.message,
        resources: confluenceResources.slice(0, 4),
        requiredEnv: [...requiredEnv.confluence],
        missingEnv: requiredEnv.confluence.filter((key) => !process.env[key]),
      },
      {
        provider: "github",
        label: "GitHub",
        configured: Boolean(connectorConfigs.github),
        status: githubHealth.status,
        message: githubHealth.message,
        resources: githubResources.slice(0, 4),
        requiredEnv: [...requiredEnv.github],
        missingEnv: requiredEnv.github.filter((key) => !process.env[key]),
      },
    ];

    const completedCount = connectors.filter(
      (connector) => connector.status === "ready",
    ).length;
    const latestRun = runs[0];
    const recommendedRepo = latestRun?.repo ?? githubResources[0]?.id;
    const orchestratorBaseUrl =
      process.env.ORCHESTRATOR_BASE_URL ??
      `http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? "4000"}`;

    return {
      generatedAt: new Date().toISOString(),
      ready: completedCount === connectors.length,
      completedCount,
      totalCount: connectors.length,
      nextAction:
        completedCount === connectors.length
          ? "Launch the first real run and watch the agent timeline in the dashboard."
          : "Copy .env.example to .env, add real connector credentials, and refresh this page.",
      connectors,
      recommended: {
        issueKeyTemplate: latestRun?.issueKey
          ? `implement ${latestRun.issueKey}`
          : "implement <issue-key>",
        reviewer:
          process.env.NEXT_PUBLIC_DEFAULT_REVIEWER ??
          process.env.DEFAULT_REVIEWER ??
          "operator@example.com",
        repo: recommendedRepo,
        orchestratorBaseUrl,
      },
    };
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const [runs, jiraHealth, confluenceHealth, githubHealth] =
      await Promise.all([
        this.persistence.listRuns(),
        this.connectors.jira.getHealth(),
        this.connectors.confluence.getHealth(),
        this.connectors.github.getHealth(),
      ]);

    const lastSevenDays = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentRuns = runs.filter(
      (run) => new Date(run.createdAt).getTime() >= lastSevenDays,
    );
    const completedRuns = recentRuns.filter(
      (run) => run.status === "completed",
    );
    const failedRuns = recentRuns.filter((run) => run.status === "failed");
    const validatedRuns = recentRuns.filter((run) => run.validation);
    const successfulValidations = validatedRuns.filter(
      (run) => run.validation?.status === "pass",
    );
    const avgValidationMs =
      validatedRuns.length === 0
        ? 0
        : Math.round(
            validatedRuns.reduce(
              (total, run) =>
                total +
                (run.validation?.commands.reduce(
                  (commandTotal, command) => commandTotal + command.durationMs,
                  0,
                ) ?? 0),
              0,
            ) / validatedRuns.length,
          );
    const projectCount = new Set(runs.map((run) => run.projectId)).size;
    const allReady = [jiraHealth, confluenceHealth, githubHealth].every(
      (health) => health.status === "ready",
    );

    const recentActivity: DashboardActivityItem[] =
      runs.slice(0, 5).map((run) => ({
        id: run.id,
        title: `${run.issueKey} · ${run.mode}`,
        detail:
          run.approval?.status === "pending"
            ? "Awaiting human approval before execution."
            : (run.validation?.summary ?? run.summary),
        timestamp: run.updatedAt,
        status:
          run.status === "failed" || run.approval?.status === "rejected"
            ? "attention"
            : run.status === "completed"
              ? "completed"
              : "in_progress",
      })) ?? [];
    const approvalQueue: DashboardSummary["approvalQueue"] = runs
      .filter(
        (run) => run.approval?.status && run.approval.status !== "not_required",
      )
      .slice(0, 6)
      .map((run) => ({
        runId: run.id,
        issueKey: run.issueKey,
        repo: run.repo,
        requestedAt: run.approval?.requestedAt ?? run.updatedAt,
        summary: run.summary,
        status:
          run.approval?.status === "approved"
            ? "approved"
            : run.approval?.status === "rejected"
              ? "rejected"
              : "pending",
      }));

    return {
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          id: "projects",
          label: "Connected projects",
          value: String(projectCount),
          note:
            projectCount === 0
              ? "ready for first onboarding"
              : `${projectCount} active workspace${projectCount === 1 ? "" : "s"}`,
          tone: projectCount > 0 ? "positive" : "neutral",
        },
        {
          id: "runs",
          label: "Weekly automations",
          value: String(recentRuns.length),
          note: `${completedRuns.length} completed • ${failedRuns.length} need attention`,
          tone: failedRuns.length > 0 ? "warning" : "positive",
        },
        {
          id: "approvals",
          label: "Approval queue",
          value: String(
            approvalQueue.filter((item) => item.status === "pending").length,
          ),
          note: `${approvalQueue.filter((item) => item.status === "approved").length} approved recently`,
          tone: approvalQueue.some((item) => item.status === "pending")
            ? "warning"
            : "neutral",
        },
        {
          id: "validation",
          label: "Validation pass rate",
          value:
            validatedRuns.length === 0
              ? "—"
              : `${Math.round((successfulValidations.length / validatedRuns.length) * 100)}%`,
          note:
            avgValidationMs > 0
              ? `${(avgValidationMs / 1000).toFixed(1)}s average evidence cycle`
              : "real validation activates on implement runs",
          tone: allReady ? "positive" : "warning",
        },
        {
          id: "scale",
          label: "Consumer readiness",
          value: "1M+",
          note: "progressive disclosure and safe defaults enabled",
          tone: "positive",
        },
      ],
      providerHealth: [jiraHealth, confluenceHealth, githubHealth],
      recentActivity:
        recentActivity.length > 0
          ? recentActivity
          : [
              {
                id: "empty-state",
                title: "System ready for pilot",
                detail:
                  "Create the first run to populate recent activity, validation evidence, and rollout insights.",
                timestamp: new Date().toISOString(),
                status: "completed",
              },
            ],
      approvalQueue,
      launchTracks: [
        "Pilot with one product team and approval-on-write enabled.",
        "Expand retrieval freshness and PR automation for shared services.",
        "Open the consumer surface to large-scale self-serve project onboarding.",
      ],
    };
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
      approval: {
        required: false,
        status: "not_required",
        decisions: [],
      },
    };

    if (request.mode === "implement") {
      const allReady = [
        await this.connectors.jira.getHealth(),
        await this.connectors.confluence.getHealth(),
        await this.connectors.github.getHealth(),
      ].every((health) => health.status === "ready");

      if (!allReady) {
        const failedRun: RunRecord = {
          ...initialRun,
          status: "failed",
          updatedAt: new Date().toISOString(),
          summary: "Implement mode requires all connectors to be fully configured and ready.",
        };
        await this.updateRun(failedRun);
        throw new Error(failedRun.summary);
      }
    }

    await this.updateRun(initialRun);

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
      const approvalRequired =
        request.mode === "implement" || plan.approvalRequired;
      const updatedAt = new Date().toISOString();

      if (approvalRequired) {
        const awaitingRun: RunRecord = {
          ...initialRun,
          status: "awaiting_approval",
          summary: `Awaiting approval to execute ${plan.branchName}.`,
          updatedAt,
          contextPack,
          plan: {
            ...plan,
            approvalRequired: true,
          },
          approval: {
            required: true,
            status: "pending",
            requestedAt: updatedAt,
            decisions: [],
          },
          validation: {
            status: "pending",
            simulated: false,
            summary: "Execution is paused until an approver reviews this run.",
            commands: [],
          },
        };

        await this.updateRun(awaitingRun);
        return awaitingRun;
      }

      const validation =
        request.mode === "implement"
          ? await this.executionService.runValidation(plan, request.repo)
          : undefined;
      const finalRun: RunRecord = {
        ...initialRun,
        status: validation?.status === "fail" ? "failed" : "completed",
        summary: plan.summary,
        updatedAt,
        contextPack,
        plan,
        validation,
      };

      await this.updateRun(finalRun);
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
      await this.updateRun(failedRun);
      throw error;
    }
  }

  async decideApproval(
    runId: string,
    action: ApprovalAction,
    input: ApprovalDecisionInput,
  ): Promise<RunRecord> {
    const run = await this.persistence.getRun(runId);

    if (!run) {
      throw new Error(`Run ${runId} was not found.`);
    }

    if (!run.approval?.required) {
      throw new Error(`Run ${runId} does not require approval.`);
    }

    const decisionTime = new Date().toISOString();
    const decisions = [
      ...(run.approval.decisions ?? []),
      {
        action,
        reviewer: input.reviewer,
        comment: input.comment,
        createdAt: decisionTime,
      },
    ];

    if (action === "rejected") {
      const rejectedRun: RunRecord = {
        ...run,
        status: "blocked",
        updatedAt: decisionTime,
        summary: input.comment
          ? `Run rejected by ${input.reviewer}: ${input.comment}`
          : `Run rejected by ${input.reviewer}.`,
        approval: {
          ...run.approval,
          status: "rejected",
          resolvedAt: decisionTime,
          decisions,
        },
      };
      await this.updateRun(rejectedRun);
      return rejectedRun;
    }

    if (!run.plan) {
      throw new Error(`Run ${runId} has no plan to execute.`);
    }

    const validation =
      run.mode === "implement"
        ? await this.executionService.runValidation(run.plan, run.repo)
        : run.validation;

    const approvedRun: RunRecord = {
      ...run,
      status: validation?.status === "fail" ? "failed" : "completed",
      updatedAt: new Date().toISOString(),
      summary: run.plan.summary,
      validation,
      approval: {
        ...run.approval,
        status: "approved",
        resolvedAt: decisionTime,
        decisions,
      },
    };
    await this.updateRun(approvedRun);
    return approvedRun;
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
  const events: RunEvent[] = [
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
  ];

  if (run.approval?.required) {
    events.push({
      id: `${run.id}-approval-requested`,
      runId: run.id,
      type: "run.approval_requested",
      title: "Approval requested",
      detail:
        run.approval.status === "pending"
          ? "A reviewer must approve this run before execution starts."
          : `Approval status is ${run.approval.status}.`,
      createdAt: run.approval.requestedAt ?? createdAt,
    });
  }

  if (
    run.approval?.status === "approved" ||
    run.approval?.status === "rejected"
  ) {
    const latestDecision = run.approval.decisions.at(-1);
    events.push({
      id: `${run.id}-approval-resolved`,
      runId: run.id,
      type: "run.approval_resolved",
      title:
        run.approval.status === "approved" ? "Run approved" : "Run rejected",
      detail: latestDecision?.comment
        ? `${latestDecision.reviewer}: ${latestDecision.comment}`
        : `Decision recorded by ${latestDecision?.reviewer ?? "reviewer"}.`,
      createdAt: run.approval.resolvedAt ?? run.updatedAt,
    });
  }

  events.push({
    id: `${run.id}-validation`,
    runId: run.id,
    type: "run.validation_result",
    title: "Validation prepared",
    detail:
      run.validation?.summary ??
      "This mode does not execute validation, but the plan and context are available for review.",
    createdAt: run.updatedAt,
  });

  return events;
}
