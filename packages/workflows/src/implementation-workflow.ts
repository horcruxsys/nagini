import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import {
  ImplementationRequestSchema,
  type BlueprintSpec,
  type ImplementationSessionState,
  type ImplementationRequest,
  type ManagedFile,
} from "@horcruxsys/nagini/domain";
import {
  createSandbox,
  formatErrorsForPrompt,
  getStarterTemplate,
  detectProjectType,
  parseErrors,
  type SandboxExecutor,
} from "@horcruxsys/nagini/execution";

import { CoderAgent } from "@horcruxsys/nagini/agents";
import { ArchitectWorkflowService } from "./architect-workflow.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// File Orchestrator
// ---------------------------------------------------------------------------

/**
 * Determines the ordered list of files to generate from a blueprint.
 *
 * Ordering strategy:
 *   1. Config / manifest files (package.json, pom.xml, tsconfig.json, etc.)
 *   2. Database schema / migration files
 *   3. Domain / model files
 *   4. API / service layer
 *   5. UI components / controllers
 *   6. Tests
 *   7. Everything else (alphabetical)
 */
function orchestrateFileOrder(blueprint: BlueprintSpec): string[] {
  const allPaths: string[] = [];

  for (const task of blueprint.apiManifest) {
    // Derive the handler file path from the API endpoint
    const segment = task.path
      .replace(/^\/api\//, "")
      .replace(/\//g, "-")
      .replace(/:/g, "")
      .toLowerCase();

    if (blueprint.projectTopology.backend?.includes("Spring")) {
      allPaths.push(
        `src/main/java/com/example/app/controller/${toPascalCase(segment)}Controller.java`,
      );
    } else {
      allPaths.push(`src/app/api/${segment}/route.ts`);
    }
  }

  for (const entity of blueprint.dataModel) {
    if (blueprint.projectTopology.backend?.includes("Spring")) {
      allPaths.push(
        `src/main/java/com/example/app/entity/${entity.name}.java`,
      );
      allPaths.push(
        `src/main/java/com/example/app/repository/${entity.name}Repository.java`,
      );
    } else {
      allPaths.push(`prisma/schema.prisma`);
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const p of allPaths) {
    if (!seen.has(p)) {
      seen.add(p);
      ordered.push(p);
    }
  }
  return ordered;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// ---------------------------------------------------------------------------
// In-memory session store
// ---------------------------------------------------------------------------

const sessionStore = new Map<string, ImplementationSessionState>();

// ---------------------------------------------------------------------------
// Public EventEmitter for SSE streaming
// ---------------------------------------------------------------------------

/**
 * Emits `implementation:progress` events with the current session state.
 * SSE clients subscribe to this to stream progress to the PM cockpit.
 */
export const implementationEmitter = new EventEmitter();

// ---------------------------------------------------------------------------
// ImplementationWorkflowService
// ---------------------------------------------------------------------------

export class ImplementationWorkflowService {
  private readonly coderAgent: CoderAgent;
  private readonly architectService: ArchitectWorkflowService;

  constructor(options: { openaiApiKey?: string } = {}) {
    const key = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
    // Pass the key through; CoderAgent falls back to deterministic stubs when null
    this.coderAgent = new CoderAgent({ openaiApiKey: key ?? undefined });
    this.architectService = new ArchitectWorkflowService({
      openaiApiKey: key ?? undefined,
    });
  }

  // ── Session management ────────────────────────────────────────────

  getSession(sessionId: string): ImplementationSessionState | undefined {
    return sessionStore.get(sessionId);
  }

  listSessions(): ImplementationSessionState[] {
    return Array.from(sessionStore.values());
  }

  // ── Main entry point ──────────────────────────────────────────────

  /**
   * Starts (or resumes) an implementation session from a blueprint.
   *
   * The session is persisted in memory and progress events are emitted on
   * `implementationEmitter` so that connected SSE clients receive real-time
   * updates.
   */
  async run(request: ImplementationRequest): Promise<ImplementationSessionState> {
    const parsed = ImplementationRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new Error(
        `Invalid implementation request: ${parsed.error.message}`,
      );
    }

    const { blueprintSessionId } = parsed.data;

    // Retrieve the approved blueprint
    const architectState = this.architectService.getSession(blueprintSessionId);
    if (!architectState?.blueprint) {
      throw new Error(
        `Blueprint session ${blueprintSessionId} not found or has no approved blueprint.`,
      );
    }

    const blueprint = architectState.blueprint;

    // Create a new implementation session
    const sessionId = randomUUID();
    const state: ImplementationSessionState = {
      sessionId,
      blueprintSessionId,
      status: "orchestrating",
      files: [],
      currentFileIndex: 0,
      totalFiles: 0,
      thinkingLog: [
        `[Orchestrator] Starting implementation for project "${blueprint.projectName}".`,
      ],
      sandboxLogs: [],
      createdAt: now(),
      updatedAt: now(),
    };

    sessionStore.set(sessionId, state);

    // Run the implementation loop in the background so we can return early
    // and let the caller subscribe via SSE.
    setImmediate(() => {
      this.runImplementationLoop(state, blueprint).catch((err: unknown) => {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        const failed: ImplementationSessionState = {
          ...state,
          status: "failed",
          thinkingLog: [
            ...state.thinkingLog,
            `[Orchestrator] Fatal error: ${errorMessage}`,
          ],
          updatedAt: now(),
        };
        sessionStore.set(sessionId, failed);
        implementationEmitter.emit("implementation:progress", failed);
      });
    });

    return state;
  }

  // ── Implementation loop ───────────────────────────────────────────

  private async runImplementationLoop(
    initialState: ImplementationSessionState,
    blueprint: BlueprintSpec,
  ): Promise<void> {
    const { sessionId } = initialState;

    const emit = (s: ImplementationSessionState) => {
      sessionStore.set(sessionId, s);
      implementationEmitter.emit("implementation:progress", s);
    };

    let state = initialState;

    // ── Step 1: File Orchestrator ─────────────────────────────────
    const orderedPaths = orchestrateFileOrder(blueprint);
    const projectType = detectProjectType(
      blueprint.techStackRules.map((t) => t.name),
    );
    const starterTemplate = getStarterTemplate(projectType);
    const starterPaths = Object.keys(starterTemplate);

    // Starter files come first, then blueprint-derived files
    const allPaths = [
      ...starterPaths,
      ...orderedPaths.filter((p) => !starterPaths.includes(p)),
    ];

    const files: ManagedFile[] = allPaths.map((p) => ({
      path: p,
      status: "pending",
      content: starterTemplate[p] ?? "",
      attempts: 0,
    }));

    state = {
      ...state,
      status: "orchestrating",
      files,
      totalFiles: allPaths.length,
      thinkingLog: [
        ...state.thinkingLog,
        `[Orchestrator] ${allPaths.length} files queued (${starterPaths.length} from starter template, ${orderedPaths.length} from blueprint).`,
      ],
      updatedAt: now(),
    };
    emit(state);

    // ── Step 2: Provision sandbox ─────────────────────────────────
    const sandbox = await createSandbox();

    // Forward sandbox logs to the implementation emitter
    sandbox.emitter.on("sandbox:log", (logEvent: unknown) => {
      const latest = sessionStore.get(sessionId);
      if (!latest) return;

      const sandboxLog = logEvent as {
        stream: "stdout" | "stderr";
        chunk: string;
        timestamp: string;
      };

      const updatedState: ImplementationSessionState = {
        ...latest,
        sandboxLogs: [
          ...latest.sandboxLogs,
          {
            exitCode: 0,
            stdout: sandboxLog.stream === "stdout" ? sandboxLog.chunk : "",
            stderr: sandboxLog.stream === "stderr" ? sandboxLog.chunk : "",
            durationMs: 0,
            command: "stream",
          },
        ],
        updatedAt: now(),
      };
      sessionStore.set(sessionId, updatedState);
      implementationEmitter.emit("implementation:progress", updatedState);
    });

    try {
      // ── Step 3: Write starter template files ──────────────────
      for (const [filePath, content] of Object.entries(starterTemplate)) {
        await sandbox.writeFile(filePath, content);

        state = this.updateFile(state, filePath, {
          status: "written",
          content,
          writtenAt: now(),
        });
        emit(state);
      }

      // ── Step 4: Run dependency install ────────────────────────
      state = {
        ...state,
        status: "executing",
        thinkingLog: [
          ...state.thinkingLog,
          "[Executor] Running dependency installation…",
        ],
        updatedAt: now(),
      };
      emit(state);

      const installResult = await this.runInstall(sandbox, projectType);

      state = {
        ...state,
        sandboxLogs: [...state.sandboxLogs, installResult],
        updatedAt: now(),
      };

      if (installResult.exitCode !== 0) {
        state = {
          ...state,
          status: "failed",
          thinkingLog: [
            ...state.thinkingLog,
            `[Executor] Dependency installation failed (exit ${installResult.exitCode}).`,
          ],
          updatedAt: now(),
        };
        emit(state);
        return;
      }

      state = {
        ...state,
        thinkingLog: [
          ...state.thinkingLog,
          "[Executor] Dependencies installed successfully.",
        ],
        updatedAt: now(),
      };
      emit(state);

      // ── Step 5: Coder + Sandbox + Fixer loop ─────────────────
      // Process blueprint-derived files one by one.
      const blueprintFiles = state.files.filter(
        (f) => !starterPaths.includes(f.path),
      );

      for (let i = 0; i < blueprintFiles.length; i += 1) {
        const file = blueprintFiles[i];

        if (!file) continue;

        state = {
          ...state,
          currentFileIndex: starterPaths.length + i,
          status: "coding",
          thinkingLog: [
            ...state.thinkingLog,
            `[Coder] Generating ${file.path} (${i + 1}/${blueprintFiles.length})…`,
          ],
          updatedAt: now(),
        };
        emit(state);

        let content = file.content;
        let lastError: string | undefined;
        let verified = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
          // Generate or fix the file
          if (attempt === 1) {
            const result = await this.coderAgent.implement({
              task: {
                id: `${file.path}-task`,
                title: `Generate ${file.path}`,
                reason: `Required by blueprint for project "${blueprint.projectName}".`,
                targetPaths: [file.path],
                testStrategy: [],
              },
              sandboxRef: sessionId,
            });
            content = result.generatedFiles[file.path] ?? "";
          } else {
            state = {
              ...state,
              status: "fixing",
              thinkingLog: [
                ...state.thinkingLog,
                `[Fixer] Attempt ${attempt}/${MAX_RETRIES} — fixing ${file.path}…`,
              ],
              updatedAt: now(),
            };
            emit(state);

            const fixResult = await this.coderAgent.implement({
              task: {
                id: `${file.path}-task`,
                title: `Fix ${file.path}`,
                reason: `Required by blueprint for project "${blueprint.projectName}".`,
                targetPaths: [file.path],
                testStrategy: [],
              },
              sandboxRef: sessionId,
              previousError: lastError,
              previousContent: content,
            });
            content = fixResult.generatedFiles[file.path] ?? content;
          }

          // Write to sandbox
          await sandbox.writeFile(file.path, content);

          state = this.updateFile(state, file.path, {
            status: "written",
            content,
            attempts: attempt,
            writtenAt: now(),
          });

          state = {
            ...state,
            status: "executing",
            thinkingLog: [
              ...state.thinkingLog,
              `[Executor] Running sanity check for ${file.path} (attempt ${attempt})…`,
            ],
            updatedAt: now(),
          };
          emit(state);

          // Run sanity check
          const checkResult = await this.runSanityCheck(sandbox, projectType);

          state = {
            ...state,
            sandboxLogs: [...state.sandboxLogs, checkResult],
            updatedAt: now(),
          };

          if (checkResult.exitCode === 0) {
            state = this.updateFile(state, file.path, {
              status: "verified",
              verifiedAt: now(),
            });
            state = {
              ...state,
              thinkingLog: [
                ...state.thinkingLog,
                `[Executor] ✓ ${file.path} verified on attempt ${attempt}.`,
              ],
              updatedAt: now(),
            };
            emit(state);
            verified = true;
            break;
          }

          // Parse the error for the Fixer Agent
          const combinedOutput = `${checkResult.stdout}\n${checkResult.stderr}`;
          const parsed = parseErrors(combinedOutput);
          lastError = formatErrorsForPrompt(parsed) || combinedOutput.slice(0, 2000);

          state = this.updateFile(state, file.path, {
            status: "failed",
            lastError,
          });
          state = {
            ...state,
            thinkingLog: [
              ...state.thinkingLog,
              `[Executor] ✗ Sanity check failed for ${file.path} (attempt ${attempt}).`,
            ],
            updatedAt: now(),
          };
          emit(state);
        }

        if (!verified) {
          state = {
            ...state,
            status: "failed",
            thinkingLog: [
              ...state.thinkingLog,
              `[Fixer] ✗ ${file.path} could not be fixed after ${MAX_RETRIES} attempts.`,
            ],
            updatedAt: now(),
          };
          emit(state);
          return;
        }
      }

      // ── Step 6: All files verified ────────────────────────────
      state = {
        ...state,
        status: "completed",
        thinkingLog: [
          ...state.thinkingLog,
          `[Orchestrator] ✓ All ${state.totalFiles} files verified. Implementation complete.`,
        ],
        updatedAt: now(),
      };
      emit(state);
    } finally {
      await sandbox.destroy();
    }
  }

  // ── Sandbox helpers ───────────────────────────────────────────────

  private async runInstall(
    sandbox: SandboxExecutor,
    projectType: string,
  ) {
    if (projectType === "java") {
      return sandbox.exec("mvn -B dependency:resolve --no-transfer-progress", {
        timeoutMs: 5 * 60 * 1000,
      });
    }
    return sandbox.exec("npm install --prefer-offline --no-fund --no-audit", {
      timeoutMs: 5 * 60 * 1000,
    });
  }

  private async runSanityCheck(
    sandbox: SandboxExecutor,
    projectType: string,
  ) {
    if (projectType === "java") {
      return sandbox.exec("mvn -B compile -q --no-transfer-progress", {
        timeoutMs: 3 * 60 * 1000,
      });
    }
    // `next build` performs TypeScript type checking and full compilation in one pass.
    return sandbox.exec("npx next build 2>&1", {
      timeoutMs: 3 * 60 * 1000,
    });
  }

  // ── State helpers ─────────────────────────────────────────────────

  private updateFile(
    state: ImplementationSessionState,
    filePath: string,
    updates: Partial<ManagedFile>,
  ): ImplementationSessionState {
    const files = state.files.map((f) =>
      f.path === filePath ? { ...f, ...updates } : f,
    );
    return { ...state, files, updatedAt: now() };
  }
}
