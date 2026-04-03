# Low-Level Design — RAG and Knowledge Subsystem

## 1. Purpose

This subsystem transforms stored source content into **high-quality, citation-backed context packs** used by the planner, coder, and reviewer agents. Its output must be relevant, permission-safe, fresh, and explainable.

---

## 2. Responsibilities

- parse the user intent and work item context,
- formulate retrieval queries,
- execute **hybrid search** over indexed knowledge,
- rerank candidate chunks,
- build a compact, citation-rich context pack,
- expose retrieval metrics and evaluation outputs.

---

## 3. Package Layout

```text
packages/knowledge/
  src/
    ingest/
    embeddings/
    hybrid-search/
    rerank/
    context-pack/
    evals/
    cache/
```

---

## 4. Retrieval Design Principles

1. **Hybrid search over vector-only** — enterprise text often depends on exact IDs, acronyms, and product names.
2. **Rerank before prompting** — fetch broader, then compress to the best evidence set.
3. **Citations are mandatory** — every answerable statement should point back to source evidence.
4. **Freshness matters** — newer updates should get a small rank boost.
5. **Permission filter first** — never retrieve content the user is not allowed to see.

---

## 5. Retrieval Inputs

A typical `implement CDX-739` query should generate retrieval context from:

- the issue key itself,
- normalized ticket title and summary,
- labels/component names,
- extracted domain nouns from description/comments,
- repo component names found by code analysis.

Example query object:

```ts
export interface RetrievalRequest {
  projectId: string;
  userId: string;
  intent: "plan" | "implement" | "review";
  issueKey: string;
  textQuery: string;
  relatedTerms: string[];
  repoHints?: string[];
  topK: number;
}
```

---

## 6. Retrieval Pipeline

### Step 1 — query formulation

Build multiple query forms:

- exact lexical query: `CDX-739 checkout idempotency`
- semantic query from summary/comments
- entity list: `billing`, `idempotency`, `retry`, `checkout-service`

### Step 2 — candidate fetch

Run in parallel:

- BM25 / keyword search over `tsvector` fields
- vector similarity search over chunk embeddings
- optional metadata-filtered fetch for linked page IDs or labels

### Step 3 — dedup and merge

- deduplicate by `document_id + heading_path`
- combine scores using weighted normalization

### Step 4 — rerank

Use a cross-encoder or higher-precision reranker model to reorder top 30–50 candidates.

### Step 5 — context pack assembly

Select top 8–15 chunks while maximizing:

- diversity across documents,
- direct relevance to the issue,
- recency,
- design-spec authority.

---

## 7. Ranking Formula

Illustrative score:

```text
final_score =
  (0.35 * bm25_score) +
  (0.35 * vector_score) +
  (0.20 * rerank_score) +
  (0.05 * freshness_boost) +
  (0.05 * authority_boost)
```

### Authority boost examples

- ADR / architecture docs > comments
- accepted design page > informal meeting notes
- linked issue page > unrelated page in same space

---

## 8. Context Pack Contract

```ts
export interface ContextCitation {
  chunkId: string;
  source: "jira" | "confluence" | "repo";
  title: string;
  url: string;
  snippet: string;
  score: number;
  updatedAt: string;
}

export interface ContextPack {
  issueKey: string;
  summary: string;
  requirements: string[];
  assumptions: string[];
  constraints: string[];
  impactedAreas: string[];
  citations: ContextCitation[];
  unresolvedQuestions: string[];
}
```

### Output quality requirements

- must contain 3–10 high-confidence citations,
- must separate **requirements** from **assumptions**,
- must list unresolved ambiguities when evidence is insufficient.

---

## 9. Context Compression Rules

Because LLM context is limited and expensive, context packs should be compressed using these rules:

1. include only the top evidence needed for the current step,
2. collapse duplicate chunks from the same section,
3. prefer authoritative docs over repeated commentary,
4. extract structured bullets for acceptance criteria and constraints,
5. store the full retrieval result separately for audit/debugging.

---

## 10. Repo-Aware Retrieval

Besides Confluence/Jira text, the knowledge subsystem should support repo-aware hints:

- file paths frequently mentioned with the issue component,
- symbols related to the component area,
- similar historical PR titles,
- recent commits touching the same directories.

This can be produced by a `CodeContextService` that passes `repoHints` into retrieval and into the planning prompt.

---

## 11. Service Interface

```ts
interface KnowledgeService {
  retrieve(request: RetrievalRequest): Promise<ContextPack>;
  searchRaw(request: RetrievalRequest): Promise<SearchCandidate[]>;
  evaluate(querySetId: string): Promise<EvalReport>;
}
```

### Internal API endpoints

- `POST /internal/knowledge/retrieve`
- `POST /internal/knowledge/search`
- `GET /internal/knowledge/documents/:id`

---

## 12. Example Retrieval Pseudocode

```ts
export async function retrieveContext(
  req: RetrievalRequest,
): Promise<ContextPack> {
  const lexicalQ = buildLexicalQuery(req);
  const semanticQ = buildSemanticQuery(req);

  const [bm25Hits, vectorHits, linkedHits] = await Promise.all([
    searchKeywordIndex(lexicalQ, req),
    searchVectorIndex(semanticQ, req),
    searchLinkedArtifacts(req.issueKey, req.projectId),
  ]);

  const merged = mergeAndNormalize([bm25Hits, vectorHits, linkedHits]);
  const filtered = applyAclFilter(merged, req.userId);
  const reranked = await rerankCandidates(filtered.slice(0, 50), req.textQuery);
  const citations = selectBestDiverseCitations(reranked, 12);

  return buildContextPack(req.issueKey, citations);
}
```

---

## 13. Caching Strategy

### What to cache

- normalized Jira work item summaries,
- recent retrieval results by `(issueKey, repoSha, mode)`,
- embedding requests for repeated identical text.

### Cache invalidation

Invalidate when:

- Jira issue updated,
- Confluence page version changes,
- default branch SHA changes materially for impacted paths,
- retrieval schema or scoring model version changes.

---

## 14. Evaluation Framework

### Offline eval set

Create a gold dataset with:

- ticket key,
- expected relevant Confluence pages,
- expected impacted components,
- acceptance criteria snippets.

### Metrics

| Metric              | Meaning                                                 |
| ------------------- | ------------------------------------------------------- |
| Precision@k         | % of top-k results that are relevant                    |
| Recall@k            | ability to surface all critical docs                    |
| Citation usefulness | human rating of whether citation helped decision making |
| Hallucination rate  | unsupported claims in generated plans                   |

### Continuous evaluation

- sample production runs,
- replay retrieval against historical tickets,
- compare with accepted PR outcomes.

---

## 15. Failure Handling

| Issue                        | Behavior                                          |
| ---------------------------- | ------------------------------------------------- |
| not enough relevant docs     | return sparse context pack + unresolved questions |
| conflicting documents        | cite both, prefer newer or authoritative source   |
| no permission to linked page | omit result and log ACL exclusion                 |
| embedding model drift        | re-embed asynchronously with version pinning      |

---

## 16. Implementation Checklist

1. implement keyword + vector indexes,
2. build merged ranking and rerank pipeline,
3. enforce ACL filtering at query time,
4. add context pack builder with citations,
5. create evaluation harness and seeded gold cases,
6. expose retrieval metrics dashboard.
