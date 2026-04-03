"use server";

import { revalidatePath } from "next/cache";
import { submitApprovalDecision } from "../lib/orchestrator";

function readRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${key}`);
  }

  return value.trim();
}

function readOptionalString(
  formData: FormData,
  key: string,
): string | undefined {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function approveRunAction(formData: FormData): Promise<void> {
  const runId = readRequiredString(formData, "runId");
  const reviewer = readRequiredString(formData, "reviewer");
  const comment = readOptionalString(formData, "comment");

  await submitApprovalDecision({
    runId,
    decision: "approve",
    reviewer,
    comment,
  });

  revalidatePath("/");
  revalidatePath(`/runs/${runId}`);
}

export async function rejectRunAction(formData: FormData): Promise<void> {
  const runId = readRequiredString(formData, "runId");
  const reviewer = readRequiredString(formData, "reviewer");
  const comment = readOptionalString(formData, "comment");

  await submitApprovalDecision({
    runId,
    decision: "reject",
    reviewer,
    comment,
  });

  revalidatePath("/");
  revalidatePath(`/runs/${runId}`);
}
