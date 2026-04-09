import { EventEmitter } from "node:events";

export interface SandboxLogEvent {
  runId: string;
  stream: "stdout" | "stderr";
  chunk: string;
  timestamp: string;
}

export class LogStreamer {
  private readonly emitter = new EventEmitter();

  onLog(listener: (event: SandboxLogEvent) => void): () => void {
    this.emitter.on("sandbox:log", listener);
    return () => {
      this.emitter.off("sandbox:log", listener);
    };
  }

  push(event: SandboxLogEvent): void {
    this.emitter.emit("sandbox:log", event);
  }
}
