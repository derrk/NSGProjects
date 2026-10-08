/**
 * Shared retry/backoff wrapper for every integration client
 * (SPEC.md §External integrations).
 *
 * This is per-API-call. The agent run wrapper retries whole runs on top of it, so keep
 * the attempt count here small: three retries here inside four attempts there is
 * sixteen calls to someone else's rate limit.
 */

export interface RetryOptions {
  attempts?: number
  baseMs?: number
  maxMs?: number
  /** Decides whether an error is worth retrying. Defaults to the heuristic below. */
  isRetryable?: (err: unknown) => boolean
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** HTTP status, if the error carries one in any of the usual shapes. */
function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const bag = err as Record<string, unknown>
  for (const key of ['status', 'statusCode', 'code']) {
    const value = bag[key]
    if (typeof value === 'number') return value
  }
  return undefined
}

/** Rate limits and server faults are worth retrying; a 4xx we caused is not. */
export function isRetryableError(err: unknown): boolean {
  const status = statusOf(err)
  if (status !== undefined) return status === 408 || status === 429 || status >= 500
  // No status: almost always a socket or DNS failure, which is transient.
  return true
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3
  const baseMs = options.baseMs ?? 500
  const maxMs = options.maxMs ?? 8_000
  const retryable = options.isRetryable ?? isRetryableError
  const sleep = options.sleep ?? defaultSleep

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === attempts || !retryable(err)) break
      const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1))
      await sleep(delay + Math.floor(Math.random() * 250))
    }
  }
  throw lastError
}
