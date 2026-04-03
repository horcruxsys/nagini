import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const JiraConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
});

const ConfluenceConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
});

const GitHubConfigSchema = z.object({
  token: z.string().min(1),
  appId: z.string().optional(),
  privateKey: z.string().optional(),
});

const PostgresConfigSchema = z.object({
  host: z.string().min(1).default("localhost"),
  port: z.coerce.number().int().default(5432),
  database: z.string().min(1).default("nagini"),
  user: z.string().min(1).default("nagini"),
  password: z.string().min(1),
  ssl: z.enum(["disable", "prefer", "require"]).default("prefer"),
});

const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1),
  embeddingModel: z.string().default("text-embedding-3-small"),
  embeddingDimensions: z.coerce.number().int().default(1536),
});

const AppConfigSchema = z.object({
  jira: JiraConfigSchema,
  confluence: ConfluenceConfigSchema,
  github: GitHubConfigSchema,
  postgres: PostgresConfigSchema,
  openai: OpenAIConfigSchema,
});

export type JiraConfig = z.infer<typeof JiraConfigSchema>;
export type ConfluenceConfig = z.infer<typeof ConfluenceConfigSchema>;
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;
export type PostgresConfig = z.infer<typeof PostgresConfigSchema>;
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

let envLoaded = false;

function loadEnvFilesOnce(): void {
  if (envLoaded) {
    return;
  }

  envLoaded = true;

  const searchRoots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];
  const envFiles = [".env.local", ".env"];

  for (const root of searchRoots) {
    for (const fileName of envFiles) {
      const filePath = path.join(root, fileName);

      if (!existsSync(filePath)) {
        continue;
      }

      const fileContent = readFileSync(filePath, "utf-8");
      for (const rawLine of fileContent.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
          continue;
        }

        const equalsIndex = line.indexOf("=");
        if (equalsIndex <= 0) {
          continue;
        }

        const key = line.slice(0, equalsIndex).trim();
        if (!key || process.env[key] !== undefined) {
          continue;
        }

        let value = line.slice(equalsIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        process.env[key] = value.replace(/\\n/g, "\n");
      }
    }
  }
}

function requiredEnv(key: string): string {
  loadEnvFilesOnce();
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback?: string): string | undefined {
  loadEnvFilesOnce();
  return process.env[key] ?? fallback;
}

export function loadConfig(): AppConfig {
  loadEnvFilesOnce();
  const raw = {
    jira: {
      baseUrl: requiredEnv("JIRA_BASE_URL"),
      email: requiredEnv("JIRA_EMAIL"),
      apiToken: requiredEnv("JIRA_API_TOKEN"),
    },
    confluence: {
      baseUrl: requiredEnv("CONFLUENCE_BASE_URL"),
      email: requiredEnv("CONFLUENCE_EMAIL"),
      apiToken: requiredEnv("CONFLUENCE_API_TOKEN"),
    },
    github: {
      token: requiredEnv("GITHUB_TOKEN"),
      appId: optionalEnv("GITHUB_APP_ID"),
      privateKey: optionalEnv("GITHUB_PRIVATE_KEY"),
    },
    postgres: {
      host: optionalEnv("PGHOST", "localhost"),
      port: optionalEnv("PGPORT", "5432"),
      database: optionalEnv("PGDATABASE", "nagini"),
      user: optionalEnv("PGUSER", "nagini"),
      password: requiredEnv("PGPASSWORD"),
      ssl: optionalEnv("PGSSLMODE", "prefer"),
    },
    openai: {
      apiKey: requiredEnv("OPENAI_API_KEY"),
      embeddingModel: optionalEnv(
        "OPENAI_EMBEDDING_MODEL",
        "text-embedding-3-small",
      ),
      embeddingDimensions: optionalEnv("OPENAI_EMBEDDING_DIMENSIONS", "1536"),
    },
  };

  return AppConfigSchema.parse(raw);
}

/**
 * Loads only the subset of config needed, returning null for sections
 * whose env vars are missing instead of throwing.
 */
export function loadPartialConfig(): Partial<AppConfig> {
  loadEnvFilesOnce();
  const result: Partial<AppConfig> = {};

  try {
    result.jira = JiraConfigSchema.parse({
      baseUrl: process.env.JIRA_BASE_URL,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
    });
  } catch {
    /* jira not configured */
  }

  try {
    result.confluence = ConfluenceConfigSchema.parse({
      baseUrl: process.env.CONFLUENCE_BASE_URL,
      email: process.env.CONFLUENCE_EMAIL,
      apiToken: process.env.CONFLUENCE_API_TOKEN,
    });
  } catch {
    /* confluence not configured */
  }

  try {
    result.github = GitHubConfigSchema.parse({
      token: process.env.GITHUB_TOKEN,
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
    });
  } catch {
    /* github not configured */
  }

  try {
    result.postgres = PostgresConfigSchema.parse({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE,
    });
  } catch {
    /* postgres not configured */
  }

  try {
    result.openai = OpenAIConfigSchema.parse({
      apiKey: process.env.OPENAI_API_KEY,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
      embeddingDimensions: process.env.OPENAI_EMBEDDING_DIMENSIONS,
    });
  } catch {
    /* openai not configured */
  }

  return result;
}
