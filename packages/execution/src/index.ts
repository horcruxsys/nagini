import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

import type {
  ImplementationPlan,
  ValidationCommandResult,
  ValidationReport,
} from "@horcruxsys/nagini/domain";

const exec = promisify(execCallback);

export { LogStreamer, type SandboxLogEvent } from "./log-streamer.js";
export { SecureFileSystem } from "./secure-filesystem.js";

export interface ExecutionService {
  buildValidationCommands(repo: string): string[];
  runValidation(
    plan: ImplementationPlan,
    repo: string,
  ): Promise<ValidationReport>;
}

export class LocalExecutionService implements ExecutionService {
  constructor(private readonly workspaceRoot = process.cwd()) {}

  buildValidationCommands(repo: string): string[] {
    const isWholeRepo = !repo || repo === "nagini" || repo.includes("/");

    if (isWholeRepo) {
      return ["CI=1 pnpm lint", "CI=1 pnpm check-types"];
    }

    return [
      `CI=1 pnpm --filter ${repo} lint`,
      `CI=1 pnpm --filter ${repo} check-types`,
    ];
  }

  async runValidation(
    plan: ImplementationPlan,
    repo: string,
  ): Promise<ValidationReport> {
    const commandsToRun = this.buildValidationCommands(repo);
    const commands: ValidationCommandResult[] = [];

    for (const [index, command] of commandsToRun.entries()) {
      const startedAt = Date.now();

      try {
        const result = await exec(command, {
          cwd: this.workspaceRoot,
          env: { ...process.env, CI: "1" },
          maxBuffer: 1024 * 1024 * 10,
          timeout: 10 * 60 * 1000,
        });

        commands.push({
          label: index === 0 ? "lint" : "check-types",
          command,
          exitCode: 0,
          durationMs: Date.now() - startedAt,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      } catch (error) {
        const failure = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
          message?: string;
        };

        commands.push({
          label: index === 0 ? "lint" : "check-types",
          command,
          exitCode: failure.code ?? 1,
          durationMs: Date.now() - startedAt,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? failure.message ?? "Command failed.",
        });

        return {
          status: "fail",
          simulated: false,
          summary: `Validation failed while running ${command}.`,
          commands,
        };
      }
    }

    return {
      status: "pass",
      simulated: false,
      summary: `Validation passed for ${plan.branchName} using real local commands.`,
      commands,
    };
  }
}
