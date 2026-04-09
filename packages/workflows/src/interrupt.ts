import type { RunRecord } from "@horcruxsys/nagini/domain";

export interface WorkflowInterrupt {
  runId: string;
  reason: string;
  requestedAt: string;
}

export function createApprovalInterrupt(run: RunRecord): WorkflowInterrupt {
  return {
    runId: run.id,
    reason:
      run.approval?.status === "pending"
        ? "Approval is pending. Human review is required before execution can continue."
        : "Execution requires human guidance before resuming.",
    requestedAt: run.updatedAt,
  };
}
