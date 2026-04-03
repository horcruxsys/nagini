export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {},
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY,
    ...opts,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) break;

      const isRetryable =
        error instanceof Error &&
        ("statusCode" in error
          ? [429, 500, 502, 503, 504].includes(
              (error as Error & { statusCode: number }).statusCode,
            )
          : error.message.includes("fetch failed") ||
            error.message.includes("ECONNRESET"));

      if (!isRetryable) throw error;

      const jitter = Math.random() * 0.3 + 0.85;
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) * jitter,
        maxDelayMs,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

export class ConnectorError extends Error {
  constructor(
    public readonly provider: string,
    public readonly statusCode: number,
    message: string,
    public readonly responseBody?: string,
  ) {
    super(`[${provider}] ${statusCode}: ${message}`);
    this.name = "ConnectorError";
  }
}

export async function assertOk(
  provider: string,
  response: Response,
): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ConnectorError(
      provider,
      response.status,
      response.statusText,
      body,
    );
  }
}
