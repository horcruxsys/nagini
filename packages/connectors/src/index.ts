import type { ContextCitation, WorkItem } from "@horcruxsys/nagini/domain";

export interface ConnectorHealth {
  provider: "github" | "jira" | "confluence";
  status: "ready" | "degraded";
  message: string;
  lastCheckedAt: string;
}

export interface JiraConnector {
  getWorkItem(issueKey: string): Promise<WorkItem>;
  getHealth(): Promise<ConnectorHealth>;
}

export interface ConfluenceConnector {
  getRelatedPages(issueKey: string): Promise<ContextCitation[]>;
  getHealth(): Promise<ConnectorHealth>;
}

export interface GitHubConnector {
  findRelevantFiles(repo: string, issueKey: string): Promise<string[]>;
  getHealth(): Promise<ConnectorHealth>;
}

class StubJiraConnector implements JiraConnector {
  async getWorkItem(issueKey: string): Promise<WorkItem> {
    return {
      key: issueKey,
      title: `Implement delivery flow for ${issueKey}`,
      description:
        "Read Jira intent, retrieve Confluence context, analyze repo impact, and execute a bounded plan-code-validate loop.",
      acceptanceCriteria: [
        "The orchestrator can understand the ticket and summarize it clearly.",
        "The system identifies impacted code areas and proposes an implementation plan.",
        "A validation-ready PR artifact can be produced for review.",
      ],
      comments: [
        {
          author: "product.manager",
          body: "The experience should feel safe, grounded, and auditable.",
          createdAt: new Date().toISOString(),
        },
      ],
      links: {
        confluencePageIds: [`page-${issueKey.toLowerCase()}`],
        repoIds: ["nagini"],
      },
      priority: "High",
      labels: ["ai-orchestrator", "rag", "delivery"],
    };
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      provider: "jira",
      status: "ready",
      message: "Stub Jira connector is healthy.",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

class StubConfluenceConnector implements ConfluenceConnector {
  async getRelatedPages(issueKey: string): Promise<ContextCitation[]> {
    return [
      {
        id: `confluence-${issueKey}-overview`,
        source: "confluence",
        title: "AI Delivery Orchestrator Overview",
        url: `https://confluence.example.com/display/ENG/${issueKey}`,
        snippet:
          "Use Jira for intent, Confluence for design rationale, and GitHub MCP for repo understanding before execution.",
        score: 0.96,
        updatedAt: new Date().toISOString(),
      },
      {
        id: `repo-${issueKey}-patterns`,
        source: "repo",
        title: "Monorepo integration patterns",
        url: "https://github.com/horcruxsys/nagini",
        snippet:
          "Turborepo packages should share domain contracts and keep orchestration logic in a dedicated service layer.",
        score: 0.91,
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      provider: "confluence",
      status: "ready",
      message: "Stub Confluence connector is healthy.",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

class StubGitHubConnector implements GitHubConnector {
  async findRelevantFiles(repo: string, issueKey: string): Promise<string[]> {
    return [
      `apps/orchestrator/src/server.ts // ${repo}`,
      "packages/workflows/src/index.ts",
      "packages/knowledge/src/index.ts",
      `docs/ai-orchestrator/00-technical-spec.md // ${issueKey}`,
    ];
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      provider: "github",
      status: "ready",
      message: "Stub GitHub connector is healthy.",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export interface ConnectorBundle {
  jira: JiraConnector;
  confluence: ConfluenceConnector;
  github: GitHubConnector;
}

export function createConnectorBundle(): ConnectorBundle {
  return {
    jira: new StubJiraConnector(),
    confluence: new StubConfluenceConnector(),
    github: new StubGitHubConnector(),
  };
}
