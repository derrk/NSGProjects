/**
 * Model pricing, in US dollars per million tokens.
 *
 * Used to bill each `agent_runs` row so the Finance agent can report true API cost and
 * the daily spend caps have something to measure. Update this table when Anthropic
 * changes prices — a wrong number here silently skews every margin figure in the app.
 *
 * Last checked: 2026-10-08.
 */

import type { TokenUsage } from './types'

export interface ModelPrice {
  input: number
  output: number
  /** Reading from the prompt cache. */
  cacheRead: number
  /** Writing to the prompt cache — 1.25x the input rate. */
  cacheWrite: number
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  'claude-opus-5-5': { input: 4.0, output: 20.0, cacheRead: 0.2, cacheWrite: 5.0 },
  'claude-opus-5': { input: 5.0, output: 25.0, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-sonnet-5': { input: 2.0, output: 10.0, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-fable-5-1': { input: 10.0, output: 50.0, cacheRead: 0.25, cacheWrite: 12.5 },
}

const CENTS_PER_DOLLAR = 100
const TOKENS_PER_MILLION = 1_000_000

/** Cost of one model call, in cents. Returns 0 for a model this table does not know. */
export function costCentsFor(usage: TokenUsage): number {
  const price = MODEL_PRICING[usage.model]
  if (!price) return 0

  const dollars =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      (usage.cacheReadInputTokens ?? 0) * price.cacheRead +
      (usage.cacheCreationInputTokens ?? 0) * price.cacheWrite) /
    TOKENS_PER_MILLION

  return dollars * CENTS_PER_DOLLAR
}

/** Every input-side token, cached or not. */
export function inputTokensOf(usage: TokenUsage): number {
  return (
    usage.inputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0)
  )
}

export function isKnownModel(model: string): boolean {
  return model in MODEL_PRICING
}
