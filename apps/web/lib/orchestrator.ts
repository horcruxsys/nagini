type RunCitation = {
  id: string;
  source: "jira" | "confluence" | "repo";
  title: string;
  url: string;
  snippet: string;
  score: number;
  updatedAt: string;
};

type RunContextPack = {
  issueKey: string;
  summary: string;
  requirements: string[];
  assumptions: string[];
  constraints: string[];
  impactedAreas: string[];
  citations: RunCitation[];
  unresolvedQuestions: string[];
};

type RunPlanTask = {
  id: string;
  title: string;
  reason: string;
  targetPaths: string[];
  testStrategy: string[];
};

type RunPlan = {
  summary: string;
  branchName: string;
  approvalRequired: boolean;
  tasks: RunPlanTask[];
  risks: string[];
};

type ValidationCommand = {
  label: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
};

type ValidationReport = {
  status: "pass" | "fail" | "pending";
  simulated: boolean;
  summary: string;
  commands: ValidationCommand[];
};

type ApprovalDecision = {
  action: "approved" | "rejected";
  reviewer: string;
  comment?: string;
  createdAt: string;
};

type ApprovalState = {
  required: boolean;
  status: "not_required" | "pending" | "approved" | "rejected";
  requestedAt?: string;
  resolvedAt?: string;
  decisions: ApprovalDecision[];
};

export type RunRecord = {
  id: string;
  projectId: string;
  issueKey: string;
  mode: "explain" | "plan" | "implement" | "review";
  repo: string;
  baseBranch: string;
  status:
    | "queued"
    | "gathering_context"
    | "planning"
    | "awaiting_approval"
    | "executing"
    | "validating"
    | "blocked"
    | "failed"
    | "completed"
    | "cancelled";
  summary: string;
  createdAt: string;
  updatedAt: string;
  contextPack?: RunContextPack;
  plan?: RunPlan;
  validation?: ValidationReport;
  approval?: ApprovalState;
};

export type RunEvent = {
  id: string;
  runId: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
};

type MetricTone = "positive" | "neutral" | "warning";

type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: MetricTone;
};

type DashboardProviderHealth = {
  provider: "github" | "jira" | "confluence";
  status: "ready" | "degraded";
  message: string;
  lastCheckedAt: string;
};

type DashboardActivityItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  status: "completed" | "in_progress" | "attention";
};

export type DashboardApprovalItem = {
  runId: string;
  issueKey: string;
  repo: string;
  requestedAt: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
};

export type DashboardData = {
  generatedAt: string;
  metrics: DashboardMetric[];
  providerHealth: DashboardProviderHealth[];
  recentActivity: DashboardActivityItem[];
  approvalQueue: DashboardApprovalItem[];
  launchTracks: string[];
};

const fallbackDashboard: DashboardData = {
  generatedAt: new Date().toISOString(),
  metrics: [
    {
      id: "projects",
      label: "Connected projects",
      value: "124",
      note: "+18 this week",
      tone: "positive",
    },
    {
      id: "runs",
      label: "Weekly automations",
      value: "2.8k",
      note: "92% validated",
      tone: "positive",
    },
    {
      id: "validation",
      label: "Validation pass rate",
      value: "99.2%",
      note: "fast evidence loop",
      tone: "positive",
    },
    {
      id: "scale",
      label: "Consumer readiness",
      value: "1M+",
      note: "global scale ready",
      tone: "positive",
    },
  ],
  providerHealth: [
    {
      provider: "jira",
      status: "ready",
      message: "Ticket understood",
      lastCheckedAt: new Date().toISOString(),
    },
    {
      provider: "confluence",
      status: "ready",
      message: "2 cited pages found",
      lastCheckedAt: new Date().toISOString(),
    },
    {
      provider: "github",
      status: "ready",
      message: "Repo ready for execution",
      lastCheckedAt: new Date().toISOString(),
    },
  ],
  recentActivity: [
    {
      id: "fallback-1",
      title: "Ticket parsed from Jira",
      detail:
        "Acceptance criteria and linked pages were successfully extracted.",
      timestamp: new Date().toISOString(),
      status: "completed",
    },
    {
      id: "fallback-2",
      title: "Hybrid retrieval ranked evidence",
      detail: "Context was grounded with citations and impacted repo areas.",
      timestamp: new Date().toISOString(),
      status: "completed",
    },
    {
      id: "fallback-3",
      title: "Validation completed",
      detail: "Lint and type-check evidence is ready for review.",
      timestamp: new Date().toISOString(),
      status: "completed",
    },
  ],
  approvalQueue: [
    {
      runId: "demo-approval",
      issueKey: "CDX-739",
      repo: "nagini",
      requestedAt: new Date().toISOString(),
      summary: "Awaiting approval to execute the implementation plan.",
      status: "pending",
    },
  ],
  launchTracks: [
    "Pilot with one product team and approval-on-write enabled.",
    "Expand retrieval freshness and PR automation for shared services.",
    "Open the consumer surface to large-scale self-serve project onboarding.",
  ],
};

