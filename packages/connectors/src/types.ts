import type {
  CodeSearchResult,
  ContextCitation,
  RepoTreeEntry,
  SourceDocument,
  WorkItem,
} from "@horcruxsys/nagini/domain";

export interface ConnectorHealth {
  provider: "github" | "jira" | "confluence";
  status: "ready" | "degraded";
  message: string;
  lastCheckedAt: string;
}

export interface JiraConnector {
  getWorkItem(issueKey: string): Promise<WorkItem>;
  getIssueAsDocument?(
    issueKey: string,
    projectId: string,
  ): Promise<SourceDocument>;
  getHealth(): Promise<ConnectorHealth>;
}

export interface ConfluenceConnector {
  getRelatedPages(issueKey: string): Promise<ContextCitation[]>;
  getPageAsDocument?(
    pageId: string,
    projectId: string,
  ): Promise<SourceDocument>;
  getHealth(): Promise<ConnectorHealth>;
}

export interface GitHubConnector {
  findRelevantFiles(repo: string, issueKey: string): Promise<string[]>;
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
