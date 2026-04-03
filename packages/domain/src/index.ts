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

export const ApprovalActionSchema = z.enum(["approved", "rejected"]);
export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;

export const ApprovalDecisionInputSchema = z.object({
  reviewer: z.string().min(1).default("operator"),
  comment: z.string().trim().max(500).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionInputSchema>;

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

export interface ApprovalDecision {
  action: ApprovalAction;
  reviewer: string;
  comment?: string;
  createdAt: string;
}

export interface ApprovalState {
  required: boolean;
  status: "not_required" | "pending" | "approved" | "rejected";
  requestedAt?: string;
  resolvedAt?: string;
  decisions: ApprovalDecision[];
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
  approval?: ApprovalState;
}

export interface RunEvent {
  id: string;
  runId: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
}

// ── Connector canonical models ──────────────────────────────────────

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
  projectId: string;
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

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  headingPath: string[];
  tokenCount: number;
  text: string;
  embedding?: number[];
  keywords: string;
  metadata: Record<string, unknown>;
}

export interface SyncJob {
  id: string;
  provider: "github" | "jira" | "confluence";
  scopeKey: string;
  mode: "full" | "incremental" | "webhook";
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt?: string;
  finishedAt?: string;
  cursorState?: Record<string, unknown>;
  errorText?: string;
}

// ── GitHub extended interfaces ──────────────────────────────────────

export interface RepoTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface CodeSearchResult {
  path: string;
  repository: string;
  url: string;
  snippet: string;
}

// ── Retrieval types ─────────────────────────────────────────────────

export interface RetrievalRequest {
  projectId: string;
  intent: "plan" | "implement" | "review";
  issueKey: string;
  textQuery: string;
  relatedTerms: string[];
  repoHints?: string[];
  topK: number;
}

export interface ScoredChunk {
  chunk: DocumentChunk;
  score: number;
  source: "bm25" | "vector" | "hybrid";
}

export interface DashboardMetric {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: "positive" | "neutral" | "warning";
}

export interface DashboardProviderHealth {
  provider: "github" | "jira" | "confluence";
  status: "ready" | "degraded" | "not_configured";
  message: string;
  lastCheckedAt: string;
}

export interface SetupCatalogItem {
  id: string;
  label: string;
  description?: string;
  url?: string;
}

export interface SetupConnectorState {
  provider: "github" | "jira" | "confluence";
  label: string;
  configured: boolean;
  status: "ready" | "degraded" | "not_configured";
  message: string;
  resources: SetupCatalogItem[];
  requiredEnv: string[];
  missingEnv: string[];
}

export interface SetupStateSummary {
  generatedAt: string;
  ready: boolean;
  completedCount: number;
  totalCount: number;
  nextAction: string;
  connectors: SetupConnectorState[];
  recommended: {
    issueKeyTemplate: string;
    reviewer: string;
    repo?: string;
    orchestratorBaseUrl: string;
  };
}

export interface DashboardActivityItem {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  status: "completed" | "in_progress" | "attention";
}

export interface DashboardApprovalItem {
  runId: string;
  issueKey: string;
  repo: string;
  requestedAt: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
}

export interface DashboardSummary {
  generatedAt: string;
  metrics: DashboardMetric[];
  providerHealth: DashboardProviderHealth[];
  recentActivity: DashboardActivityItem[];
  approvalQueue: DashboardApprovalItem[];
  launchTracks: string[];
}
