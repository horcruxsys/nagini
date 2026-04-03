import { randomUUID } from "node:crypto";

import type { PostgresConfig } from "@horcruxsys/nagini/config";
import type {
  DocumentChunk,
  RetrievalRequest,
  RunRecord,
  ScoredChunk,
  SourceDocument,
} from "@horcruxsys/nagini/domain";
import { Pool } from "pg";

export interface RunRepository {
  saveRun(run: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | undefined>;
  listRuns(): Promise<RunRecord[]>;
}

export interface KnowledgeRepository {
  ensureSchema(): Promise<void>;
  upsertDocument(document: SourceDocument): Promise<void>;
  replaceChunks(documentId: string, chunks: DocumentChunk[]): Promise<void>;
  searchChunks(request: RetrievalRequest): Promise<ScoredChunk[]>;
}

export interface PersistenceLayer extends RunRepository, KnowledgeRepository {
  readonly kind: "memory" | "postgres";
}

export class InMemoryPersistence implements PersistenceLayer {
  readonly kind = "memory" as const;
  private readonly runs = new Map<string, RunRecord>();
  private readonly documents = new Map<string, SourceDocument>();
  private readonly chunks = new Map<string, DocumentChunk[]>();

  async ensureSchema(): Promise<void> {
    // no-op
  }

  async saveRun(run: RunRecord): Promise<void> {
    this.runs.set(run.id, run);
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(runId);
  }

