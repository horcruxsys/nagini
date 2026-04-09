import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import {
  BlueprintSpecSchema,
  ArchitectWorkflowRequestSchema,
  type ArchitectWorkflowRequest,
  type ArchitectWorkflowState,
  type BlueprintSpec,
} from "@horcruxsys/nagini/domain";

import { validateBlueprint } from "./blueprint-validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Default (deterministic) blueprint used when no LLM key is configured
// ---------------------------------------------------------------------------

function buildDeterministicBlueprint(
  state: ArchitectWorkflowState,
): BlueprintSpec {
  const projectName = state.prompt
    .slice(0, 60)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "new-project";

  return {
    projectName,
    generatedAt: now(),
    projectTopology: {
      frontend: "apps/web (Next.js 15)",
      backend: "apps/api (Spring Boot 3)",
      packages: [
        "packages/domain",
        "packages/ui",
        "packages/shared-types",
      ],
      folders: [
        "apps/",
        "packages/",
        "infra/",
        "docs/",
      ],
    },
    apiManifest: [
      {
        method: "GET",
        path: "/api/health",
        description: "Health check endpoint.",
      },
      {
        method: "POST",
        path: "/api/v1/resources",
        description: "Create a new resource.",
        requestSchema: { name: "string", description: "string" },
        responseSchema: { id: "string", createdAt: "string" },
      },
    ],
    dataModel: [
      {
        name: "Resource",
        fields: [
          { name: "id", type: "UUID", required: true },
          { name: "name", type: "VARCHAR(255)", required: true },
          { name: "description", type: "TEXT", required: false },
          { name: "createdAt", type: "TIMESTAMP", required: true },
          { name: "updatedAt", type: "TIMESTAMP", required: true },
        ],
      },
    ],
    techStackRules: [
      { name: "next", version: "15.x", role: "Frontend framework" },
      {
        name: "spring-boot",
        version: "3.x",
        role: "Backend framework",
        lintRules: ["checkstyle", "spotbugs"],
      },
      { name: "postgresql", version: "16.x", role: "Primary database" },
      { name: "typescript", version: "5.x", role: "Frontend type safety" },
    ],
    securityNotes: [
      "All API endpoints must validate JWT tokens via the gateway.",
      "Sensitive fields (PII, credentials) must be encrypted at rest.",
      "Zero-Trust: service-to-service communication requires mTLS.",
    ],
    complianceFlags: [],
  };
}

// ---------------------------------------------------------------------------
// Node implementations
// ---------------------------------------------------------------------------

/**
 * Node 1 — Interviewer: determines if the PM's prompt is sufficiently clear.
 * If vague, returns a list of clarifying questions.
 */
async function interviewerNode(
  state: ArchitectWorkflowState,
  openai: ReturnType<typeof createOpenAI> | null,
): Promise<ArchitectWorkflowState> {
  const log = [...state.thinkingLog, "[Interviewer] Evaluating prompt clarity…"];

  if (!openai) {
    // Deterministic fallback: accept the prompt as-is
    return {
      ...state,
      status: "designing",
      clarifyingQuestions: [],
      thinkingLog: [
        ...log,
        "[Interviewer] No LLM available — proceeding with deterministic blueprint.",
      ],
      updatedAt: now(),
    };
  }

  const hasClarifications =
    Object.keys(state.clarifications).length > 0;

  const systemPrompt = `
You are a Senior Software Architect acting as an Interviewer.
Your job is to decide whether a PM's project prompt contains enough detail to produce a technical blueprint.

A prompt is SUFFICIENT if it specifies:
- The core user problem or feature
- At least a rough indication of the type of app (web, mobile, API)
- Any critical third-party integrations (payment, auth, etc.) if relevant

A prompt is VAGUE if it:
- Is fewer than 10 words with no specifics
- Mentions an industry (fintech, healthtech) but nothing concrete about the product
- Gives no indication of scale or user type

Respond ONLY with valid JSON in one of two shapes:
  { "sufficient": true }
  { "sufficient": false, "questions": ["Q1", "Q2", "Q3"] }
  `.trim();

  const userMessage = hasClarifications
    ? `Original prompt: ${state.prompt}\n\nClarifications provided: ${JSON.stringify(state.clarifications)}`
    : `Prompt: ${state.prompt}`;

  const { text } = await generateText({
    model: openai("gpt-4.1"),
    system: systemPrompt,
    prompt: userMessage,
  });

  let parsed: { sufficient: boolean; questions?: string[] };
  try {
    parsed = JSON.parse(text.trim()) as {
      sufficient: boolean;
      questions?: string[];
    };
  } catch {
    // If parse fails, assume sufficient and proceed
    parsed = { sufficient: true };
  }

  if (!parsed.sufficient && !hasClarifications) {
    return {
      ...state,
      status: "needs_clarification",
      clarifyingQuestions: parsed.questions ?? [],
      thinkingLog: [
        ...log,
        `[Interviewer] Prompt is vague. Asking ${parsed.questions?.length ?? 0} clarifying question(s).`,
      ],
      updatedAt: now(),
    };
  }

  return {
    ...state,
    status: "designing",
    clarifyingQuestions: [],
    thinkingLog: [
      ...log,
      "[Interviewer] Prompt is sufficiently detailed. Proceeding to Architect.",
    ],
    updatedAt: now(),
  };
}

