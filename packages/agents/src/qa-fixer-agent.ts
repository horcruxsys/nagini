import type { CoderTaskResult } from "./coder-agent.js";

export interface ValidationRunner {
  run(): Promise<{
    status: "pass" | "fail";
    details: string;
  }>;
}

export interface SelfCorrectionResult {
  status: "pass" | "fail";
  attempts: number;
  summary: string;
}

export class QAFixerAgent {
  constructor(private readonly maxAttempts = 2) {}

  async runSelfCorrectionLoop(
    _coderResult: CoderTaskResult,
    validationRunner: ValidationRunner,
  ): Promise<SelfCorrectionResult> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const validation = await validationRunner.run();
      if (validation.status === "pass") {
        return {
          status: "pass",
          attempts: attempt,
          summary: `Validation passed on attempt ${attempt}.`,
        };
      }
    }

    return {
      status: "fail",
      attempts: this.maxAttempts,
      summary: "Validation failed after all self-correction attempts.",
    };
  }
}