  async listRuns(): Promise<RunRecord[]> {
    return [...this.runs.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async upsertDocument(document: SourceDocument): Promise<void> {
    this.documents.set(document.id, document);
  }

  async replaceChunks(
    documentId: string,
    chunks: DocumentChunk[],
  ): Promise<void> {
    this.chunks.set(documentId, chunks);
  }

  async searchChunks(request: RetrievalRequest): Promise<ScoredChunk[]> {
    const queryTerms = [
      request.issueKey,
      request.textQuery,
      ...request.relatedTerms,
    ]
      .join(" ")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const results: ScoredChunk[] = [];

    for (const [documentId, chunks] of this.chunks.entries()) {
      const doc = this.documents.get(documentId);
      if (!doc || doc.projectId !== request.projectId) continue;

      for (const chunk of chunks) {
        const haystack = `${doc.title} ${chunk.text}`.toLowerCase();
        const matches = queryTerms.filter((term) =>
          haystack.includes(term),
        ).length;
        if (matches > 0) {
          results.push({
            chunk,
            score: Math.min(1, matches / Math.max(queryTerms.length, 1)),
            source: "hybrid",
          });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, request.topK);
  }
}

export class PostgresPersistence implements PersistenceLayer {
  readonly kind = "postgres" as const;
  private readonly pool: Pool;
  private schemaEnsured = false;

  constructor(config: PostgresConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl:
        config.ssl === "disable"
          ? false
          : {
              rejectUnauthorized: false,
            },
    });
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;

    await this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orchestration_runs (
        id text PRIMARY KEY,
        project_id text NOT NULL,
        issue_key text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        run_json jsonb NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS source_documents (
        id text PRIMARY KEY,
        project_id text NOT NULL,
        provider text NOT NULL,
        external_id text NOT NULL,
        title text NOT NULL,
        body_markdown text NOT NULL,
        body_text text NOT NULL,
        url text NOT NULL,
        author text,
        labels jsonb NOT NULL DEFAULT '[]'::jsonb,
        acl_principals jsonb NOT NULL DEFAULT '[]'::jsonb,
        checksum text NOT NULL,
        updated_at timestamptz NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id text PRIMARY KEY,
        document_id text NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
        chunk_index integer NOT NULL,
        heading_path jsonb NOT NULL DEFAULT '[]'::jsonb,
        token_count integer NOT NULL,
        text text NOT NULL,
        keywords tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_runs_project_created ON orchestration_runs(project_id, created_at DESC);`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_source_documents_project ON source_documents(project_id, provider);`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_document_chunks_keywords ON document_chunks USING GIN(keywords);`,
    );

    this.schemaEnsured = true;
  }

  async saveRun(run: RunRecord): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO orchestration_runs (id, project_id, issue_key, status, created_at, updated_at, run_json)
      VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::jsonb)
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          run_json = EXCLUDED.run_json
      `,
      [
        run.id,
        run.projectId,
        run.issueKey,
        run.status,
        run.createdAt,
        run.updatedAt,
        JSON.stringify(run),
      ],
    );
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    await this.ensureSchema();
    const result = await this.pool.query<{ run_json: RunRecord }>(
      `SELECT run_json FROM orchestration_runs WHERE id = $1`,
      [runId],
    );
    return result.rows[0]?.run_json;
  }

  async listRuns(): Promise<RunRecord[]> {
    await this.ensureSchema();
    const result = await this.pool.query<{ run_json: RunRecord }>(
      `SELECT run_json FROM orchestration_runs ORDER BY created_at DESC LIMIT 100`,
    );
    return result.rows.map((row: { run_json: RunRecord }) => row.run_json);
  }

  async upsertDocument(document: SourceDocument): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `
      INSERT INTO source_documents (
        id, project_id, provider, external_id, title, body_markdown, body_text,
        url, author, labels, acl_principals, checksum, updated_at, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10::jsonb, $11::jsonb, $12, $13::timestamptz, $14::jsonb
      )
      ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          body_markdown = EXCLUDED.body_markdown,
          body_text = EXCLUDED.body_text,
          url = EXCLUDED.url,
          author = EXCLUDED.author,
          labels = EXCLUDED.labels,
          acl_principals = EXCLUDED.acl_principals,
          checksum = EXCLUDED.checksum,
          updated_at = EXCLUDED.updated_at,
          metadata = EXCLUDED.metadata
      `,
      [
        document.id,
        document.projectId,
        document.provider,
        document.externalId,
        document.title,
        document.bodyMarkdown,
        document.bodyText,
        document.url,
        document.author ?? null,
        JSON.stringify(document.labels),
        JSON.stringify(document.aclPrincipals),
        document.checksum,
        document.updatedAt,
        JSON.stringify(document.metadata),
      ],
    );
  }

  async replaceChunks(
    documentId: string,
    chunks: DocumentChunk[],
  ): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM document_chunks WHERE document_id = $1`, [
        documentId,
      ]);
      for (const chunk of chunks) {
        await client.query(
          `
          INSERT INTO document_chunks (id, document_id, chunk_index, heading_path, token_count, text, metadata)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb)
          `,
          [
            chunk.id || randomUUID(),
            documentId,
            chunk.chunkIndex,
            JSON.stringify(chunk.headingPath),
            chunk.tokenCount,
            chunk.text,
            JSON.stringify(chunk.metadata),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async searchChunks(request: RetrievalRequest): Promise<ScoredChunk[]> {
    await this.ensureSchema();
    const queryText = [
      request.issueKey,
      request.textQuery,
      ...request.relatedTerms,
    ]
      .filter(Boolean)
      .join(" ");

    const result = await this.pool.query<{
      id: string;
      document_id: string;
      chunk_index: number;
      heading_path: string[];
      text: string;
      metadata: Record<string, unknown>;
      score: number;
    }>(
      `
      SELECT dc.id, dc.document_id, dc.chunk_index, dc.heading_path, dc.text, dc.metadata,
             ts_rank_cd(dc.keywords, plainto_tsquery('simple', $2)) AS score
      FROM document_chunks dc
      JOIN source_documents sd ON sd.id = dc.document_id
      WHERE sd.project_id = $1
        AND dc.keywords @@ plainto_tsquery('simple', $2)
      ORDER BY score DESC, sd.updated_at DESC
      LIMIT $3
      `,
      [request.projectId, queryText || request.issueKey, request.topK],
    );

    return result.rows.map(
      (row: {
        id: string;
        document_id: string;
        chunk_index: number;
        heading_path: string[];
        text: string;
        metadata: Record<string, unknown>;
        score: number;
      }) => ({
        chunk: {
          id: row.id,
          documentId: row.document_id,
          chunkIndex: row.chunk_index,
          headingPath: row.heading_path ?? [],
          tokenCount: row.text.split(/\s+/).filter(Boolean).length,
          text: row.text,
          keywords: queryText,
          metadata: row.metadata ?? {},
        },
        score: Number(row.score) || 0,
        source: "bm25",
      }),
    );
  }
}

export function createPersistenceLayer(
  config?: PostgresConfig,
): PersistenceLayer {
  return config ? new PostgresPersistence(config) : new InMemoryPersistence();
}
