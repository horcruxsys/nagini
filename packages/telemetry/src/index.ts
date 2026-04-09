export interface AgentTraceEvent {
  runId: string;
  agent: "architect" | "coder" | "qa_fixer" | "devops";
  step: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface TelemetrySink {
  record(event: AgentTraceEvent): Promise<void>;
}

export class InMemoryTelemetrySink implements TelemetrySink {
  private readonly events: AgentTraceEvent[] = [];

  async record(event: AgentTraceEvent): Promise<void> {
    this.events.push(event);
  }

  list(): AgentTraceEvent[] {
    return [...this.events];
  }
}
