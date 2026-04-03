import type { GitHubConfig } from "@horcruxsys/nagini/config";
import type {
  CodeSearchResult,
  RepoTreeEntry,
} from "@horcruxsys/nagini/domain";
import type { ConnectorHealth, GitHubConnector } from "../types.js";
import { withRetry } from "../shared/retry.js";

/**
 * Real GitHub connector using the GitHub REST API via @octokit/rest.
 */
export class LiveGitHubConnector implements GitHubConnector {
  private octokit: import("@octokit/rest").Octokit | undefined;
  private readonly token: string;

  constructor(config: GitHubConfig) {
    this.token = config.token;
  }

  private async getOctokit(): Promise<import("@octokit/rest").Octokit> {
    if (!this.octokit) {
      const { Octokit } = await import("@octokit/rest");
      this.octokit = new Octokit({ auth: this.token });
    }
    return this.octokit;
  }

  private parseRepo(repo: string): { owner: string; repo: string } {
    const parts = repo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repo format "${repo}". Expected "owner/repo".`);
    }
    return { owner: parts[0], repo: parts[1] };
  }

  async listRepositories(): Promise<
    Array<{
      id: string;
      label: string;
      description?: string;
      url?: string;
    }>
  > {
    const octokit = await this.getOctokit();

    return withRetry(async () => {
      const { data } = await octokit.repos.listForAuthenticatedUser({
        per_page: 20,
        sort: "updated",
      });

      return data.map((repository) => ({
        id: repository.full_name,
        label: repository.full_name,
        description: repository.private
          ? "Private repository"
          : "Public repository",
        url: repository.html_url,
      }));
    });
  }

  async findRelevantFiles(repo: string, issueKey: string): Promise<string[]> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const octokit = await this.getOctokit();

    return withRetry(async () => {
      try {
        const { data } = await octokit.search.code({
          q: `${issueKey} repo:${owner}/${repoName}`,
          per_page: 20,
        });

        return data.items.map((item) => item.path);
      } catch {
        // Search API may not be available for all repos; fall back to empty
        return [];
      }
    });
  }

  async getRepoTree(repo: string, ref = "HEAD"): Promise<RepoTreeEntry[]> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const octokit = await this.getOctokit();

    return withRetry(async () => {
      const { data } = await octokit.git.getTree({
        owner,
        repo: repoName,
        tree_sha: ref,
        recursive: "1",
      });

      return data.tree
        .filter((entry) => entry.path && entry.type && entry.sha)
        .map((entry) => ({
          path: entry.path!,
          type: entry.type === "tree" ? ("tree" as const) : ("blob" as const),
          sha: entry.sha!,
          size: entry.size,
        }));
    });
  }

  async getFileContent(
    repo: string,
    path: string,
    ref = "HEAD",
  ): Promise<string> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const octokit = await this.getOctokit();

    return withRetry(async () => {
      const { data } = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path,
        ref,
      });

      if ("content" in data && data.encoding === "base64") {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }

      throw new Error(`Unexpected content response for ${path}`);
    });
  }

  async searchCode(repo: string, query: string): Promise<CodeSearchResult[]> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const octokit = await this.getOctokit();

    return withRetry(async () => {
      const { data } = await octokit.search.code({
        q: `${query} repo:${owner}/${repoName}`,
        per_page: 20,
      });

      return data.items.map((item) => ({
        path: item.path,
        repository: item.repository.full_name,
        url: item.html_url,
        snippet:
          item.text_matches
            ?.map((m) => m.fragment)
            .filter(Boolean)
            .join("\n") ?? "",
      }));
    });
  }

  async createBranch(
    repo: string,
    branchName: string,
    fromRef = "main",
  ): Promise<{ ref: string }> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const octokit = await this.getOctokit();

    const { data: refData } = await octokit.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${fromRef}`,
    });

    await octokit.git.createRef({
      owner,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });

    return { ref: `refs/heads/${branchName}` };
  }

  async openPullRequest(
    repo: string,
    input: {
      title: string;
      body: string;
      head: string;
      base: string;
    },
  ): Promise<{ url: string; number: number }> {
    const { owner, repo: repoName } = this.parseRepo(repo);
    const octokit = await this.getOctokit();

    const { data } = await octokit.pulls.create({
      owner,
      repo: repoName,
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
    });

    return { url: data.html_url, number: data.number };
  }

  async getHealth(): Promise<ConnectorHealth> {
    try {
      const octokit = await this.getOctokit();
      const { data } = await octokit.users.getAuthenticated();
      return {
        provider: "github",
        status: "ready",
        message: `Connected as ${data.login}.`,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: "github",
        status: "degraded",
        message:
          error instanceof Error ? error.message : "Unknown GitHub error.",
        lastCheckedAt: new Date().toISOString(),
      };
    }
  }
}
