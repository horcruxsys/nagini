# Low-Level Design — Execution, Validation, and PR Subsystem

## 1. Purpose

This subsystem safely executes code changes produced by the orchestrator, verifies them against repository standards, and creates a branch and pull request containing evidence.

It is the boundary between **AI planning** and **real repository mutation**, so safety and verification are critical.

---

## 2. Responsibilities

- prepare isolated execution workspace,
- create or reuse a feature branch,
- apply file modifications in a controlled way,
- run validation commands,
- collect logs and artifacts,
- assemble PR description and publish it,
- ensure no run is declared complete without fresh validation evidence.

---

## 3. Execution Environment Design

### Preferred runtime

Use **ephemeral containerized workers** with:

- repo checkout volume,
- short-lived credentials,
- network egress restrictions where practical,
- CPU/memory/time quotas.

### Workspace lifecycle

1. allocate workspace directory,
2. clone or fetch target repo,
3. checkout base ref and create feature branch,
4. run scoped changes and validation,
5. upload logs/artifacts,
6. destroy workspace.

---

## 4. Package Layout

```text
packages/execution/
  src/
    sandbox/
      workspace.ts
      process-runner.ts
      limits.ts
    git/
      branch.ts
      commit.ts
      diff.ts
      pr.ts
    validation/
      command-discovery.ts
      test-selector.ts
      result-parser.ts
    policy/
      change-policy.ts
      risk-checks.ts
```

---

## 5. Branch and Commit Strategy

### Branch naming convention

```text
feat/{issueKey}-{slug}
example: feat/CDX-739-checkout-idempotency
```

### Commit strategy

For MVP, prefer **single squashed commit** or a small number of logical commits:

- `feat(CDX-739): implement checkout idempotency guard`
- `test(CDX-739): add regression coverage`

Keep commit history simple until autonomous changes become stable.

---

## 6. Validation Command Discovery

Because repos differ, the system should discover validation commands from:

1. repository config (`package.json`, `turbo.json`, `Makefile`, CI files),
2. project templates/policies,
3. operator overrides.

### Command priority

For this repo shape, default order should be:

1. `pnpm lint`
2. `pnpm check-types`
3. targeted tests or `pnpm test` if defined
4. build if relevant to changed areas

### Discovery contract

```ts
export interface ValidationPlan {
  installCommand?: string;
  preflightCommands: string[];
  validationCommands: Array<{
    label: string;
    command: string;
    required: boolean;
    timeoutMs: number;
  }>;
}
```

---

## 7. File Change Policy

Before writing files, enforce policy checks:

### Allowed by default

- source files under app/package boundaries,
- tests,
- docs,
- config files with low blast radius.

### Require approval

- infra/deployment files,
- secrets or env templates,
- database migration files,
- auth/permission logic,
- dependency manifest updates.

### Blocked without admin policy

- deleting large directories,
- modifying license/legal files,
- production deployment scripts.

---

## 8. Change Application Flow

1. planner picks task + target files,
2. execution service prepares workspace snapshot,
3. coder agent generates structured change intent,
4. file edit tool applies scoped modifications,
5. diff is inspected for policy violations,
6. changed files are staged for validation.

### Required artifact after each change round

- file list,
- diff summary,
- risk score,
- related acceptance criteria IDs,
- pending validation plan.

---

## 9. Validation Execution Flow

### Preflight checks

- dependency install if needed,
- ensure clean git state,
- verify required env variables or mocked runtime mode,
- check that changed files still parse.

### Main validation

Each command returns:

```ts
export interface CommandResult {
  label: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}
```

### Evidence rule

A run can only move to `completed` when required commands return `exitCode = 0` and the results are stored as artifacts.

---

## 10. Feedback Loop Logic

If validation fails:

1. parse errors into structured findings,
2. hand findings to `ReviewerAgent` and `CoderAgent`,
3. revise only the failing areas,
4. rerun the minimum relevant validation set,
5. stop after `maxLoops`.

### Example failure classes

- type errors,
- test assertion failures,
- import/build failures,
- lint/style problems,
- flaky environment issues.

Each class should map to a remediation hint template.

---

## 11. PR Assembly

### PR title format

```text
[CDX-739] Implement checkout idempotency guard
```

### PR body template

```md
## Summary

- what changed
- why it changed

## Jira

- CDX-739

## Context used

- Confluence: <title + link>
- Jira comments: <references>

## Validation evidence

- lint: pass/fail
- types: pass/fail
- tests: pass/fail

## Risks / follow-ups

- ...
```

### PR labels

- `ai-assisted`
- project/component labels from Jira if mapped
- `needs-review` or `draft`

---

## 12. GitHub Integration Contract

```ts
interface PRPublisher {
  createBranch(input: {
    repo: string;
    baseRef: string;
    branchName: string;
  }): Promise<void>;
  commitChanges(input: {
    repo: string;
    branchName: string;
    message: string;
  }): Promise<string>;
  openDraftPr(input: {
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    labels?: string[];
  }): Promise<{ url: string; number: number }>;
}
```

---

## 13. Security Controls

- execution token limited to target repo only,
- no long-lived credentials stored in workspace,
- command allowlist or policy evaluation for shell execution,
- resource quotas and timeout enforcement,
- optional outbound network restrictions for the sandbox.

---

## 14. Result Persistence

### Tables / artifacts to persist

- `validation_runs`
- `validation_command_results`
- `git_artifacts` (branch, commit SHA, PR URL)
- `diff_summaries`

### Example `validation_runs`

| Column          | Type        | Purpose                   |
| --------------- | ----------- | ------------------------- |
| `id`            | uuid        | validation run ID         |
| `run_id`        | uuid        | orchestrator run relation |
| `workspace_ref` | text        | sandbox path or ID        |
| `status`        | text        | running/pass/fail         |
| `started_at`    | timestamptz | timing                    |
| `finished_at`   | timestamptz | timing                    |

---

## 15. Failure Modes

| Failure                       | Response                                          |
| ----------------------------- | ------------------------------------------------- |
| clone/checkout failure        | retry once; otherwise block run                   |
| dependency install timeout    | record evidence and mark blocked/fail             |
| required test command missing | use fallback policy or ask for operator config    |
| PR creation failure           | persist diff and branch; allow manual PR recovery |
| repeated validation failure   | stop and post remediation summary                 |

---

## 16. Implementation Checklist

1. implement workspace manager and process runner,
2. add git branch/commit/PR helpers,
3. create validation command discovery module,
4. add structured result parsing and evidence storage,
5. enforce file/risk policy checks,
6. wire PR publishing into the main workflow,
7. add sandbox cleanup and artifact retention.
