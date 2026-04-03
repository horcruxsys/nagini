# Low-Level Design — Connectors and Ingestion Subsystem

## 1. Purpose

This subsystem connects the orchestrator to **GitHub**, **Jira**, and **Confluence**, normalizes the returned content, and keeps the knowledge store updated through scheduled sync and event-driven refresh.

---

## 2. Responsibilities

1. authenticate against external systems,
2. fetch source objects and metadata,
3. normalize them into canonical internal models,
4. persist raw copies for audit/debugging,
5. split and enrich retrievable text,
6. embed and index chunks,
7. maintain incremental sync checkpoints.

---

## 3. Package Layout

```text
packages/connectors/
  src/
    github/
      client.ts
      repo-reader.ts
      pr-writer.ts
      schema.ts
    jira/
      client.ts
      issue-reader.ts
      schema.ts
    confluence/
      client.ts
      page-reader.ts
      schema.ts
    shared/
      auth.ts
      retry.ts
      rate-limit.ts
      canonicalize.ts
```

---

## 4. Canonical Models

```ts
export interface ProjectConnection {
  id: string;
  projectId: string;
  provider: "github" | "jira" | "confluence";
  authType: "oauth" | "app" | "token" | "mcp";
  status: "active" | "error" | "disabled";
  externalBaseUrl?: string;
  scopes: string[];
  encryptedSecretRef: string;
  lastSuccessfulSyncAt?: string;
}

export interface SourceDocument {
  id: string;
  provider: "jira" | "confluence" | "repo";
  externalId: string;
  title: string;
  bodyMarkdown: string;
  bodyText: string;
  url: string;
  author?: string;
  labels: string[];
  aclPrincipals: string[];
  checksum: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}
```

---

## 5. Database Design

### Tables

#### `project_connections`

| Column         | Type        | Notes                         |
| -------------- | ----------- | ----------------------------- |
| `id`           | uuid pk     | internal ID                   |
| `project_id`   | uuid        | tenant/project scope          |
| `provider`     | text        | github/jira/confluence        |
| `auth_type`    | text        | oauth/app/token/mcp           |
| `secret_ref`   | text        | secret manager reference      |
| `config_json`  | jsonb       | host, project key, space keys |
| `status`       | text        | active/error/disabled         |
| `last_sync_at` | timestamptz | checkpoint                    |

#### `source_documents`

| Column           | Type        | Notes                      |
| ---------------- | ----------- | -------------------------- |
| `id`             | uuid pk     | internal document ID       |
| `project_id`     | uuid        | tenant/project scope       |
| `provider`       | text        | jira/confluence/repo       |
| `external_id`    | text        | original ID                |
| `title`          | text        | display title              |
| `body_markdown`  | text        | normalized markdown        |
| `body_text`      | text        | cleaned plain text         |
| `url`            | text        | deep link                  |
| `checksum`       | text        | for idempotent updates     |
| `acl_principals` | jsonb       | permission filter list     |
| `metadata`       | jsonb       | space, labels, issue links |
| `updated_at`     | timestamptz | source update time         |

#### `document_chunks`

| Column         | Type     | Notes                |
| -------------- | -------- | -------------------- |
| `id`           | uuid pk  | chunk ID             |
| `document_id`  | uuid fk  | parent doc           |
| `chunk_index`  | int      | ordering             |
| `heading_path` | text[]   | section hierarchy    |
| `token_count`  | int      | chunk size           |
| `text`         | text     | retrievable content  |
| `embedding`    | vector   | pgvector embedding   |
| `keywords`     | tsvector | BM25/keyword search  |
| `metadata`     | jsonb    | freshness, tags, ACL |

#### `sync_jobs`

| Column         | Type        | Notes                           |
| -------------- | ----------- | ------------------------------- |
| `id`           | uuid pk     | job ID                          |
| `provider`     | text        | source                          |
| `scope_key`    | text        | repo/project/space              |
| `mode`         | text        | full/incremental/webhook        |
| `status`       | text        | queued/running/succeeded/failed |
| `started_at`   | timestamptz | lifecycle                       |
| `finished_at`  | timestamptz | lifecycle                       |
| `cursor_state` | jsonb       | pagination/checkpoint           |
| `error_text`   | text        | failure details                 |

---

## 6. Connector Behavior

### 6.1 GitHub connector

Use cases:

- repo tree inspection,
- file retrieval,
- branch/commit/PR operations,
- issue or PR comment posting.

Preferred access:

- **GitHub MCP** for repo understanding and tool usage,
- **GitHub App** or API token for reliable branch/PR writes.

Main methods:

```ts
interface GitHubConnector {
  getRepoTree(repo: string, ref?: string): Promise<RepoTree>;
  getFile(repo: string, path: string, ref?: string): Promise<string>;
  searchCode(repo: string, query: string): Promise<SearchResult[]>;
  createBranch(input: CreateBranchInput): Promise<{ ref: string }>;
  commitFiles(input: CommitFilesInput): Promise<{ sha: string }>;
  openPullRequest(input: OpenPRInput): Promise<{ url: string; number: number }>;
}
```

