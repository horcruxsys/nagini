import type { JiraConfig } from "@horcruxsys/nagini/config";
import type { SourceDocument, WorkItem } from "@horcruxsys/nagini/domain";
import type { ConnectorHealth, JiraConnector } from "../types.js";
import { htmlToMarkdown, stripHtml } from "../shared/canonicalize.js";
import { assertOk, withRetry } from "../shared/retry.js";

interface JiraIssueFields {
  summary?: string;
  description?: unknown;
  labels?: string[];
  updated?: string;
  creator?: { displayName?: string };
  priority?: { name?: string };
  status?: { name?: string };
  issuetype?: { name?: string };
  comment?: {
    comments?: Array<{
      author?: { displayName?: string };
      body?: unknown;
      created?: string;
    }>;
  };
  issuelinks?: Array<{
    outwardIssue?: { key?: string };
    inwardIssue?: { key?: string };
  }>;
  [key: string]: unknown;
}

interface JiraIssueResponse {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export class LiveJiraConnector implements JiraConnector {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  async getWorkItem(issueKey: string): Promise<WorkItem> {
    const issue = await this.fetchIssue(issueKey);
    const fields = issue.fields;
    const descriptionText = this.adfToText(fields.description);

    const comments = (fields.comment?.comments ?? []).map((comment) => ({
      author: comment.author?.displayName ?? "unknown",
      body: this.adfToText(comment.body),
      createdAt: comment.created ?? new Date().toISOString(),
    }));

    const acceptanceCriteria = this.extractAcceptanceCriteria(
      descriptionText,
      fields,
    );

    const confluenceLinks = (fields.issuelinks ?? [])
      .map((link) => link.outwardIssue?.key ?? link.inwardIssue?.key)
      .filter((value): value is string => Boolean(value));

    return {
      key: issueKey,
      title: fields.summary ?? issueKey,
      description: htmlToMarkdown(descriptionText),
      acceptanceCriteria,
      comments,
      links: {
        confluencePageIds: confluenceLinks,
        repoIds: [],
      },
      priority: fields.priority?.name,
      labels: fields.labels ?? [],
    };
  }

  async listProjects(): Promise<
    Array<{
      id: string;
      label: string;
      description?: string;
      url?: string;
    }>
  > {
    return withRetry(async () => {
      const response = await fetch(
        `${this.baseUrl}/rest/api/3/project/search?maxResults=20`,
        {
          headers: this.headers,
        },
      );
      await assertOk("jira", response);
      const data = (await response.json()) as {
        values?: Array<{
          id?: string;
          key?: string;
          name?: string;
          self?: string;
          projectTypeKey?: string;
        }>;
      };

      return (data.values ?? []).map((project) => ({
        id: project.key ?? project.id ?? "unknown-project",
        label: [project.key, project.name].filter(Boolean).join(" · "),
        description: project.projectTypeKey
          ? `Type: ${project.projectTypeKey}`
          : undefined,
        url: project.self,
      }));
    });
  }

  async getIssueAsDocument(
    issueKey: string,
    projectId: string,
  ): Promise<SourceDocument> {
    const issue = await this.fetchIssue(issueKey);
    const fields = issue.fields;
    const descriptionText = this.adfToText(fields.description);

    return {
      id: issue.id,
      projectId,
      provider: "jira",
      externalId: issueKey,
      title: fields.summary ?? issueKey,
      bodyMarkdown: htmlToMarkdown(descriptionText),
      bodyText: stripHtml(descriptionText),
      url: `${this.baseUrl}/browse/${issueKey}`,
      author: fields.creator?.displayName,
      labels: fields.labels ?? [],
      aclPrincipals: [],
      checksum: fields.updated ?? "",
      updatedAt: fields.updated ?? new Date().toISOString(),
      metadata: {
        status: fields.status?.name,
        priority: fields.priority?.name,
        type: fields.issuetype?.name,
      },
    };
  }

  async getHealth(): Promise<ConnectorHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
        headers: this.headers,
      });
      return {
        provider: "jira",
        status: response.ok ? "ready" : "degraded",
        message: response.ok
          ? "Connected to Jira."
          : `Jira returned ${response.status}.`,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: "jira",
        status: "degraded",
        message: error instanceof Error ? error.message : "Unknown Jira error.",
        lastCheckedAt: new Date().toISOString(),
      };
    }
  }

  private async fetchIssue(issueKey: string): Promise<JiraIssueResponse> {
    return withRetry(async () => {
      const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?expand=renderedFields`;
      const response = await fetch(url, { headers: this.headers });
      await assertOk("jira", response);
      return (await response.json()) as JiraIssueResponse;
    });
  }

  private adfToText(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    const node = value as { type?: string; text?: string; content?: unknown[] };
    if (node.type === "text") {
      return node.text ?? "";
    }

    if (Array.isArray(node.content)) {
      return node.content.map((child) => this.adfToText(child)).join("");
    }

    return "";
  }

  private extractAcceptanceCriteria(
    description: string,
    fields: JiraIssueFields,
  ): string[] {
    const customAc = fields["customfield_10035"] ?? fields["customfield_10028"];
    if (typeof customAc === "string" && customAc.trim()) {
      return customAc
        .split(/\n/)
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
    }

    const text = stripHtml(description);
    const matches = text.match(/acceptance criteria[:\s]+([\s\S]*)/i)?.[1];
    if (!matches) {
      return [];
    }

    return matches
      .split(/\n|\r|[•-]\s+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
}
