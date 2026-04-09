import { EventEmitter } from "node:events";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import type { SandboxExecutionResult } from "@horcruxsys/nagini/domain";

const exec = promisify(execCallback);

// ---------------------------------------------------------------------------
// Sandbox interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over any code-execution sandbox (E2B, local, etc.).
 * Implementations must be safe for concurrent use across multiple sessions.
 */
export interface SandboxExecutor {
  /**
   * Write a file into the sandbox at the given path.
   * The sandbox is responsible for creating parent directories.
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Run a shell command inside the sandbox and return the result.
   * Stdout/stderr lines are also emitted on the `emitter` so that
   * the Terminal Streamer can forward them to connected SSE clients.
   */
  exec(
    command: string,
    options?: { cwd?: string; timeoutMs?: number },
  ): Promise<SandboxExecutionResult>;

  /**
   * Tear down the sandbox (stop container, remove temp dirs, etc.).
   * Should be idempotent.
   */
  destroy(): Promise<void>;

  /** EventEmitter on which `sandbox:log` events are emitted. */
  readonly emitter: EventEmitter;
}

// ---------------------------------------------------------------------------
// E2B Sandbox (production)
// ---------------------------------------------------------------------------

/**
 * E2BSandbox wraps the official `@e2b/code-interpreter` SDK.
 *
 * The SDK is injected at construction time so that this class can be unit-
 * tested without the actual SDK installed, and so that the dependency can be
 * optionally installed by operators who have an E2B API key.
 *
 * Usage:
 *   import { Sandbox } from "@e2b/code-interpreter";
 *   const sandbox = await E2BSandbox.create(Sandbox, apiKey);
 */
export class E2BSandbox implements SandboxExecutor {
  readonly emitter = new EventEmitter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(private readonly sandbox: any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async create(SandboxClass: any, apiKey: string): Promise<E2BSandbox> {
    const sandbox = await SandboxClass.create({
      apiKey,
      template: "base",
      envs: { NODE_VERSION: "20", JAVA_HOME: "/usr/lib/jvm/java-21" },
    });
    return new E2BSandbox(sandbox);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.sandbox.filesystem.write(filePath, content);
  }

  async exec(
    command: string,
    options: { cwd?: string; timeoutMs?: number } = {},
  ): Promise<SandboxExecutionResult> {
    const startedAt = Date.now();
    const result = await this.sandbox.process.startAndWait(command, {
      cwd: options.cwd ?? "/code",
      timeout: options.timeoutMs ?? 120_000,
      onStdout: (data: string) => {
        this.emitter.emit("sandbox:log", {
          stream: "stdout",
          chunk: data,
          timestamp: new Date().toISOString(),
        });
      },
      onStderr: (data: string) => {
        this.emitter.emit("sandbox:log", {
          stream: "stderr",
          chunk: data,
          timestamp: new Date().toISOString(),
        });
      },
    });

    return {
      exitCode: result.exitCode ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      durationMs: Date.now() - startedAt,
      command,
    };
  }

  async destroy(): Promise<void> {
    await this.sandbox.close();
  }
}

// ---------------------------------------------------------------------------
// Local Sandbox (development / CI fallback)
// ---------------------------------------------------------------------------

/**
 * LocalSandbox runs commands in a temporary directory on the host machine.
 * It is used when `E2B_API_KEY` is not configured, giving the same interface
 * without requiring the E2B service.
 *
 * ⚠️  This sandbox provides NO isolation.  Use only in trusted environments
 * such as developer machines and CI pipelines that already run in containers.
 */
export class LocalSandbox implements SandboxExecutor {
  readonly emitter = new EventEmitter();
  private rootDir: string | null = null;
  private destroyed = false;

  private constructor() {}

  static async create(): Promise<LocalSandbox> {
    const instance = new LocalSandbox();
    instance.rootDir = await mkdtemp(path.join(os.tmpdir(), "nagini-sandbox-"));
    return instance;
  }

  private getRootDir(): string {
    if (!this.rootDir || this.destroyed) {
      throw new Error("LocalSandbox has not been initialised or was destroyed.");
    }
    return this.rootDir;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const root = this.getRootDir();
    const resolved = path.join(root, filePath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, content, "utf8");
  }

  async exec(
    command: string,
    options: { cwd?: string; timeoutMs?: number } = {},
  ): Promise<SandboxExecutionResult> {
    const root = this.getRootDir();
    const cwd = options.cwd ? path.join(root, options.cwd) : root;
    const startedAt = Date.now();

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const result = await exec(command, {
        cwd,
        env: { ...process.env, CI: "1" },
        maxBuffer: 1024 * 1024 * 10,
        timeout: options.timeoutMs ?? 120_000,
      });

      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      const failure = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      exitCode = failure.code ?? 1;
      stdout = failure.stdout ?? "";
      stderr = failure.stderr ?? failure.message ?? "Command failed.";
    }

    if (stdout) {
      this.emitter.emit("sandbox:log", {
        stream: "stdout",
        chunk: stdout,
        timestamp: new Date().toISOString(),
      });
    }
    if (stderr) {
      this.emitter.emit("sandbox:log", {
        stream: "stderr",
        chunk: stderr,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startedAt,
      command,
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyed || !this.rootDir) return;
    this.destroyed = true;
    await rm(this.rootDir, { recursive: true, force: true });
    this.rootDir = null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the appropriate sandbox based on whether an E2B API key is present.
 * Falls back to LocalSandbox when `E2B_API_KEY` is not set.
 */
export async function createSandbox(): Promise<SandboxExecutor> {
  const apiKey = process.env.E2B_API_KEY;

  if (apiKey) {
    try {
      // Dynamic import so the package is optional — callers without @e2b/code-interpreter
      // installed will transparently fall back to LocalSandbox.
      const { Sandbox } = await import("@e2b/code-interpreter");
      return E2BSandbox.create(Sandbox, apiKey);
    } catch {
      // SDK not installed — fall through to local sandbox
    }
  }

  return LocalSandbox.create();
}
