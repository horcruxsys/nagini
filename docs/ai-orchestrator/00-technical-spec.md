# Technical Specification — AI Delivery Orchestrator

## 1. Objective

Build a **multi-agent engineering orchestrator** that accepts a command such as `implement CDX-739`, understands the requirement from **Jira**, retrieves design and discussion context from **Confluence**, inspects the target codebase through **GitHub MCP**, and coordinates a controlled implementation workflow that produces a tested code change and a pull request with evidence.

---

## 2. Problem Statement

Engineering teams lose time translating scattered knowledge into implementation work:

- requirements live in Jira,
- design rationale and past discussions live in Confluence,
- implementation truth lives in Git repositories,
- and engineers manually stitch them together before coding.

The orchestrator reduces this friction by turning a work item into a **grounded, auditable, implementation workflow**.

---

## 3. Product Goals

### Primary goals

1. **Understand work intent** from Jira issue details, comments, linked epics, and acceptance criteria.
2. **Retrieve design context** from Confluence and project documentation using RAG.
3. **Inspect the codebase** through GitHub MCP to locate impacted modules and patterns.
4. **Plan and execute** a multi-agent implementation loop with bounded retries.
5. **Validate output** using lint, type checks, tests, and acceptance criteria verification.
6. **Produce artifacts**: plan, code diff, test evidence, PR description, audit trail.

### Non-goals for MVP

- fully autonomous deployment to production,
- autonomous database migrations without approval,
- unsupervised merges to protected branches,
- unrestricted access across all company repos/spaces without ACL filtering.

---

## 4. Key Personas

| Persona          | Need                              | Outcome                                         |
| ---------------- | --------------------------------- | ----------------------------------------------- |
| Product engineer | Implement a Jira ticket faster    | Receives a grounded plan and draft PR           |
| Tech lead        | Review quality and architecture   | Sees cited rationale, diffs, risk notes         |
| EM / PM          | Track delivery progress           | Views execution status and audit trail          |
| Platform admin   | Manage integration and governance | Controls permissions, policy, and observability |

---

## 5. Core Use Cases

### UC-1: Explain a ticket

Input: `explain CDX-739`

Output:

- summarized requirement,
- acceptance criteria,
- relevant Confluence citations,
- impacted code areas,
- proposed implementation plan,
- open questions.

### UC-2: Implement a ticket

Input: `implement CDX-739`

Output:

- feature branch,
- implementation plan,
- code changes,
- tests and validation evidence,
- draft PR,
- failure summary or escalation if blocked.

### UC-3: Review an agent run

Input: run ID or PR link

Output:

- workflow timeline,
- tools called,
- documents cited,
- test results,
- reasoning summary,
- pending approvals.

---

## 6. Functional Requirements

### FR-1 Command intake

- System shall accept commands from web UI, API, and CLI.
- System shall parse intent types: `explain`, `plan`, `implement`, `review`, `retry`, `cancel`.

### FR-2 Jira understanding

- System shall fetch issue title, description, comments, acceptance criteria, linked issues, and metadata.
- System shall normalize Jira content into canonical `WorkItem` objects.

### FR-3 Confluence knowledge ingestion

- System shall ingest pages, sections, and comments from configured spaces.
- System shall chunk content, embed it, and store it with metadata and ACL tags.

### FR-4 Repo analysis

- System shall query repository structure, relevant files, history, and symbols through GitHub MCP or Git APIs.
- System shall identify likely impacted components and implementation patterns.

### FR-5 Multi-agent orchestration

- System shall run a bounded workflow of agents: analyst, planner, coder, reviewer, verifier.
- Each agent shall produce **structured outputs** validated against schemas.

### FR-6 Execution control

- System shall execute code changes in isolated workspaces or ephemeral runners.
- System shall support retries, checkpoints, cancellation, and resume.

### FR-7 Validation

- System shall run repository-defined checks such as `lint`, `check-types`, unit tests, and targeted integration tests.
- A task shall not be marked complete unless validation evidence is recorded.

### FR-8 Pull request creation

- System shall generate a branch and PR containing:
  - summary of changes,
  - Jira linkage,
  - retrieved Confluence citations,
  - validation results,
  - open risks/questions.

### FR-9 Governance

- System shall require human approval before final merge or high-risk actions.
- System shall record audit logs for every tool invocation and state transition.

---

## 7. Non-Functional Requirements

| Category      | Requirement                                                                           |
| ------------- | ------------------------------------------------------------------------------------- |
| Reliability   | Orchestration must resume after process restarts; no loss of job state                |
| Security      | All secrets stored in a managed secret store; least-privilege tokens only             |
| Auditability  | Every run stores event logs, citations, prompts, outputs, and evidence references     |
| Scalability   | System should support multiple concurrent runs per workspace/project                  |
| Latency       | `explain` requests should target < 30s; `implement` requests can be async and durable |
| Cost control  | Token budget, max loop count, and per-run cost thresholds must be enforced            |
| Accuracy      | Context responses must be citation-backed and permission filtered                     |
| Extensibility | New connectors and agent roles should be pluggable without core rewrites              |