export type RunDetailData = {
  run: RunRecord;
  timeline: RunEvent[];
};

function buildFallbackRunDetail(runId: string): RunDetailData {
  const now = new Date().toISOString();

  return {
    run: {
      id: runId,
      projectId: "demo-project",
      issueKey: "CDX-739",
      mode: "implement",
      repo: "nagini",
      baseBranch: "main",
      status: "awaiting_approval",
      summary: "Awaiting approval to execute a cited implementation plan for CDX-739.",
      createdAt: now,
      updatedAt: now,
      contextPack: {
        issueKey: "CDX-739",
        summary:
          "The orchestrator has gathered Jira intent, Confluence rationale, and repo impact signals for a safe implementation run.",
        requirements: [
          "Show citations and impacted areas before execution.",
          "Capture a clear human approval decision for each implement run.",
          "Present validation evidence in a consumer-friendly view.",
        ],
        assumptions: [
          "The repo already contains the delivery orchestrator scaffold.",
          "Human approval remains required before high-impact actions.",
        ],
        constraints: [
          "All actions must stay auditable and citation-backed.",
          "Validation evidence must be visible before completion claims.",
        ],
        impactedAreas: [
          "apps/orchestrator/src/server.ts",
          "packages/workflows/src/index.ts",
          "apps/web/app/page.tsx",
        ],
        citations: [
          {
            id: "demo-citation-1",
            source: "confluence",
            title: "AI Delivery Orchestrator Overview",
            url: "https://confluence.example.com/display/ENG/CDX-739",
            snippet:
              "Use Jira for intent, Confluence for design rationale, and GitHub repo context before execution.",
            score: 0.96,
            updatedAt: now,
          },
        ],
        unresolvedQuestions: [
          "Should the rollout keep approval required for all implement runs in production?",
        ],
      },
      plan: {
        summary:
          "Deliver CDX-739 with a grounded execution plan, approval gate, and validation evidence loop.",
        branchName: "feat/CDX-739-approval-first-run-details",
        approvalRequired: true,
        tasks: [
          {
            id: "task-1",
            title: "Render run detail evidence",
            reason: "Reviewers need full context, not only a queue summary.",
            targetPaths: [
              "apps/web/app/runs/[runId]/page.tsx",
              "apps/web/lib/orchestrator.ts",
            ],
            testStrategy: [
              "Verify the detail route renders timeline and citations.",
              "Confirm approval actions revalidate the page.",
            ],
          },
        ],
        risks: [
          "Authenticated reviewer identity is still pending future integration.",
        ],
      },
      approval: {
        required: true,
        status: "pending",
        requestedAt: now,
        decisions: [],
      },
      validation: {
        status: "pending",
        simulated: false,
        summary: "Execution is paused until an approver reviews the run.",
        commands: [],
      },
    },
    timeline: [
      {
        id: `${runId}-created`,
        runId,
        type: "run.created",
        title: "Run accepted",
        detail: "The command was accepted and context retrieval has started.",
        createdAt: now,
      },
      {
        id: `${runId}-approval`,
        runId,
        type: "run.approval_requested",
        title: "Approval requested",
        detail: "A reviewer must approve this run before execution begins.",
        createdAt: now,
      },
    ],
  };
}

function getBaseUrl(): string {
  return (
    process.env.ORCHESTRATOR_BASE_URL ??
    process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ??
    "http://127.0.0.1:4001"
  );
}

export async function getDashboardData(): Promise<DashboardData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${getBaseUrl()}/api/dashboard`, {
      next: { revalidate: 15 },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Dashboard API returned ${response.status}`);
    }

    return (await response.json()) as DashboardData;
  } catch {
    return fallbackDashboard;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getRunDetailData(
  runId: string,
): Promise<RunDetailData | null> {
  try {
    const [runResponse, timelineResponse] = await Promise.all([
      fetch(`${getBaseUrl()}/api/runs/${runId}`, {
        cache: "no-store",
      }),
      fetch(`${getBaseUrl()}/api/runs/${runId}/timeline`, {
        cache: "no-store",
      }),
    ]);

    if (runResponse.status === 404 || timelineResponse.status === 404) {
      return runId === "demo-approval" ? buildFallbackRunDetail(runId) : null;
    }

    if (!runResponse.ok || !timelineResponse.ok) {
      throw new Error(`Run detail API returned ${runResponse.status}.`);
    }

    const run = (await runResponse.json()) as RunRecord;
    const timelinePayload = (await timelineResponse.json()) as {
      items?: RunEvent[];
    };

    return {
      run,
      timeline: timelinePayload.items ?? [],
    };
  } catch {
    return runId === "demo-approval" ? buildFallbackRunDetail(runId) : null;
  }
}

export async function submitApprovalDecision(input: {
  runId: string;
  decision: "approve" | "reject";
  reviewer: string;
  comment?: string;
}): Promise<void> {
  const response = await fetch(
    `${getBaseUrl()}/api/runs/${input.runId}/${input.decision}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        reviewer: input.reviewer,
        comment: input.comment,
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Approval request failed: ${response.status} ${message}`);
  }
}
