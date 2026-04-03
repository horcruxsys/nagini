import { randomUUID } from "node:crypto";

import type {
  ContextCitation,
  ContextPack,
  DocumentChunk,
  RetrievalRequest,
  SourceDocument,
  WorkItem,
} from "@horcruxsys/nagini/domain";
import type { KnowledgeRepository } from "@horcruxsys/nagini/persistence";

export interface BuildContextPackInput {
  projectId: string;
  workItem: WorkItem;
  citations: ContextCitation[];
  repoHints: string[];
}

export interface KnowledgeService {
  ingestDocuments(projectId: string, documents: SourceDocument[]): Promise<number>;
  retrieve(request: RetrievalRequest): Promise<ContextCitation[]>;
  createContextPack(input: BuildContextPackInput): Promise<ContextPack>;
}

export function chunkDocument(
  document: SourceDocument,
  maxChunkLength = 1000,
): DocumentChunk[] {
  const body = document.bodyText || document.bodyMarkdown || "";
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
  const chunks: DocumentChunk[] = [];

  let current = "";
  let index = 0;

  const flush = () => {
    const text = current.trim();
    if (!text) return;
    chunks.push({
      id: `${document.id}-chunk-${index}`,
      documentId: document.id,
      chunkIndex: index,
      headingPath: [document.title],
      tokenCount: text.split(/\s+/).filter(Boolean).length,
      text,
      keywords: `${document.title} ${(document.labels ?? []).join(" ")}`,
      metadata: {
        provider: document.provider,
        url: document.url,
        updatedAt: document.updatedAt,
      },
    });
    index += 1;
    current = "";
  };

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > maxChunkLength && current) {
      flush();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();

  if (chunks.length === 0 && body.trim()) {
    chunks.push({
      id: `${document.id}-chunk-0`,
      documentId: document.id,
      chunkIndex: 0,
      headingPath: [document.title],
      tokenCount: body.split(/\s+/).filter(Boolean).length,
      text: body.trim(),
      keywords: `${document.title} ${(document.labels ?? []).join(" ")}`,
      metadata: {
        provider: document.provider,
        url: document.url,
        updatedAt: document.updatedAt,
      },
    });
  }

  return chunks;
}

function dedupeCitations(citations: ContextCitation[]): ContextCitation[] {
  const seen = new Set<string>();
  const result: ContextCitation[] = [];

  for (const citation of citations.sort((a, b) => b.score - a.score)) {
    const key = `${citation.source}:${citation.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(citation);
  }

  return result;
}

export class HybridKnowledgeService implements KnowledgeService {
  constructor(private readonly store?: KnowledgeRepository) {}

  async ingestDocuments(
    projectId: string,
    documents: SourceDocument[],
  ): Promise<number> {
    if (!this.store || documents.length === 0) {
      return 0;
    }

    await this.store.ensureSchema();

    for (const document of documents) {
      const normalizedDocument: SourceDocument = {
        ...document,
        projectId,
        id: document.id || randomUUID(),
      };
      await this.store.upsertDocument(normalizedDocument);
      await this.store.replaceChunks(
        normalizedDocument.id,
        chunkDocument(normalizedDocument),
      );
    }

    return documents.length;
  }

  async retrieve(request: RetrievalRequest): Promise<ContextCitation[]> {
    if (!this.store) {
      return [];
    }

    const results = await this.store.searchChunks(request);

    return results.map((result, index) => ({
      id: result.chunk.id,
      source: (result.chunk.metadata.provider as "jira" | "confluence" | "repo") ?? "repo",
      title: result.chunk.headingPath.join(" › ") || `Chunk ${index + 1}`,
      url: String(result.chunk.metadata.url ?? ""),
      snippet: result.chunk.text.slice(0, 320),
      score: result.score,
      updatedAt: String(
        result.chunk.metadata.updatedAt ?? new Date().toISOString(),
      ),
    }));
  }

  async createContextPack(input: BuildContextPackInput): Promise<ContextPack> {
    const { projectId, workItem, citations, repoHints } = input;
    const retrieved = await this.retrieve({
      projectId,
      intent: "implement",
      issueKey: workItem.key,
      textQuery: `${workItem.title} ${workItem.description}`,
      relatedTerms: [...workItem.labels, ...workItem.acceptanceCriteria],
      repoHints,
      topK: 8,
    });

    const mergedCitations = dedupeCitations([...citations, ...retrieved]).slice(
      0,
      12,
    );
    const assumptions = [
      "The repo already contains the baseline app and package structure.",
      "External credentials are optional; when absent, stub behavior remains available.",
    ];

    if (mergedCitations.length === 0) {
      assumptions.push("No indexed knowledge was found yet, so the ticket itself is the main source of truth.");
    }

    return {
      issueKey: workItem.key,
      summary: `${workItem.title}: ${workItem.description}`,
      requirements:
        workItem.acceptanceCriteria.length > 0
          ? workItem.acceptanceCriteria
          : ["Clarify acceptance criteria with stakeholders before merge."],
      assumptions,
      constraints: [
        "All generated outputs must remain auditable.",
        "Validation evidence is required before marking a run complete.",
        "Retrieved context must remain citation-backed and project-scoped.",
      ],
      impactedAreas: [...new Set(repoHints)],
      citations: mergedCitations,
      unresolvedQuestions:
        workItem.acceptanceCriteria.length > 0
          ? [
              "Which actions should require mandatory human approval in the target environment?",
            ]
          : ["Acceptance criteria are missing in Jira and should be confirmed."],
    };
  }
}

export class StaticKnowledgeService extends HybridKnowledgeService {
  constructor() {
    super(undefined);
  }
}
