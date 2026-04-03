import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

async function start() {
  const server = buildServer();

  try {
    await server.listen({ port, host });
    server.log.info(`Orchestrator listening on http://${host}:${port}`);
  } catch (error) {
    server.log.error(error, "Failed to start orchestrator server.");
    process.exit(1);
  }
}

void start();
