import {
  BlueprintSpecSchema,
  type BlueprintSpec,
} from "@horcruxsys/nagini/domain";

export interface BlueprintValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Known hallucinated or non-existent dependency names that LLMs commonly invent.
 */
const KNOWN_HALLUCINATED_DEPS = new Set([
  "prisma-client-js",
  "@prisma/client-edge",
  "react-query-v5",
  "trpc-next",
  "zod-resolver",
  "superjson-next",
  "@tanstack/react-query-next",
  "fastify-plugin-v4",
  "langchain-openai",
  "openai-edge",
]);

/**
 * Validates a BlueprintSpec JSON object for structural correctness and
 * checks for commonly hallucinated dependency names.
 *
 * - `errors`: blocking issues that make the blueprint invalid.
 * - `warnings`: advisory notices that should be reviewed but do not
 *   prevent the blueprint from being used.
 */
export function validateBlueprint(
  raw: unknown,
): BlueprintValidationResult {
  const parsed = BlueprintSpecSchema.safeParse(raw);

  if (!parsed.success) {
    const errors = parsed.error.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`,
    );
    return { valid: false, errors, warnings: [] };
  }

  const blueprint = parsed.data as BlueprintSpec;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for hallucinated dependency names in tech stack (advisory)
  for (const entry of blueprint.techStackRules) {
    if (KNOWN_HALLUCINATED_DEPS.has(entry.name)) {
      warnings.push(
        `Potentially hallucinated dependency detected: "${entry.name}". Verify this package exists on npm.`,
      );
    }
  }

  // Advisory: an empty blueprint may indicate an incomplete spec
  if (
    blueprint.apiManifest.length === 0 &&
    blueprint.dataModel.length === 0
  ) {
    warnings.push(
      "Blueprint has no API endpoints and no data model entities. Verify the spec is complete.",
    );
  }

  // Blocking: API paths must start with "/"
  for (const endpoint of blueprint.apiManifest) {
    if (!endpoint.path.startsWith("/")) {
      errors.push(
        `API endpoint path "${endpoint.path}" must start with "/".`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
