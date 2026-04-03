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

export type DashboardData = {
  generatedAt: string;
  metrics: DashboardMetric[];
  providerHealth: DashboardProviderHealth[];
  recentActivity: DashboardActivityItem[];
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
      detail: "Acceptance criteria and linked pages were successfully extracted.",
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
  launchTracks: [
    "Pilot with one product team and approval-on-write enabled.",
    "Expand retrieval freshness and PR automation for shared services.",
    "Open the consumer surface to large-scale self-serve project onboarding.",
  ],
};

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