### 6.2 Jira connector

Responsibilities:

- fetch issue core fields,
- fetch comments, links, attachments metadata,
- map custom fields to acceptance criteria when configured.

Normalization rules:

- description → markdown/plain text,
- comments sorted ascending by creation time,
- linked issues stored as typed relations,
- sprint/epic metadata stored in `metadata`.

### 6.3 Confluence connector

Responsibilities:

- fetch page content, descendants, labels, comments,
- extract headings and structured sections,
- resolve page history version and last modified info.

Normalization rules:

- convert storage format / HTML to markdown,
- preserve heading hierarchy,
- remove nav/footer noise,
- store source URL and space metadata.

---

## 7. Sync Modes

### Full sync

Use when a new connection is added.

Algorithm:

1. list all relevant spaces/projects/repos,
2. page through source objects,
3. normalize each object,
4. compare checksum,
5. upsert raw document,
6. chunk + embed changed content only,
7. update checkpoint and metrics.

### Incremental sync

Use every N minutes or via scheduler.

Input:

- `updated_after` cursor,
- `last_successful_sync_at` timestamp,
- provider-specific continuation token.

### Webhook refresh

Use for fast response to changes.
Examples:

- Jira issue updated,
- Confluence page edited,
- GitHub PR merged or new commit pushed.

---

## 8. Chunking Strategy

### Goals

- preserve section semantics,
- prevent giant noisy chunks,
- improve citation quality.

### Recommended algorithm

1. convert source to markdown,
2. split by heading boundaries first,
3. within a section, target **300–700 tokens**,
4. apply **10–15% overlap** only within the same section,
5. attach metadata:
   - provider,
   - page title,
   - heading path,
   - labels,
   - last updated timestamp,
   - ACL principals,
   - related issue keys.

### Pseudocode

```ts
function buildChunks(doc: SourceDocument): Chunk[] {
  const sections = splitByHeadings(doc.bodyMarkdown);
  return sections.flatMap((section, idx) =>
    windowByTokenCount(section.text, 500, 60).map((chunkText, cIdx) => ({
      documentId: doc.id,
      chunkIndex: Number(`${idx}${cIdx}`),
      text: chunkText,
      headingPath: section.headingPath,
      metadata: {
        provider: doc.provider,
        labels: doc.labels,
        aclPrincipals: doc.aclPrincipals,
        updatedAt: doc.updatedAt,
      },
    })),
  );
}
```

---

## 9. Embedding and Indexing Pipeline

### Pipeline stages

1. `DocumentChanged` event emitted
2. `ChunkBuilder` creates logical chunks
3. `EmbeddingWorker` generates vector embeddings
4. `KeywordIndexer` updates BM25/tsvector search fields
5. `ChunkUpserter` stores in `document_chunks`
6. `IndexStatsUpdater` records counts and freshness

### Implementation notes

- version embeddings using `embedding_model_version`,
- support background re-embedding when models change,
- never block run-time retrieval on full backfills.

---

## 10. Rate Limits and Retries

### Retry policy

- retryable errors: 429, 5xx, network timeout
- strategy: exponential backoff with jitter
- cap: 5 attempts

### Idempotency

Every sync write path should use a deterministic idempotency key:

```text
provider + external_id + checksum
```

This prevents duplicate ingestion when the same webhook or job is replayed.

---

## 11. Permissions and ACL Filtering

Each document and chunk must carry an ACL projection such as:

```json
{
  "visibility": "project",
  "principals": ["team-platform", "eng-manager-42"],
  "spaceKey": "CDX",
  "projectKey": "CDX"
}
```

Retrieval queries must filter by the caller's effective principals **before** reranking and response generation.

---

## 12. Operational Interfaces

### Internal APIs

- `POST /internal/sync/:provider`
- `GET /internal/sync-jobs/:id`
- `POST /internal/webhooks/jira`
- `POST /internal/webhooks/confluence`
- `POST /internal/webhooks/github`

### Events

- `ConnectionCreated`
- `SyncRequested`
- `DocumentUpserted`
- `DocumentChunked`
- `IndexUpdated`
- `SyncFailed`

---

## 13. Failure Scenarios

| Scenario                         | Handling                                                              |
| -------------------------------- | --------------------------------------------------------------------- |
| OAuth token expired              | refresh; if refresh fails mark connection `error`                     |
| Source object deleted            | mark document inactive and exclude from retrieval                     |
| Chunking crash on malformed HTML | store raw payload for debugging and skip with warning                 |
| Embedding service unavailable    | queue retry and retain source document without vector until recovered |

---

## 14. Implementation Checklist

1. create shared connector interface and error types,
2. implement Jira reader and issue normalization,
3. implement Confluence page reader and markdown conversion,
4. implement GitHub repo reader and PR helper,
5. add sync scheduler + webhook handlers,
6. create `source_documents`, `document_chunks`, `sync_jobs` tables,
7. implement chunking + embedding workers,
8. add per-connection health dashboard and metrics.
