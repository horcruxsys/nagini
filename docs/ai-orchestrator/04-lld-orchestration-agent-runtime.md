# Low-Level Design — Orchestration and Agent Runtime

## 1. Purpose

This subsystem coordinates the end-to-end execution of a run such as `implement CDX-739`. It is responsible for maintaining workflow state, invoking specialist agents, enforcing loop and budget limits, requesting approvals, and producing a deterministic audit trail.

---

## 2. Design Goals

- **Durability**: runs survive worker restarts.
- **Determinism**: workflow transitions depend on structured state, not free-form text.
- **Bounded autonomy**: agents can iterate, but only within explicit limits.
- **Observability**: every step, tool call, and artifact is recorded.
- **Human control**: risky actions can pause for approval.

---

## 3. Runtime Architecture

### Main building blocks

```text
Orchestrator API
  -> RunService
  -> Temporal Workflow Starter
  -> Progress Event Stream

Temporal Workflows
  -> ContextGatheringWorkflow
  -> PlanAndExecuteWorkflow
  -> ApprovalWaitWorkflow

LangGraph / Agent Graph
  -> AnalystAgent
  -> PlannerAgent
  -> CoderAgent
  -> ReviewerAgent
  -> VerifierAgent
  -> SupervisorPolicyNode
```

---

## 4. Package Structure

```text
packages/workflows/
  src/
    temporal/
      run-workflow.ts
      activities.ts
      approval-signals.ts
    graph/
      implement-graph.ts
      policy-node.ts
      transitions.ts
    state/
      run-state.ts
      artifact-store.ts

packages/agents/
  src/
    analyst/
    planner/
    coder/
    reviewer/
    verifier/
    shared/
      schemas.ts
      prompts.ts
      budget.ts
```

---

## 5. Run State Model

```ts
export interface RunState {
  runId: string;
  projectId: string;
  requestedBy: string;
  mode: "explain" | "plan" | "implement" | "review";
  issueKey: string;
  status:
    | "queued"
    | "gathering_context"
    | "planning"
    | "awaiting_approval"
    | "executing"
    | "validating"
    | "revising"
    | "pr_opened"
    | "completed"
    | "blocked"
    | "failed"
    | "cancelled";
  loopCount: number;
  maxLoops: number;
  tokenBudgetUsed: number;
  tokenBudgetMax: number;
  contextPackId?: string;
  planId?: string;
  branchName?: string;
  pullRequestUrl?: string;
  artifacts: string[];
  openQuestions: string[];
  blockingReason?: string;
}
```

### Persistence tables

- `runs`
- `run_steps`
- `agent_messages`
- `artifacts`
- `approvals`
- `tool_invocations`

---

## 6. Workflow Breakdown

### Workflow A — `ExplainWorkflow`

Used for `explain CDX-739`.

Steps:

1. fetch work item,
2. retrieve context pack,
3. generate structured summary,
4. store citations and open questions,
5. mark completed.

### Workflow B — `PlanWorkflow`

Used for `plan CDX-739`.

Steps:

1. `ExplainWorkflow` steps,
2. planner emits task breakdown,
3. optional approval checkpoint,
4. artifact export.

### Workflow C — `ImplementWorkflow`

Used for `implement CDX-739`.

Steps:

1. context gathering,
2. planning,
3. approval gate if required,
4. execution loop,
5. validation loop,
6. PR creation,
7. completion or blocked/failure outcome.

---

## 7. Agent Contracts

All agents must receive a **typed input** and return **schema-validated JSON**.

### 7.1 Analyst agent

Purpose:

- interpret ticket scope,
- identify constraints and ambiguities,
- convert noisy issue text into requirements.

Output schema:

```ts
export interface AnalystOutput {
  summary: string;
  acceptanceCriteria: string[];
  assumptions: string[];
  constraints: string[];
  risks: string[];
  openQuestions: string[];
}
```

### 7.2 Planner agent

Purpose:

- create an execution plan grounded in retrieved context and repo hints.

```ts
export interface PlannerOutput {
  planSummary: string;
  tasks: Array<{
    id: string;
    title: string;
    reason: string;
    targetPaths: string[];
    testStrategy: string[];
    dependencies: string[];
  }>;
  proposedBranchName: string;
  needsHumanApproval: boolean;
  approvalReason?: string;
}
```

### 7.3 Coder agent

Purpose:

- propose and apply code changes for one task unit at a time.

```ts
export interface CoderOutput {
  taskId: string;
  filesToChange: string[];
  changeSummary: string;
  patchIntent: string[];
  addedTests: string[];
}
```

### 7.4 Reviewer agent

Purpose:

- inspect diff for maintainability, architectural drift, and security concerns.

```ts
export interface ReviewerOutput {
  verdict: "approve" | "revise" | "block";
  findings: Array<{
    severity: "low" | "medium" | "high";
    message: string;
    file?: string;
    suggestion?: string;
  }>;
}
```

