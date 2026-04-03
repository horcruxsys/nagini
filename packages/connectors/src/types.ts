import type {
  CodeSearchResult,
  ContextCitation,
  RepoTreeEntry,
  SourceDocument,
  WorkItem,
} from "@horcruxsys/nagini/domain";

export interface ConnectorHealth {
  provider: "github" | "jira" | "confluence";
  status: "ready" | "degraded" | "not_configured";
  message: string;
  lastCheckedAt: string;
}

export interface ConnectorCatalogItem {
  id: string;
  label: string;
  description?: string;
  url?: string;
}

export interface JiraConnector {
  getWorkItem(issueKey: string): Promise<WorkItem>;
  listProjects?(): Promise<ConnectorCatalogItem[]>;
  getIssueAsDocument?(
    issueKey: string,
    projectId: string,
  ): Promise<SourceDocument>;
  getHealth(): Promise<ConnectorHealth>;
}

export interface ConfluenceConnector {
  getRelatedPages(issueKey: string): Promise<ContextCitation[]>;
  listSpaces?(): Promise<ConnectorCatalogItem[]>;
  getPageAsDocument?(
    pageId: string,
    projectId: string,
  ): Promise<SourceDocument>;
  getHealth(): Promise<ConnectorHealth>;
}

export interface GitHubConnector {
  findRelevantFiles(repo: string, issueKey: string): Promise<string[]>;
  listRepositories?(): Promise<ConnectorCatalogItem[]>;
  getRepoTree?(repo: string, ref?: string): Promise<RepoTreeEntry[]>;
  getFileContent?(repo: string, path: string, ref?: string): Promise<string>;
  searchCode?(repo: string, query: string): Promise<CodeSearchResult[]>;
  createBranch?(
    repo: string,
    branchName: string,
    fromRef?: string,
  ): Promise<{ ref: string }>;
  openPullRequest?(
    repo: string,
    input: {
      title: string;
      body: string;
      head: string;
      base: string;
    },
  ): Promise<{ url: string; number: number }>;
  getHealth(): Promise<ConnectorHealth>;
}

export interface ConnectorBundle {
  jira: JiraConnector;
  confluence: ConfluenceConnector;
  github: GitHubConnector;
}
