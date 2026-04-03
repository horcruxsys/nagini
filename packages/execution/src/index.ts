import type {
  ImplementationPlan,
  ValidationCommandResult,
  ValidationReport,
} from "@horcruxsys/nagini/domain";

export interface ExecutionService {
  buildValidationCommands(repo: string): string[];
  runValidation(
    plan: ImplementationPlan,
    repo: string,
  ): Promise<ValidationReport>;
}

export class LocalExecutionService implements ExecutionService {
  buildValidationCommands(repo: string): string[] {
    return [`pnpm lint --filter ${repo}`, `pnpm check-types --filter ${repo}`];
  }

  async runValidation(
    plan: ImplementationPlan,
    repo: string,
  ): Promise<ValidationReport> {
    const commands: ValidationCommandResult[] = this.buildValidationCommands(
      repo,
    ).map((command, index) => ({
      label: index === 0 ? "lint" : "check-types",
      command,
      exitCode: 0,
      durationMs: 100 + index * 25,
      stdout: `Simulated ${command} for ${plan.branchName}`,
      stderr: "",
    }));

    return {
      status: "pass",
      simulated: true,
      summary:
        "Validation is scaffolded in simulation mode. Replace this service with the real sandbox runner when execution is wired.",
      commands,
    };
  }
}
