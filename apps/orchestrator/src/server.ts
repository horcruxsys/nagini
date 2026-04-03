import cors from "@fastify/cors";
import Fastify from "fastify";

import {
  ApprovalDecisionInputSchema,
  RunRequestSchema,
} from "@horcruxsys/nagini/domain";
import {
  buildRunTimeline,
  OrchestratorWorkflowService,
} from "@horcruxsys/nagini/workflows";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  const workflowService = new OrchestratorWorkflowService();

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
    const streamEvents = (currentRun: any) => {
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
      const onRunChange = (updatedRun: any) => {
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

  return app;
}