---

## 8. Assumptions and Constraints

### Assumptions

- customer has Jira and Confluence APIs or MCP endpoints available,
- target codebase is accessible via GitHub MCP or GitHub App installation,
- repositories have runnable build/test commands,
- projects tolerate branch-based draft PR workflows.

### Constraints

- Confluence content can be noisy and stale,
- Jira tickets may be underspecified,
- repo-specific build/test commands vary significantly,
- agent output must remain bounded and verifiable.

---

## 9. Proposed Technology Stack

| Concern            | Choice                                                             | Why                                                   |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Monorepo           | `pnpm` + Turborepo                                                 | already matches current repo                          |
| UI                 | Next.js (`apps/web`)                                               | existing app can become operator console              |
| API/worker service | Node.js + TypeScript + Fastify                                     | fast, typed, simple service boundary                  |
| Durable workflows  | Temporal                                                           | strong support for retries, resume, timers, approvals |
| Agent graph        | LangGraph                                                          | explicit stateful multi-agent control                 |
| DB                 | PostgreSQL                                                         | system of record                                      |
| Vector search      | `pgvector` for MVP                                                 | simple ops and good enough at initial scale           |
| Queue/cache        | Redis                                                              | job fanout, caching, rate-limit coordination          |
| Observability      | OpenTelemetry + Langfuse/LangSmith-style traces                    | end-to-end agent and tool visibility                  |
| Validation runtime | isolated worker container / Firecracker / Codespaces-style sandbox | safer execution                                       |

---

## 10. Core Domain Model

### Main entities

- `ProjectConnection`
  - org-specific integration metadata
- `WorkItem`
  - normalized Jira issue
- `KnowledgeDocument`
  - raw Confluence/Jira/repo document
- `KnowledgeChunk`
  - embedded retrievable text chunk
- `Run`
  - one orchestration execution instance
- `Plan`
  - structured execution plan
- `TaskUnit`
  - atomic implementation task
- `Artifact`
  - generated output such as patch, test result, PR body
- `Approval`
  - human gate decisions

### Example TypeScript contracts

```ts
export type RunMode = "explain" | "plan" | "implement" | "review";

export interface WorkItem {
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  comments: Array<{ author: string; body: string; createdAt: string }>;
  links: { confluencePageIds: string[]; repoIds: string[] };
  priority?: string;
  labels: string[];
}

export interface ContextPack {
  workItem: WorkItem;
  retrievedDocs: Array<{
    id: string;
    source: "jira" | "confluence" | "repo";
    title: string;
    snippet: string;
    score: number;
    citation: string;
  }>;
  impactedFiles: string[];
  openQuestions: string[];
}
```

---

## 11. System Boundaries

### Inputs

- Jira issues and comments
- Confluence pages/comments
- GitHub repo structure and code context
- user commands and approvals

### Outputs

- context summaries,
- plans,
- patches and commits,
- test evidence,
- PRs,
- audit records and metrics.

---

## 12. Success Metrics

| Metric                             | Target                                         |
| ---------------------------------- | ---------------------------------------------- |
| Plan usefulness rating             | > 80% positive from engineers                  |
| Draft PR acceptance rate           | > 60% with small edits                         |
| Ticket context retrieval precision | > 85% relevant top-10 chunks                   |
| Time to first actionable plan      | < 2 minutes                                    |
| End-to-end draft PR for small task | < 20 minutes median                            |
| Evidence completeness              | 100% of runs store citations + validation logs |

---

## 13. Delivery Phases

### Phase 1 — Read-only assistant

- Jira + Confluence ingestion
- repo context analysis
- `explain` and `plan` commands only

### Phase 2 — Assisted implementation

- branch creation
- code generation loop
- tests + draft PR

### Phase 3 — Operational maturity

- policy engine
- deeper evals
- project templates
- deployment and incident integrations

---

## 14. Risks and Mitigations

| Risk                                          | Mitigation                                             |
| --------------------------------------------- | ------------------------------------------------------ |
| Retrieval returns stale or irrelevant context | hybrid search, reranking, freshness bias, citations    |
| Agents loop endlessly                         | hard retry caps, budget caps, explicit stop conditions |
| Unsafe code changes                           | sandbox execution, test gates, approval gates          |
| Connector rate limits                         | caching, incremental sync, backoff, webhooks           |
| Poor ticket quality                           | clarification prompts and “blocked” escalation state   |

---

## 15. Definition of Done for MVP

A run triggered with `implement CDX-739` is considered successful only if it produces:

1. a normalized work item,
2. a cited context pack,
3. a structured plan,
4. code changes on a feature branch,
5. fresh validation evidence from repo commands,
6. a draft PR linked back to Jira,
7. an audit trail with all major state transitions.