/**
 * Node 2 — Architect: generates the technical BlueprintSpec.
 */
async function architectNode(
  state: ArchitectWorkflowState,
  openai: ReturnType<typeof createOpenAI> | null,
): Promise<ArchitectWorkflowState> {
  const log = [
    ...state.thinkingLog,
    "[Architect] Generating technical blueprint…",
  ];

  if (!openai) {
    const blueprint = buildDeterministicBlueprint(state);
    return {
      ...state,
      status: "auditing",
      blueprint,
      thinkingLog: [
        ...log,
        "[Architect] Deterministic blueprint generated (no LLM key configured).",
      ],
      updatedAt: now(),
    };
  }

  const clarificationContext =
    Object.keys(state.clarifications).length > 0
      ? `\n\nAdditional clarifications from the PM:\n${Object.entries(state.clarifications)
          .map(([q, a]) => `Q: ${q}\nA: ${a}`)
          .join("\n")}`
      : "";

  const systemPrompt = `
You are a Senior Software Architect with deep expertise in Next.js (frontend) and Java Spring Boot (backend).
Unless the PM explicitly requests a different stack, default to:
  - Frontend: Next.js 15 (TypeScript, App Router)
  - Backend: Java Spring Boot 3 (Java 21, Maven)
  - Database: PostgreSQL 16 with Prisma (or JPA for Java)
  - Auth: next-auth v5 / Auth.js (frontend) + Spring Security (backend)

Your output must be a fully structured Architectural Blueprint (blueprint.json) following the exact JSON schema provided.

Rules:
1. Prefer specific version numbers over ranges.
2. Include Zero-Trust security notes (JWT, mTLS, encryption at rest).
3. List only real npm / Maven packages — do NOT invent package names.
4. The folder structure should reflect a pnpm monorepo for Next.js or a Maven multi-module layout for Java.
  `.trim();

  const result = await generateObject({
    model: openai("gpt-4.1"),
    schema: BlueprintSpecSchema,
    system: systemPrompt,
    prompt: `PM Prompt: ${state.prompt}${clarificationContext}\n\nGenerate the complete Architectural Blueprint.`,
  });

  const blueprint = result.object as BlueprintSpec;

  return {
    ...state,
    status: "auditing",
    blueprint,
    thinkingLog: [
      ...log,
      `[Architect] Blueprint generated with ${blueprint.apiManifest.length} endpoints and ${blueprint.dataModel.length} data entities.`,
    ],
    updatedAt: now(),
  };
}

/**
 * Node 3 — Security/Compliance: audits the blueprint for Zero-Trust principles
 * and sensitive data handling.
 */
