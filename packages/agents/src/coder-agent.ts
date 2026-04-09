import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import type { ImplementationPlanTask } from "@horcruxsys/nagini/domain";

export interface CoderTaskInput {
  task: ImplementationPlanTask;
  sandboxRef: string;
  /** Previous error feedback for self-correction. */
  previousError?: string;
  /** The source code that produced the error (for diff-aware fixes). */
  previousContent?: string;
}

export interface CoderTaskResult {
  taskId: string;
  changedPaths: string[];
  /** Map of file path → generated source code. */
  generatedFiles: Record<string, string>;
  summary: string;
}

const CODER_SYSTEM_PROMPT = `
You are an expert software engineer specialising in Next.js 15 (TypeScript, App Router)
and Java Spring Boot 3 (Java 21, Maven).

Your job is to write production-quality source code for a single file when given:
  - The file path
  - A description of what it should do
  - Optionally, the existing code and a build/lint error to fix

Rules:
1. Output ONLY the raw file content — no markdown fences, no explanations.
2. Follow the existing code style (ESLint, Prettier, Checkstyle).
3. Prefer existing libraries over new ones.
4. Imports must use exact package names that exist in the project.
5. Do NOT add placeholder comments like "TODO" or "implement later".
`.trim();

const FIXER_SYSTEM_PROMPT = `
You are an expert debugger specialising in Next.js 15 (TypeScript) and Java Spring Boot 3.

You receive:
  1. The file path of the broken file.
  2. The current source code.
  3. A structured list of errors from the build/lint tool.

Your task:
  Step 1 — REASON: Explain in 1–3 sentences exactly WHY the build failed.
  Step 2 — FIX: Rewrite the entire file with the errors corrected.

Output format (strict):
  REASON: <your explanation>
  ---
  <full corrected file content>
`.trim();

export class CoderAgent {
  private readonly openai: ReturnType<typeof createOpenAI> | null;

  constructor(options: { openaiApiKey?: string } = {}) {
    const key = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
    this.openai = key ? createOpenAI({ apiKey: key }) : null;
  }

  async implement(input: CoderTaskInput): Promise<CoderTaskResult> {
    const generatedFiles: Record<string, string> = {};

    for (const filePath of input.task.targetPaths) {
      if (input.previousError && input.previousContent !== undefined) {
        generatedFiles[filePath] = await this.fixFile(
          filePath,
          input.previousContent,
          input.previousError,
        );
      } else {
        generatedFiles[filePath] = await this.generateFile(
          filePath,
          input.task,
        );
      }
    }

    return {
      taskId: input.task.id,
      changedPaths: Object.keys(generatedFiles),
      generatedFiles,
      summary: input.previousError
        ? `Fixed ${input.task.targetPaths.length} file(s) for task "${input.task.title}".`
        : `Generated ${input.task.targetPaths.length} file(s) for task "${input.task.title}".`,
    };
  }

  private async generateFile(
    filePath: string,
    task: ImplementationPlanTask,
  ): Promise<string> {
    if (!this.openai) {
      return this.deterministicStub(filePath, task.title);
    }

    const { text } = await generateText({
      model: this.openai("gpt-4.1"),
      system: CODER_SYSTEM_PROMPT,
      prompt: [
        `File path: ${filePath}`,
        `Task title: ${task.title}`,
        `Task description: ${task.reason}`,
        `Test strategy: ${task.testStrategy.join("; ")}`,
        `Generate the complete source code for this file.`,
      ].join("\n"),
    });

    return text.trim();
  }

  private async fixFile(
    filePath: string,
    currentContent: string,
    errorDetails: string,
  ): Promise<string> {
    if (!this.openai) {
      return currentContent;
    }

    const { text } = await generateText({
      model: this.openai("gpt-4.1"),
      system: FIXER_SYSTEM_PROMPT,
      prompt: [
        `File path: ${filePath}`,
        ``,
        `Current source code:`,
        "```",
        currentContent,
        "```",
        ``,
        `Build / lint errors:`,
        errorDetails,
        ``,
        `Apply the fix.`,
      ].join("\n"),
    });

    // Strip the REASON block and return only the corrected file content
    const separatorIndex = text.indexOf("---");
    if (separatorIndex !== -1) {
      return text.slice(separatorIndex + 3).trim();
    }

    return text.trim();
  }

  private deterministicStub(filePath: string, taskTitle: string): string {
    const ext = filePath.split(".").pop() ?? "";
    if (["ts", "tsx"].includes(ext)) {
      return `// Auto-generated stub for: ${taskTitle}\n// Path: ${filePath}\nexport {};\n`;
    }
    if (ext === "java") {
      return `// Auto-generated stub for: ${taskTitle}\n// Path: ${filePath}\n`;
    }
    return `# Auto-generated stub for: ${taskTitle}\n# Path: ${filePath}\n`;
  }
}
