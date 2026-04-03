import type { AppConfig } from "@horcruxsys/nagini/config";
import type { ContextCitation, WorkItem } from "@horcruxsys/nagini/domain";
import { LiveConfluenceConnector } from "./confluence/client.js";
import { LiveGitHubConnector } from "./github/client.js";
import { LiveJiraConnector } from "./jira/client.js";

// Re-export types
export type {
  ConnectorBundle,
  ConnectorHealth,
  ConfluenceConnector,
  GitHubConnector,
  JiraConnector,
} from "./types.js";
export { LiveJiraConnector } from "./jira/client.js";
export { LiveConfluenceConnector } from "./confluence/client.js";
export { LiveGitHubConnector } from "./github/client.js";
export { ConnectorError, withRetry } from "./shared/retry.js";
export { htmlToMarkdown, stripHtml } from "./shared/canonicalize.js";

import type {
  ConfluenceConnector,
  ConnectorBundle,
  ConnectorHealth,
  GitHubConnector,
  JiraConnector,
} from "./types.js";

// ── Stub implementations (used when credentials are absent) ─────────

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
      message: "Stub Jira connector (no credentials configured).",
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
    ];
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      provider: "confluence",
      status: "ready",
      message: "Stub Confluence connector (no credentials configured).",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

class StubGitHubConnector implements GitHubConnector {
  async findRelevantFiles(repo: string, issueKey: string): Promise<string[]> {
    return [
      `apps/orchestrator/src/server.ts // ${repo}`,
      "packages/workflows/src/index.ts",
      `docs/ai-orchestrator/00-technical-spec.md // ${issueKey}`,
    ];
  }

  async getHealth(): Promise<ConnectorHealth> {
    return {
      provider: "github",
      status: "ready",
      message: "Stub GitHub connector (no credentials configured).",
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Creates a connector bundle. If a section of `AppConfig` is provided,
 * real connectors are used; otherwise stubs are returned.
 */
export function createConnectorBundle(
  config?: Partial<AppConfig>,
): ConnectorBundle {
  const jira: JiraConnector = config?.jira
    ? new LiveJiraConnector(config.jira)
    : new StubJiraConnector();

  const confluence: ConfluenceConnector = config?.confluence
    ? new LiveConfluenceConnector(config.confluence)
    : new StubConfluenceConnector();

  const github: GitHubConnector = config?.github
    ? new LiveGitHubConnector(config.github)
    : new StubGitHubConnector();

  return { jira, confluence, github };
}
