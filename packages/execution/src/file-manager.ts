import type { FileStatus, ManagedFile } from "@horcruxsys/nagini/domain";

/**
 * StatefulFileManager tracks every file the Coder Agent writes during an
 * implementation session.  Each entry moves through the lifecycle:
 *
 *   pending → written → verified
 *                     ↘ failed  (after max retries)
 */
export class StatefulFileManager {
  private readonly files = new Map<string, ManagedFile>();

  /**
   * Register a file that needs to be generated (PENDING).
   */
  register(path: string): ManagedFile {
    const file: ManagedFile = {
      path,
      status: "pending",
      content: "",
      attempts: 0,
    };
    this.files.set(path, file);
    return file;
  }

  /**
   * Mark a file as written with its generated content.
   */
  markWritten(path: string, content: string): ManagedFile {
    const existing = this.files.get(path) ?? this.register(path);
    const updated: ManagedFile = {
      ...existing,
      status: "written",
      content,
      attempts: existing.attempts + 1,
      writtenAt: new Date().toISOString(),
      lastError: undefined,
    };
    this.files.set(path, updated);
    return updated;
  }

  /**
   * Mark a file as verified (sandbox sanity check passed).
   */
  markVerified(path: string): ManagedFile {
    const existing = this.files.get(path);
    if (!existing) {
      throw new Error(`File not registered: ${path}`);
    }
    const updated: ManagedFile = {
      ...existing,
      status: "verified",
      verifiedAt: new Date().toISOString(),
    };
    this.files.set(path, updated);
    return updated;
  }

  /**
   * Mark a file as failed (error from sandbox execution).
   */
  markFailed(path: string, error: string): ManagedFile {
    const existing = this.files.get(path) ?? this.register(path);
    const updated: ManagedFile = {
      ...existing,
      status: "failed",
      lastError: error,
    };
    this.files.set(path, updated);
    return updated;
  }

  getFile(path: string): ManagedFile | undefined {
    return this.files.get(path);
  }

  getAllFiles(): ManagedFile[] {
    return Array.from(this.files.values());
  }

  getByStatus(status: FileStatus): ManagedFile[] {
    return this.getAllFiles().filter((f) => f.status === status);
  }

  getPendingFiles(): ManagedFile[] {
    return this.getByStatus("pending");
  }

  getFailedFiles(): ManagedFile[] {
    return this.getByStatus("failed");
  }

  /**
   * Returns a summary object useful for progress reporting.
   */
  getSummary(): {
    total: number;
    pending: number;
    written: number;
    verified: number;
    failed: number;
  } {
    const all = this.getAllFiles();
    return {
      total: all.length,
      pending: all.filter((f) => f.status === "pending").length,
      written: all.filter((f) => f.status === "written").length,
      verified: all.filter((f) => f.status === "verified").length,
      failed: all.filter((f) => f.status === "failed").length,
    };
  }
}
