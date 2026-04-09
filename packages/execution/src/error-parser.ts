/**
 * Represents a single parsed error extracted from sandbox output.
 */
export interface ParsedError {
  /** The primary error message (no noise). */
  message: string;
  /** File path responsible for the error (if detectable). */
  filePath?: string;
  /** Line number within the file (if detectable). */
  line?: number;
  /** Column number within the file (if detectable). */
  column?: number;
  /** Category of the error for routing to the correct fixer prompt. */
  category: "compile" | "lint" | "runtime" | "dependency" | "unknown";
  /** The raw lines from the original log that produced this error. */
  rawLines: string[];
}

// ---------------------------------------------------------------------------
// Internal patterns
// ---------------------------------------------------------------------------

// TypeScript compiler errors: src/foo.ts(12,5): error TS2322: ...
const TS_COMPILER_RE =
  /^(?<file>[^\s(]+\.tsx?)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+): (?<msg>.+)$/;

// ESLint errors: /path/to/file.ts  12:5  error  <msg>  <rule>
// Use [ ]+ instead of \s+ to avoid ReDoS via whitespace repetition.
const ESLINT_RE =
  /^\s*(?<file>\/[^\s]+\.tsx?)[ ]+(?<line>\d+):(?<col>\d+)[ ]+error[ ]+(?<msg>[^\s].*?)[ ]{2,}(?<rule>\S+)$/;

// npm install errors: npm ERR! code E404 / npm ERR! 404 Not Found
// Use a single space instead of \s+ to prevent ReDoS.
const NPM_ERROR_RE = /^npm ERR! (?<msg>[^\s][^\n]*)$/;

// Maven compile errors: [ERROR] /path/to/File.java:[12,5] error: <msg>
// Use a single space instead of \s+ to prevent ReDoS.
const MAVEN_ERROR_RE =
  /^\[ERROR\] (?<file>[^\s[]+\.java):\[(?<line>\d+),(?<col>\d+)\] (?<msg>[^\n]+)$/;

// Gradle errors: e: file:/path/to/File.kt:12:5: error: <msg>
const GRADLE_ERROR_RE =
  /^e: file:(?<file>[^:]+\.kt):(?<line>\d+):(?<col>\d+): error: (?<msg>.+)$/;

// Node.js runtime errors: e.g. "TypeError: Cannot read properties of undefined"
const NODE_RUNTIME_RE = /^(TypeError|RangeError|ReferenceError|SyntaxError|Error): (?<msg>.+)$/;

// Lines that are purely noise and should be discarded when parsing
const NOISE_PATTERNS = [
  /^\s*at\s+\S+\s+\(.*\)$/, // stack trace frames
  /^\s*at\s+\S+:\d+:\d+$/, // short stack trace frames
  /^\s*\^\s*$/, // pointer lines
  /^---+$/, // separators
  /^\s*$/, // blank lines
  /^npm warn/i, // npm warnings
  /^note:/i, // TypeScript "note:" lines
  /^\[INFO\]/i, // Maven INFO lines
  /^\[WARNING\]/i, // Maven WARNING lines
  /^BUILD SUCCESS/i, // Maven success
  /^Downloading from/i, // Maven download lines
];

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(line));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses raw sandbox stdout/stderr into a list of structured errors.
 * Strips stack trace frames, blank lines, and other noise so that the Fixer
 * Agent receives only the signal it needs.
 */
export function parseErrors(rawLog: string): ParsedError[] {
  const lines = rawLog.split("\n");
  const errors: ParsedError[] = [];

  for (const line of lines) {
    if (isNoise(line)) continue;

    // TypeScript compiler
    const tsMatch = TS_COMPILER_RE.exec(line);
    if (tsMatch?.groups) {
      errors.push({
        message: tsMatch.groups["msg"] ?? line,
        filePath: tsMatch.groups["file"],
        line: Number(tsMatch.groups["line"]),
        column: Number(tsMatch.groups["col"]),
        category: "compile",
        rawLines: [line],
      });
      continue;
    }

    // ESLint
    const eslintMatch = ESLINT_RE.exec(line);
    if (eslintMatch?.groups) {
      errors.push({
        message: `${eslintMatch.groups["msg"] ?? ""} (${eslintMatch.groups["rule"] ?? "unknown-rule"})`,
        filePath: eslintMatch.groups["file"],
        line: Number(eslintMatch.groups["line"]),
        column: Number(eslintMatch.groups["col"]),
        category: "lint",
        rawLines: [line],
      });
      continue;
    }

    // npm install
    const npmMatch = NPM_ERROR_RE.exec(line);
    if (npmMatch?.groups) {
      errors.push({
        message: npmMatch.groups["msg"] ?? line,
        category: "dependency",
        rawLines: [line],
      });
      continue;
    }

    // Maven
    const mavenMatch = MAVEN_ERROR_RE.exec(line);
    if (mavenMatch?.groups) {
      errors.push({
        message: mavenMatch.groups["msg"] ?? line,
        filePath: mavenMatch.groups["file"],
        line: Number(mavenMatch.groups["line"]),
        column: Number(mavenMatch.groups["col"]),
        category: "compile",
        rawLines: [line],
      });
      continue;
    }

    // Gradle / Kotlin
    const gradleMatch = GRADLE_ERROR_RE.exec(line);
    if (gradleMatch?.groups) {
      errors.push({
        message: gradleMatch.groups["msg"] ?? line,
        filePath: gradleMatch.groups["file"],
        line: Number(gradleMatch.groups["line"]),
        column: Number(gradleMatch.groups["col"]),
        category: "compile",
        rawLines: [line],
      });
      continue;
    }

    // Node.js runtime
    const nodeMatch = NODE_RUNTIME_RE.exec(line);
    if (nodeMatch?.groups) {
      errors.push({
        message: nodeMatch.groups["msg"] ?? line,
        category: "runtime",
        rawLines: [line],
      });
      continue;
    }
  }

  return errors;
}

/**
 * Formats a list of ParsedErrors into a concise string suitable for injection
 * into the Fixer Agent's prompt.
 */
export function formatErrorsForPrompt(errors: ParsedError[]): string {
  if (errors.length === 0) {
    return "No specific errors were detected in the sandbox output.";
  }

  return errors
    .map((e, i) => {
      const location =
        e.filePath
          ? `${e.filePath}${e.line !== undefined ? `:${e.line}` : ""}${e.column !== undefined ? `:${e.column}` : ""}`
          : "unknown location";
      return `[${i + 1}] ${e.category.toUpperCase()} @ ${location}: ${e.message}`;
    })
    .join("\n");
}
