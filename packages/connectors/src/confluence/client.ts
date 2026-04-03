import type { ConfluenceConfig } from "@horcruxsys/nagini/config";
import type {
  ContextCitation,
  SourceDocument,
} from "@horcruxsys/nagini/domain";
import type { ConfluenceConnector, ConnectorHealth } from "../types.js";
import { htmlToMarkdown, stripHtml } from "../shared/canonicalize.js";
import { assertOk, withRetry } from "../shared/retry.js";

interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  _links: { webui: string; base?: string };
  body?: { storage?: { value: string } };
  version?: { when: string; number: number; by?: { displayName: string } };
  metadata?: { labels?: { results: Array<{ name: string }> } };
}

export class LiveConfluenceConnector implements ConfluenceConnector {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: ConfluenceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`,
      Accept: "application/json",
    };
  }

  async getRelatedPages(issueKey: string): Promise<ContextCitation[]> {
    const cqlQuery = `text ~ "${issueKey}" OR title ~ "${issueKey}"`;
    const pages = await this.searchPages(cqlQuery, 10);

    return pages.map((page, index): ContextCitation => {
      const bodyHtml = page.body?.storage?.value ?? "";
      const snippet = stripHtml(bodyHtml).slice(0, 300);

      return {
        id: `confluence-${page.id}`,
        source: "confluence",
        title: page.title,
        url: `${this.baseUrl}${page._links.webui}`,
        snippet,
        score: 1 - index * 0.05,
        updatedAt: page.version?.when ?? new Date().toISOString(),
      };
    });
  }

  async getPageAsDocument(
    pageId: string,
    projectId: string,
  ): Promise<SourceDocument> {
    const page = await this.fetchPage(pageId);
    const bodyHtml = page.body?.storage?.value ?? "";

    return {
      id: page.id,
      projectId,
      provider: "confluence",
      externalId: page.id,
      title: page.title,
      bodyMarkdown: htmlToMarkdown(bodyHtml),
      bodyText: stripHtml(bodyHtml),
      url: `${this.baseUrl}${page._links.webui}`,
      author: page.version?.by?.displayName,
      labels: (page.metadata?.labels?.results ?? []).map((l) => l.name),
      aclPrincipals: [],
      checksum: String(page.version?.number ?? ""),
      updatedAt: page.version?.when ?? new Date().toISOString(),
      metadata: { status: page.status },
    };
  }

  async getHealth(): Promise<ConnectorHealth> {
    try {
      const response = await fetch(
        `${this.baseUrl}/wiki/rest/api/space?limit=1`,
        { headers: this.headers },
      );
      return {
        provider: "confluence",
        status: response.ok ? "ready" : "degraded",
        message: response.ok
          ? "Connected to Confluence."
          : `Confluence returned ${response.status}.`,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: "confluence",
        status: "degraded",
        message:
          error instanceof Error
            ? error.message
            : "Unknown Confluence error.",
        lastCheckedAt: new Date().toISOString(),
      };
    }
  }

  private async searchPages(
    cql: string,
    limit: number,
  ): Promise<ConfluencePage[]> {
    return withRetry(async () => {
      const url = `${this.baseUrl}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}&expand=body.storage,version,metadata.labels`;
      const response = await fetch(url, { headers: this.headers });
      await assertOk("confluence", response);
      const data = (await response.json()) as {
        results: ConfluencePage[];
      };
      return data.results;
    });
  }

  private async fetchPage(pageId: string): Promise<ConfluencePage> {
    return withRetry(async () => {
      const url = `${this.baseUrl}/wiki/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage,version,metadata.labels`;
      const response = await fetch(url, { headers: this.headers });
      await assertOk("confluence", response);
      return (await response.json()) as ConfluencePage;
    });
  }
}