### 7.5 Verifier agent

Purpose:

- assess whether command results satisfy acceptance criteria.

```ts
export interface VerifierOutput {
  verdict: "pass" | "fail" | "blocked";
  evidence: string[];
  unmetCriteria: string[];
  recommendedNextActions: string[];
}
```

---

## 8. Supervisor Policy Node

The supervisor does **not** write code directly. It evaluates the latest artifacts and decides which node runs next.

Decision inputs:

- current run state,
- planner output,
- validation status,
- review findings,
- remaining token and retry budget,
- approval requirements.

### Transition rules

| Condition                           | Next step                                 |
| ----------------------------------- | ----------------------------------------- |
| missing required context            | `blocked`                                 |
| planner requires approval           | `awaiting_approval`                       |
| no branch yet                       | create branch and continue to `executing` |
| validation failed and loops remain  | `revising`                                |
| validation passed and PR not opened | `pr_opened`                               |
| loops exhausted                     | `failed` or `blocked`                     |

---

## 9. Loop and Budget Controls

### Hard limits

- `maxLoops`: default 3 for MVP
- `maxFilesChanged`: configurable, e.g. 20 for medium-risk runs
- `maxTokenBudget`: configurable per run/project
- `maxWallClock`: e.g. 60 minutes default

### Escalation triggers

Pause and require human input when:

- acceptance criteria are ambiguous,
- secret/env changes are needed,
- migration or infra files are modified,
- validation keeps failing after N attempts,
- the predicted blast radius exceeds project policy.

---

## 10. Approval Mechanism

### Approval events

Supported approval types:

- `plan_approval`
- `high_risk_change_approval`
- `pr_ready_approval`

### Data model

```ts
export interface ApprovalRecord {
  id: string;
  runId: string;
  type: "plan_approval" | "high_risk_change_approval" | "pr_ready_approval";
  status: "pending" | "approved" | "rejected" | "expired";
  requestedBy: string;
  decidedBy?: string;
  comment?: string;
  createdAt: string;
  decidedAt?: string;
}
```

### Temporal signal pattern

- workflow pauses via `await condition(...)`
- UI submits approval action
- API signals workflow with `approve` or `reject`

---

## 11. Artifact Management

Each workflow step emits artifacts:

- normalized work item JSON,
- retrieved context pack,
- plan JSON,
- diff summary,
- command outputs,
- review findings,
- PR body.

Artifact metadata fields:

- `artifact_type`
- `content_type`
- `storage_uri`
- `sha256`
- `created_by_step`
- `visibility`

Artifacts should be stored in object storage or Postgres depending on size.

---

## 12. Prompt and Tooling Strategy

### Prompt composition order

1. system policies
2. run mode instructions
3. structured context pack
4. relevant repo hints
5. strict output schema

### Guardrails

- no hidden assumptions presented as facts,
- cite evidence IDs where possible,
- ask for clarification when confidence is low,
- no completion claims without validation evidence.

---

## 13. Workflow Pseudocode

```ts
export async function implementWorkflow(input: RunInput): Promise<RunResult> {
  let state = await initializeRun(input);

  state = await gatherContext(state);
  if (state.status === "blocked") return finalize(state);

  state = await generatePlan(state);
  if (requiresApproval(state)) {
    state = await waitForApproval(state);
    if (state.status === "cancelled" || state.status === "blocked")
      return finalize(state);
  }

  while (state.loopCount < state.maxLoops) {
    state = await executePlanTasks(state);
    state = await validateChanges(state);

    if (state.status === "pr_opened" || state.status === "completed") {
      return finalize(state);
    }

    if (!canRetry(state)) break;
    state = await reviseFromFeedback(state);
  }

  state.status = "failed";
  state.blockingReason = "Validation did not pass within retry budget";
  return finalize(state);
}
```

---

## 14. Observability Requirements

For every step record:

- step start/end time,
- model used,
- prompt/response token counts,
- tool calls and result statuses,
- validation command exit codes,
- approval wait duration,
- error category and retry count.

This data should be queryable by `runId` and `issueKey`.

---

## 15. Failure Modes and Handling

| Failure mode                 | Detection                          | Response                                   |
| ---------------------------- | ---------------------------------- | ------------------------------------------ |
| invalid agent JSON           | schema validation failure          | retry once with explicit correction prompt |
| repeated low-confidence plan | planner confidence below threshold | request human clarification                |
| workflow worker restart      | Temporal activity/workflow replay  | resume from persisted state                |
| approval timeout             | no decision after SLA window       | set run to `blocked`                       |
| tool outage                  | connector/execution error          | bounded retry with backoff                 |

---

## 16. Implementation Sequence

1. define `RunState` and persistence tables,
2. implement Temporal workflow skeleton,
3. add typed agent schemas and validation,
4. build supervisor transition logic,
5. wire approval signals to UI/API,
6. persist artifacts and tool invocations,
7. add retry/budget policies and metrics.
