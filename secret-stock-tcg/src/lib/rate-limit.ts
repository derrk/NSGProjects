// A small fixed-window rate limiter, held in memory.
//
// Deliberately NOT database-backed. A DB limiter would need a migration, and a
// deploy that reached production before the migration ran would break the admin
// login — locking the shop owner out of their own store. In-memory costs
// nothing, can't fail closed, and needs no schema change.
//
// The tradeoff: serverless instances don't share memory, so a determined
// attacker spread across many cold starts gets more attempts than the limit
// suggests. That still turns "unlimited guesses at a shared passphrase" into
// something impractical, which is the actual threat here. Move this to Redis or
// a Postgres table if the admin ever grows real user accounts.

export type RateLimitRule = {
  /** Attempts permitted inside the window. */
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Seconds until the window resets; 0 when not limited. */
  retryAfterSec: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Keep the map from growing without bound on a long-lived instance.
function prune(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Record an attempt against `key` and report whether it is allowed.
 * `now` is injectable so the behaviour is testable without sleeping.
 */
export function rateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  prune(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: Math.max(0, rule.limit - 1), retryAfterSec: 0 };
  }

  existing.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > rule.limit) {
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - existing.count),
    retryAfterSec: 0,
  };
}

/** Clear a key's window — call after a success so one typo isn't punished. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Test seam. Not used by application code. */
export function __clearAllRateLimits(): void {
  buckets.clear();
}
