import { z } from "zod";

export const RunModeSchema = z.enum(["explain", "plan", "implement", "review"]);
export type RunMode = z.infer<typeof RunModeSchema>;

export const RunStatusSchema = z.enum([
  "queued",
  "gathering_context",
  "planning",
  "awaiting_approval",
  "executing",
  "validating",
  "blocked",
  "failed",
  "completed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunRequestSchema = z.object({
  projectId: z.string().min(1),
  issueKey: z.string().min(1),
  mode: RunModeSchema,
  repo: z.string().min(1),
  baseBranch: z.string().min(1).default("main"),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export interface WorkItemComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface WorkItem {
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  comments: WorkItemComment[];
  links: {
    confluencePageIds: string[];
    repoIds: string[];
  };
  priority?: string;
  labels: string[];
}

export interface ContextCitation {
  id: string;
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

export interface ImplementationPlanTask {
  id: string;
  title: string;
  reason: string;
  targetPaths: string[];
  testStrategy: string[];
}

export interface ImplementationPlan {
  summary: string;
  branchName: string;
  approvalRequired: boolean;
  tasks: ImplementationPlanTask[];
  risks: string[];
}

export interface ValidationCommandResult {
  label: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface ValidationReport {
  status: "pass" | "fail" | "pending";
  simulated: boolean;
  summary: string;
  commands: ValidationCommandResult[];
}

export interface RunRecord {
  id: string;
  projectId: string;
  issueKey: string;
  mode: RunMode;
  repo: string;
  baseBranch: string;
  status: RunStatus;
  summary: string;
  createdAt: string;
  updatedAt: string;
  contextPack?: ContextPack;
  plan?: ImplementationPlan;
  validation?: ValidationReport;
}

export interface RunEvent {
  id: string;
  runId: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
}
