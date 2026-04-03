import Fastify from "fastify";

import { RunRequestSchema, type RunRecord } from "@horcruxsys/nagini/domain";
import {
  buildRunTimeline,
  OrchestratorWorkflowService,
} from "@horcruxsys/nagini/workflows";

export function buildServer() {
  const app = Fastify({ logger: true });
  const workflowService = new OrchestratorWorkflowService();
  const runStore = new Map<string, RunRecord>();

  app.get("/health", async () => ({
    status: "ok",
    service: "nagini-orchestrator",
    timestamp: new Date().toISOString(),
  }));

  app.get("/api/capabilities", async () => ({
    modes: ["explain", "plan", "implement", "review"],
    integrations: ["github", "jira", "confluence"],
    validationMode: "simulation",
  }));

  app.get("/api/runs", async () => ({
    items: [...runStore.values()],
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
    runStore.set(run.id, run);

    return reply.status(201).send(run);
  });

  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = runStore.get(runId);

    if (!run) {
      return reply.status(404).send({ message: `Run ${runId} was not found.` });
    }

    return run;
  });

  app.get("/api/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = runStore.get(runId);

    if (!run) {
      return reply.status(404).send({ message: `Run ${runId} was not found.` });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    for (const event of buildRunTimeline(run)) {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    reply.raw.end();
    return reply;
  });

  return app;
}
