# AI Delivery Orchestrator Design Pack

This folder contains an implementation-ready architecture package for building a **multi-agent software delivery orchestrator** that can:

- connect to a customer repo through **GitHub MCP**,
- read work items from **Jira**,
- ingest historical and design context from **Confluence**,
- store retrievable knowledge in a **vector-enabled knowledge layer**,
- execute a controlled **plan → code → validate → review** loop,
- and open a **draft or ready PR** with evidence.

## Document map

1. `00-technical-spec.md`
   - product scope, requirements, constraints, architecture decisions, success metrics
2. `01-high-level-design.md`
   - system context, container architecture, deployment model, end-to-end workflow
3. `02-lld-connectors-ingestion.md`
   - GitHub/Jira/Confluence connectors, sync jobs, normalization, chunking, indexing
4. `03-lld-rag-knowledge.md`
   - retrieval pipeline, hybrid search, reranking, context pack builder, evaluation
5. `04-lld-orchestration-agent-runtime.md`
   - supervisor flow, agent contracts, workflow state machine, approvals, failure handling
6. `05-lld-execution-validation-pr.md`
   - sandbox execution, git operations, testing, review loop, PR generation
7. `06-lld-ui-api-auth-observability.md`
   - operator UI, APIs, RBAC, audit logs, telemetry, config and ops

## Recommended implementation inside this monorepo

```text
apps/
  web/                    # operator UI / console
  orchestrator/           # API + workflow workers
packages/
  domain/                 # shared types, zod schemas, contracts
  connectors/             # github/jira/confluence adapters
  knowledge/              # ingestion, chunking, embeddings, retrieval
  agents/                 # prompts, policies, structured outputs
  workflows/              # orchestration graphs and Temporal flows
  execution/              # sandbox, git, test, PR utilities
  observability/          # tracing, metrics, audit helpers
```

## Delivery recommendation

Build in **three phases**:

1. **Context-only mode** — `explain CDX-739`
2. **Draft PR mode** — `implement CDX-739` with human approval before PR ready
3. **Controlled autonomy** — bounded loops, stronger verification, optional deployment hooks

## Architecture principles

- **Human-governed autonomy**: agents can propose and execute, but merge/deploy stays gated.
- **Grounded generation**: plans and changes must cite Jira/Confluence/repo evidence.
- **Durable orchestration**: every long-running task is resumable and auditable.
- **Verification before completion**: no task is marked complete without fresh test/build evidence.
- **Least privilege**: connector tokens are scoped to the minimum required permissions.
