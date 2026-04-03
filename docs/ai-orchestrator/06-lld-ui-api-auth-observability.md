# Low-Level Design — UI, API, Auth, and Observability

## 1. Purpose

This subsystem gives users a usable product surface for triggering runs, reviewing progress, approving decisions, and auditing behavior. It also defines the service API, access control, and telemetry required to operate the orchestrator safely in production.

---

## 2. UI Design (`apps/web`)

### Main pages

#### `/`

- quick command box (`explain`, `plan`, `implement`)
- recent runs list
- connector health summary

#### `/runs/[runId]`

- live timeline of workflow steps,
- current status and state badge,
- retrieved citations,
- plan/tasks panel,
- diff summary,
- validation logs,
- approval actions.

#### `/projects/[projectId]/settings`

- GitHub/Jira/Confluence connections,
- sync status,
- policy settings,
- budgets and limits.

#### `/projects/[projectId]/knowledge`

- indexed docs view,
- search debug page,
- freshness and ACL diagnostics.

---

## 3. UI Component Breakdown

```text
apps/web/app/
  page.tsx                    # dashboard
  runs/[runId]/page.tsx       # run detail
  projects/[projectId]/
    settings/page.tsx
    knowledge/page.tsx

apps/web/components/
  command-bar.tsx
  run-status-card.tsx
  timeline-view.tsx
  citation-list.tsx
  validation-results.tsx
  approval-panel.tsx
  connection-health.tsx
```

### Key UI interactions

- submit a new run command,
- subscribe to live progress via SSE,
- approve/reject plan or risky change,
- inspect retrieved evidence and logs,
- retry blocked/failed runs.

---

## 4. API Design (`apps/orchestrator`)

### Public API endpoints

#### `POST /api/runs`

Create a new run.

Request:

```json
{
  "projectId": "proj_123",
  "mode": "implement",
  "issueKey": "CDX-739",
  "repo": "org/repo",
  "baseBranch": "main"
}
```

Response:

```json
{
  "runId": "run_abc",
  "status": "queued"
}
```

#### `GET /api/runs/:runId`

Returns run metadata, current state, linked artifacts.

#### `GET /api/runs/:runId/events`

Server-sent events for live progress updates.

#### `POST /api/runs/:runId/approve`

Approve or reject pending decision.

#### `POST /api/runs/:runId/cancel`

Cancel a running or blocked workflow.

#### `GET /api/projects/:projectId/connections`

List connector status.

---

## 5. Service Layer Design

```text
apps/orchestrator/src/
  api/
    runs-routes.ts
    projects-routes.ts
    approvals-routes.ts
  services/
    run-service.ts
    approval-service.ts
    connection-service.ts
    event-stream-service.ts
  middleware/
    auth.ts
    rbac.ts
    request-id.ts
```

### `RunService` responsibilities

- validate incoming run request,
- confirm project permissions,
- create DB records,
- start Temporal workflow,
- publish initial event.

### `EventStreamService` responsibilities

- stream state changes to UI,
- replay recent events on reconnect,
- support SSE first, WebSocket optional later.

---

## 6. Authentication and Authorization

### Authentication

Recommended options:

- enterprise SSO via OIDC/SAML provider,
- local dev fallback with seeded users.

### Authorization model

RBAC roles:

| Role        | Permissions                                      |
| ----------- | ------------------------------------------------ |
| `viewer`    | view runs and citations                          |
| `engineer`  | create `explain/plan/implement` runs             |
| `tech_lead` | approve risky changes and PR-ready status        |
| `admin`     | manage connections, policies, retention, budgets |

### Project scoping

Every request carries:

- `userId`
- `projectId`
- effective roles/principals

These are used for:

- run creation permissions,
- retrieval ACL filtering,
- approval authority,
- audit log attribution.

---

## 7. Audit Log Design

Create immutable audit records for:

- run created,
- connector used,
- documents retrieved,
- agent invoked,
- validation command executed,
- approval decision made,
- PR opened.

### Audit schema

```ts
export interface AuditEvent {
  id: string;
  projectId: string;
  runId?: string;
  actorType: "user" | "system" | "agent";
  actorId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  createdAt: string;
}
```

Retention recommendation: at least 90 days for MVP; longer for enterprise plans.

---

## 8. Observability and Metrics

### Required telemetry

#### Metrics

- runs started/completed/failed,
- average time per workflow phase,
- validation pass rate,
- approval wait time,
- retrieval precision metrics,
- model cost/token usage per run.

#### Traces

Use OpenTelemetry spans for:

- request lifecycle,
- connector calls,
- retrieval pipeline,
- each agent invocation,
- validation commands,
- PR creation.

#### Logs

Structured JSON logs with fields:

- `runId`
- `projectId`
- `workflowStep`
- `severity`
- `provider`
- `durationMs`
- `errorCode`

---

## 9. Configuration Model

Project-level config should support:

```ts
export interface ProjectPolicyConfig {
  allowedRepos: string[];
  jiraProjectKeys: string[];
  confluenceSpaceKeys: string[];
  requirePlanApproval: boolean;
  requireHighRiskApproval: boolean;
  maxLoops: number;
  maxFilesChanged: number;
  validationCommands?: string[];
}
```

### Storage

- defaults in code/config package,
- project overrides in Postgres,
- secrets in secret manager only.

---

## 10. UI Status and Event Model

### SSE event types

- `run.created`
- `run.status_changed`
- `run.step_started`
- `run.step_finished`
- `run.approval_requested`
- `run.validation_result`
- `run.completed`
- `run.failed`

### Frontend store shape

```ts
interface RunTimelineEvent {
  id: string;
  runId: string;
  type: string;
  title: string;
  detail?: string;
  createdAt: string;
}
```

---

## 11. Error Experience Requirements

The UI must clearly distinguish:

- **blocked** — missing information or approval,
- **failed** — technical failure after retries,
- **cancelled** — user initiated stop,
- **completed** — success with evidence,
- **needs attention** — high-risk action pending approval.

Avoid vague errors like “something went wrong”; always include the failing subsystem and recovery hint.

---

## 12. Security Controls

- CSRF protection on mutating endpoints,
- strict server-side permission checks,
- redact tokens/secrets from logs and traces,
- encrypt sensitive DB fields,
- rate-limit run creation per user/project.

---

## 13. Operational Dashboards

Recommended dashboards:

1. **Run health dashboard** — success rate, mean duration, queue depth
2. **Connector health dashboard** — sync freshness, auth errors, rate limits
3. **Retrieval quality dashboard** — top cited docs, precision@k, empty-result rate
4. **Cost dashboard** — token usage, model spend, runs by project

---

## 14. Implementation Checklist

1. build the dashboard and run detail pages in `apps/web`,
2. add REST + SSE endpoints in `apps/orchestrator`,
3. integrate SSO and project-scoped RBAC,
4. persist audit events and expose run timeline APIs,
5. instrument traces, metrics, and structured logs,
6. add settings screens for connector and policy management.