async function securityComplianceNode(
  state: ArchitectWorkflowState,
  openai: ReturnType<typeof createOpenAI> | null,
): Promise<ArchitectWorkflowState> {
  const log = [
    ...state.thinkingLog,
    "[Security/Compliance] Auditing blueprint…",
  ];

  if (!state.blueprint) {
    return {
      ...state,
      status: "needs_clarification",
      thinkingLog: [
        ...log,
        "[Security/Compliance] No blueprint available to audit.",
      ],
      securityAuditPassed: false,
      updatedAt: now(),
    };
  }

  // Always run the structural validator
  const validationResult = validateBlueprint(state.blueprint);
  const validationErrors = validationResult.errors;

  if (!openai) {
    // Deterministic security check
    const hasSecurityNotes = state.blueprint.securityNotes.length > 0;
    const passed = hasSecurityNotes && validationResult.valid;

    return {
      ...state,
      status: passed ? "approved" : "needs_clarification",
      securityAuditPassed: passed,
      validationErrors,
      thinkingLog: [
        ...log,
        passed
          ? "[Security/Compliance] Audit passed (deterministic check)."
          : "[Security/Compliance] Audit flagged issues — see validationErrors.",
      ],
      updatedAt: now(),
    };
  }

  const systemPrompt = `
You are a Security and Compliance Architect specialising in Zero-Trust architecture and data privacy (GDPR, SOC 2).
Audit the provided Architectural Blueprint and determine if it meets the following standards:

1. Zero-Trust: No implicit trust — every service-to-service call must be authenticated.
2. Sensitive data: PII and credentials must be encrypted at rest and in transit.
3. Auth: JWT or OAuth2 tokens must be validated on every request.
4. Secrets: No hard-coded secrets; use environment variables or a secrets manager.

Respond ONLY with valid JSON:
  { "passed": true, "notes": [] }
  { "passed": false, "notes": ["Issue 1", "Issue 2"] }
  `.trim();

  const { text } = await generateText({
    model: openai("gpt-4.1"),
    system: systemPrompt,
    prompt: `Blueprint:\n${JSON.stringify(state.blueprint, null, 2)}`,
  });

  let auditResult: { passed: boolean; notes: string[] };
  try {
    auditResult = JSON.parse(text.trim()) as {
      passed: boolean;
      notes: string[];
    };
  } catch {
    auditResult = { passed: true, notes: [] };
  }

  const allErrors = [...validationErrors, ...auditResult.notes];
  const passed = auditResult.passed && validationErrors.length === 0;

  // Merge security notes from the audit back into the blueprint
  const updatedBlueprint: BlueprintSpec = {
    ...state.blueprint,
    securityNotes: [
      ...state.blueprint.securityNotes,
      ...auditResult.notes,
    ],
  };

  return {
    ...state,
    status: passed ? "approved" : "needs_clarification",
    blueprint: updatedBlueprint,
    securityAuditPassed: passed,
    validationErrors: allErrors,
    thinkingLog: [
      ...log,
      passed
        ? "[Security/Compliance] Audit passed."
        : `[Security/Compliance] Audit found ${allErrors.length} issue(s).`,
    ],
    updatedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ArchitectWorkflowRunOptions {
  /** Override the OpenAI API key (defaults to process.env.OPENAI_API_KEY). */
  openaiApiKey?: string;
}

/**
 * In-memory session store.  In production this would be backed by
 * Postgres/Redis to satisfy the LangGraph Checkpointer requirement.
 */
const sessionStore = new Map<string, ArchitectWorkflowState>();

/**
 * Event emitter for streaming the "thinking log" to connected SSE clients.
 */
export const architectEmitter = new EventEmitter();

export class ArchitectWorkflowService {
  private readonly openai: ReturnType<typeof createOpenAI> | null;

  constructor(options: ArchitectWorkflowRunOptions = {}) {
    const key = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
    this.openai = key ? createOpenAI({ apiKey: key }) : null;
  }

  // ── Session management ────────────────────────────────────────────

  getSession(sessionId: string): ArchitectWorkflowState | undefined {
    return sessionStore.get(sessionId);
  }

  listSessions(): ArchitectWorkflowState[] {
    return Array.from(sessionStore.values());
  }

  // ── Main workflow entrypoint ──────────────────────────────────────

  /**
   * Runs the 3-node Architect workflow and returns the final state.
   * Emits `architect:thinking` events on `architectEmitter` after each node
   * so SSE clients can stream the thinking log in real time.
   */
  async run(
    request: ArchitectWorkflowRequest,
  ): Promise<ArchitectWorkflowState> {
    const parsed = ArchitectWorkflowRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new Error(
        `Invalid architect workflow request: ${parsed.error.message}`,
      );
    }

    const sessionId = parsed.data.sessionId ?? randomUUID();
    const existing = sessionStore.get(sessionId);

    // Resume or create
    let state: ArchitectWorkflowState = existing ?? {
      sessionId,
      prompt: parsed.data.prompt,
      clarifications: parsed.data.clarifications ?? {},
      status: "interviewing",
      clarifyingQuestions: [],
      securityAuditPassed: false,
      validationErrors: [],
      thinkingLog: [],
      createdAt: now(),
      updatedAt: now(),
    };

    // Merge in any new clarifications on resume
    if (existing && parsed.data.clarifications) {
      state = {
        ...state,
        clarifications: {
          ...state.clarifications,
          ...parsed.data.clarifications,
        },
        status: "interviewing",
        updatedAt: now(),
      };
    }

    const emit = (s: ArchitectWorkflowState) => {
      sessionStore.set(sessionId, s);
      architectEmitter.emit("architect:thinking", s);
    };

    // ── Node 1: Interviewer ────────────────────────────────────────
    state = await interviewerNode(state, this.openai);
    emit(state);

    if (state.status === "needs_clarification") {
      return state;
    }

    // ── Node 2: Architect ──────────────────────────────────────────
    state = await architectNode(state, this.openai);
    emit(state);

    // ── Node 3: Security / Compliance ──────────────────────────────
    state = await securityComplianceNode(state, this.openai);
    emit(state);

    return state;
  }
}
