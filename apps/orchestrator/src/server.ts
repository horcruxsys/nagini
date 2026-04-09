import cors from "@fastify/cors";
import Fastify from "fastify";

import {
  ApprovalDecisionInputSchema,
  ArchitectWorkflowRequestSchema,
  ImplementationRequestSchema,
  type RunRecord,
  type ImplementationSessionState,
  RunRequestSchema,
} from "@horcruxsys/nagini/domain";
import {
  architectEmitter,
  ArchitectWorkflowService,
  buildRunTimeline,
  implementationEmitter,
  ImplementationWorkflowService,
  OrchestratorWorkflowService,
} from "@horcruxsys/nagini/workflows";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  const workflowService = new OrchestratorWorkflowService();
  const architectService = new ArchitectWorkflowService();
  const implementationService = new ImplementationWorkflowService();

  app.get("/health", async () => ({
    status: "ok",
    service: "nagini-orchestrator",
    timestamp: new Date().toISOString(),
  }));

  app.get("/api/capabilities", async () => ({
    modes: ["explain", "plan", "implement", "review"],
    integrations: ["github", "jira", "confluence"],
    validationMode: "local",
    knowledgeMode: "hybrid",
  }));

  app.get("/api/setup/state", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return workflowService.getSetupState();
  });

  app.get("/api/dashboard", async (_request, reply) => {
    reply.header(
      "Cache-Control",
      "public, max-age=15, stale-while-revalidate=60",
    );
    return workflowService.getDashboardSummary();
  });

  app.get("/api/approvals", async () => {
    const dashboard = await workflowService.getDashboardSummary();
    return { items: dashboard.approvalQueue };
  });

  app.get("/api/runs", async () => ({
    items: await workflowService.listRuns(),
  }));

  app.post("/api/runs", async (request, reply) => {
    const parsed = RunRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid run request.",
        issues: parsed.error.flatten(),
      });
    }

    const run = await workflowService.run(parsed.data);
    return reply.status(201).send(run);
  });

  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await workflowService.getRun(runId);

    if (!run) {
      return reply.status(404).send({ message: `Run ${runId} was not found.` });
    }

    return run;
  });

  app.get("/api/runs/:runId/timeline", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await workflowService.getRun(runId);

    if (!run) {
      return reply.status(404).send({ message: `Run ${runId} was not found.` });
    }

    return {
      runId,
      items: buildRunTimeline(run),
    };
  });

  app.post("/api/runs/:runId/approve", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const parsed = ApprovalDecisionInputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid approval payload.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const run = await workflowService.decideApproval(
        runId,
        "approved",
        parsed.data,
      );
      return reply.send(run);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to approve run.";
      const statusCode = message.includes("was not found") ? 404 : 400;
      return reply.status(statusCode).send({ message });
    }
  });

  app.post("/api/runs/:runId/reject", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const parsed = ApprovalDecisionInputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid rejection payload.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const run = await workflowService.decideApproval(
        runId,
        "rejected",
        parsed.data,
      );
      return reply.send(run);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reject run.";
      const statusCode = message.includes("was not found") ? 404 : 400;
      return reply.status(statusCode).send({ message });
    }
  });

  app.get("/api/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await workflowService.getRun(runId);

    if (!run) {
      return reply.status(404).send({ message: `Run ${runId} was not found.` });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let sentEventsCount = 0;
    const streamEvents = (currentRun: RunRecord) => {
      const events = buildRunTimeline(currentRun);
      const newEvents = events.slice(sentEventsCount);
      for (const event of newEvents) {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      sentEventsCount = events.length;
    };

    streamEvents(run);

    const isTerminal = (status: string) => 
      ["completed", "failed", "cancelled"].includes(status);

    if (isTerminal(run.status)) {
      reply.raw.end();
      return reply;
    }

    return new Promise((resolve) => {
      const onRunChange = (updatedRun: RunRecord) => {
        if (updatedRun.id === runId) {
          streamEvents(updatedRun);
          if (isTerminal(updatedRun.status)) {
            cleanup();
          }
        }
      };

      const cleanup = () => {
        workflowService.emitter.off("run:change", onRunChange);
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
        resolve(reply);
      };

      workflowService.emitter.on("run:change", onRunChange);
      request.raw.on("close", cleanup);
    });
  });

  // ── Architect / Blueprint endpoints ──────────────────────────────────────

  /**
   * POST /api/architect/blueprint
   * Starts or resumes an Architect Workflow session.
   * Body: { prompt, sessionId?, clarifications? }
   * Returns the final ArchitectWorkflowState (or intermediate if clarification needed).
   */
  app.post("/api/architect/blueprint", async (request, reply) => {
    const parsed = ArchitectWorkflowRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid architect workflow request.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const state = await architectService.run(parsed.data);
      const statusCode = state.status === "approved" ? 201 : 200;
      return reply.status(statusCode).send(state);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Architect workflow failed.";
      return reply.status(500).send({ message });
    }
  });

  /**
   * GET /api/architect/blueprint/:sessionId
   * Returns the current state of an Architect Workflow session.
   */
  app.get("/api/architect/blueprint/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const state = architectService.getSession(sessionId);

    if (!state) {
      return reply
        .status(404)
        .send({ message: `Architect session ${sessionId} was not found.` });
    }

    return state;
  });

  /**
   * GET /api/architect/blueprint/:sessionId/stream
   * Server-Sent Events stream for the Architect's real-time thinking log.
   * Clients receive `architect:thinking` events as the workflow progresses.
   */
  app.get(
    "/api/architect/blueprint/:sessionId/stream",
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const isArchitectTerminal = (s: string) =>
        s === "approved" || s === "needs_clarification";

      // Send current state immediately if session exists
      const current = architectService.getSession(sessionId);
      if (current) {
        reply.raw.write(
          `event: architect:thinking\ndata: ${JSON.stringify(current)}\n\n`,
        );

        if (isArchitectTerminal(current.status)) {
          reply.raw.end();
          return reply;
        }
      }

      return new Promise((resolve) => {
        const onThinking = (state: unknown) => {
          const s = state as { sessionId: string; status: string };
          if (s.sessionId === sessionId) {
            reply.raw.write(
              `event: architect:thinking\ndata: ${JSON.stringify(state)}\n\n`,
            );

            if (isArchitectTerminal(s.status)) {
              cleanup();
            }
          }
        };

        const cleanup = () => {
          architectEmitter.off("architect:thinking", onThinking);
          if (!reply.raw.writableEnded) {
            reply.raw.end();
          }
          resolve(reply);
        };

        architectEmitter.on("architect:thinking", onThinking);
        request.raw.on("close", cleanup);
      });
    },
  );

  // ── Implementation / Self-Healing Code Engine endpoints ──────────────────

  /**
   * POST /api/implementation
   * Starts an implementation session from an approved blueprint.
   * Body: { blueprintSessionId }
   * Returns the initial ImplementationSessionState immediately.
   * Progress is streamed via /api/implementation/:sessionId/stream.
   */
  app.post("/api/implementation", async (request, reply) => {
    const parsed = ImplementationRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid implementation request.",
        issues: parsed.error.flatten(),
      });
    }

    try {
      const state = await implementationService.run(parsed.data);
      return reply.status(202).send(state);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Implementation failed.";
      const statusCode = message.includes("not found") ? 404 : 500;
      return reply.status(statusCode).send({ message });
    }
  });

  /**
   * GET /api/implementation/:sessionId
   * Returns the current state of an implementation session.
   */
  app.get("/api/implementation/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const state = implementationService.getSession(sessionId);

    if (!state) {
      return reply.status(404).send({
        message: `Implementation session ${sessionId} was not found.`,
      });
    }

    return state;
  });

  /**
   * GET /api/implementation/:sessionId/stream
   * Server-Sent Events stream that pipes real-time progress and sandbox
   * terminal output to the PM cockpit.
   *
   * Events emitted:
   *   `implementation:progress` — full ImplementationSessionState snapshot
   */
  app.get(
    "/api/implementation/:sessionId/stream",
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const isTerminal = (status: string) =>
        status === "completed" || status === "failed";

      const sendState = (s: ImplementationSessionState) => {
        reply.raw.write(
          `event: implementation:progress\ndata: ${JSON.stringify(s)}\n\n`,
        );
      };

      // Send current state immediately if the session exists
      const current = implementationService.getSession(sessionId);
      if (current) {
        sendState(current);
        if (isTerminal(current.status)) {
          reply.raw.end();
          return reply;
        }
      }

      return new Promise((resolve) => {
        const onProgress = (state: unknown) => {
          const s = state as ImplementationSessionState;
          if (s.sessionId === sessionId) {
            sendState(s);
            if (isTerminal(s.status)) {
              cleanup();
            }
          }
        };

        const cleanup = () => {
          implementationEmitter.off("implementation:progress", onProgress);
          if (!reply.raw.writableEnded) {
            reply.raw.end();
          }
          resolve(reply);
        };

        implementationEmitter.on("implementation:progress", onProgress);
        request.raw.on("close", cleanup);
      });
    },
  );

  return app;
}
