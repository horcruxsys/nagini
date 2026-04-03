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
  status: "ready" | "degraded" | "not_configured";
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

export type SetupCatalogItem = {
  id: string;
  label: string;
  description?: string;
  url?: string;
};

export type SetupConnectorState = {
  provider: "github" | "jira" | "confluence";
  label: string;
  configured: boolean;
  status: "ready" | "degraded" | "not_configured";
  message: string;
  resources: SetupCatalogItem[];
  requiredEnv: string[];
  missingEnv: string[];
};

export type SetupState = {
  generatedAt: string;
  ready: boolean;
  completedCount: number;
  totalCount: number;
  nextAction: string;
  connectors: SetupConnectorState[];
  recommended: {
    issueKeyTemplate: string;
    reviewer: string;
    repo?: string;
    orchestratorBaseUrl: string;
  };
};

const fallbackDashboard: DashboardData = {
  generatedAt: new Date().toISOString(),
  metrics: [
    {
      id: "projects",
      label: "Connected projects",
      value: "0",
      note: "complete onboarding to populate live data",
      tone: "neutral",
    },
    {
      id: "runs",
      label: "Weekly automations",
      value: "0",
      note: "no live runs yet",
      tone: "neutral",
    },
    {
      id: "approvals",
      label: "Approval queue",
      value: "0",
      note: "approval requests will appear after the first run",
      tone: "neutral",
    },
    {
      id: "validation",
      label: "Validation pass rate",
      value: "—",
      note: "connect tools and execute a real run to gather evidence",
      tone: "neutral",
    },
  ],
  providerHealth: [
    {
      provider: "jira",
      status: "not_configured",
      message: "Jira is not configured yet.",
      lastCheckedAt: new Date().toISOString(),
    },
    {
      provider: "confluence",
      status: "not_configured",
      message: "Confluence is not configured yet.",
      lastCheckedAt: new Date().toISOString(),
    },
    {
      provider: "github",
      status: "not_configured",
      message: "GitHub is not configured yet.",
      lastCheckedAt: new Date().toISOString(),
    },
  ],
  recentActivity: [
    {
      id: "empty-state",
      title: "Complete onboarding to unlock live activity",
      detail:
        "Once Jira, Confluence, and GitHub are connected, this area will show the real agent timeline and evidence loop.",
      timestamp: new Date().toISOString(),
      status: "in_progress",
    },
  ],
  approvalQueue: [],
  launchTracks: [
    "Connect real Jira, Confluence, and GitHub accounts.",
    "Run the first approval-first implementation workflow.",
    "Review the live agent timeline and validation evidence in the dashboard.",
  ],
};

const fallbackSetupState: SetupState = {
  generatedAt: new Date().toISOString(),
  ready: false,
  completedCount: 0,
  totalCount: 3,
  nextAction:
    "The web app could not connect to the orchestrator. Please ensure the backend is running and reachable.",
  connectors: [
    {
      provider: "jira",
      label: "Jira",
      configured: false,
      status: "not_configured",
      message: "Orchestrator unreachable. Check connection settings.",
      resources: [],
      requiredEnv: ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"],
      missingEnv: [],
    },
    {
      provider: "confluence",
      label: "Confluence",
      configured: false,
      status: "not_configured",
      message: "Orchestrator unreachable. Check connection settings.",
      resources: [],
      requiredEnv: [
        "CONFLUENCE_BASE_URL",
        "CONFLUENCE_EMAIL",
        "CONFLUENCE_API_TOKEN",
      ],
      missingEnv: [],
    },
    {
      provider: "github",
      label: "GitHub",
      configured: false,
      status: "not_configured",
      message: "Orchestrator unreachable. Check connection settings.",
      resources: [],
      requiredEnv: ["GITHUB_TOKEN"],
      missingEnv: [],
    },
  ],
  recommended: {
    issueKeyTemplate: "implement <issue-key>",
    reviewer:
      process.env.NEXT_PUBLIC_DEFAULT_REVIEWER ?? "operator@example.com",
    orchestratorBaseUrl:
      process.env.ORCHESTRATOR_BASE_URL ??
      process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ??
      "http://127.0.0.1:4000",
  },
};

export type RunDetailData = {
  run: RunRecord;
  timeline: RunEvent[];
};

export function getOrchestratorBaseUrl(): string {
  return (
    process.env.ORCHESTRATOR_BASE_URL ??
    process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ??
    "http://127.0.0.1:4000"
  );
}

export function getDefaultReviewer(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_REVIEWER ?? "operator@example.com";
}

export async function getSetupState(): Promise<SetupState> {
  try {
    const response = await fetch(
      `${getOrchestratorBaseUrl()}/api/setup/state`,
      {
        next: { revalidate: 10 },
      },
    );

    if (!response.ok) {
      throw new Error(`Setup API returned ${response.status}`);
    }

    return (await response.json()) as SetupState;
  } catch {
    return {
      ...fallbackSetupState,
      recommended: {
        ...fallbackSetupState.recommended,
        reviewer: getDefaultReviewer(),
        orchestratorBaseUrl: getOrchestratorBaseUrl(),
      },
    };
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${getOrchestratorBaseUrl()}/api/dashboard`, {
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
      fetch(`${getOrchestratorBaseUrl()}/api/runs/${runId}`, {
        cache: "no-store",
      }),
      fetch(`${getOrchestratorBaseUrl()}/api/runs/${runId}/timeline`, {
        cache: "no-store",
      }),
    ]);

    if (runResponse.status === 404 || timelineResponse.status === 404) {
      return null;
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
    return null;
  }
}

export async function submitApprovalDecision(input: {
  runId: string;
  decision: "approve" | "reject";
  reviewer: string;
  comment?: string;
}): Promise<void> {
  const response = await fetch(
    `${getOrchestratorBaseUrl()}/api/runs/${input.runId}/${input.decision}`,
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
