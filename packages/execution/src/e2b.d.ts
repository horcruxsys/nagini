/**
 * Minimal ambient type declaration for the optional @e2b/code-interpreter
 * dependency. This allows the execution package to compile without requiring
 * the SDK to be installed; the actual import is performed dynamically at
 * runtime only when E2B_API_KEY is present.
 */
declare module "@e2b/code-interpreter" {
  export class Sandbox {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static create(opts: Record<string, unknown>): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filesystem: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process: any;
    close(): Promise<void>;
  }
}
