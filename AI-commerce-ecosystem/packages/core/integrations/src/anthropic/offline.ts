/**
 * A model client that never calls Anthropic.
 *
 * Lets the whole pipeline run end to end on a laptop with no API key and no spend,
 * which is what makes a local prototype worth clicking through.
 *
 * It picks its answer by trying each canned response against the schema the caller
 * asked for and returning the first that validates. That sounds indirect, but the
 * alternative — branching on the system prompt text — breaks the moment anyone edits
 * a prompt, and these prompts are explicitly operator-editable.
 *
 * Responses are derived from the request, not random: the same concept produces the
 * same three variants every time, so a dev run is reproducible.
 */

import type { ModelClient, StructuredRequest, StructuredResult } from './client'

/** Deterministic small integer from a string, for stable fake seeds. */
function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function textOf(request: StructuredRequest<unknown>): string {
  return request.parts
    .map((p) => (p.kind === 'text' ? p.text : '[image]'))
    .join('\n')
}

/** Pull "Concept title: X" style lines out of the prompt so answers look related. */
function field(text: string, label: string): string | null {
  const match = new RegExp(`${label}:\\s*(.+)`, 'i').exec(text)
  return match?.[1]?.trim() ?? null
}

function quotedLettering(text: string): string | null {
  const match = /must read exactly:\s*"([^"]+)"/i.exec(text)
  return match?.[1] ?? null
}

/**
 * Candidate responses, most specific first.
 *
 * Each is tried against the caller's schema; the first that parses wins.
 */
function candidates(request: StructuredRequest<unknown>): unknown[] {
  const text = textOf(request)
  const title = field(text, 'Concept title') ?? 'Untitled concept'
  const brief = field(text, 'Brief') ?? 'A simple, bold illustration.'
  const style = field(text, 'Style') ?? 'flat-vector'
  const lettering = quotedLettering(text)

  // A proofreading request: always passes offline, so the pipeline completes rather
  // than looping through the lettering guardrail every time.
  const textCheck = {
    matches: true,
    observedText: lettering ?? title,
    problem: '',
  }

  const compositions = ['centred stack', 'circular badge', 'diagonal split']
  const plan = {
    variants: compositions.map((composition, i) => ({
      prompt: `${style} design, ${composition}. ${brief} Offline development render ${i + 1}.`,
      composition,
      // Offline runs skip the lettering path: there is no real image to proofread,
      // so claiming text was rendered correctly would be a lie the inbox repeats.
      hasText: false,
      textToRender: '',
      negativePrompt: 'photographic background, product mockup',
    })),
  }

  /*
   * A concept batch, for the Concept bench.
   *
   * Derived from the prompt rather than invented freely, because every field here is
   * re-checked in code the moment it comes back: `style` is a Postgres enum, the
   * products have to be ones the division sells, and the brief has a minimum length
   * because the Designer renders from that field alone. A canned answer that fails
   * its own vet is worse than none — it sends the agent round a correction pass and
   * then reports that nothing survived.
   *
   * It says OFFLINE DEVELOPMENT CONCEPT in the brief on purpose. These rows reach the
   * concepts table like any other, and the operator should be able to tell one that
   * came from a model from one that came from this file.
   */
  const niche = field(text, 'The niche, already approved by the operator') ?? 'the niche'
  const audience = field(text, 'Who buys') ?? 'the buyer'
  const allowed = (field(text, 'Products must come from') ?? '')
    .replace(/\.$/, '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  const conceptBatch = {
    concepts: [
      {
        title: `${niche}: the obvious one`.slice(0, 90),
        promptBrief:
          `OFFLINE DEVELOPMENT CONCEPT — written by the offline model client, not by a ` +
          `model. A simple centred composition about ${niche}, aimed at ${audience}. ` +
          'Bold lettering, generous margins, no background scene.',
        style: 'flat-vector',
        // Two if the division sells two, one if it sells one, and the vet rejects the
        // whole concept if this ends up empty — so fall back to a type every POD
        // division has rather than to nothing.
        products: allowed.length > 0 ? allowed.slice(0, 2) : ['mug_11oz'],
        whyThisOne: 'Offline development concept. It is not an argument, it is a placeholder.',
      },
    ],
    skipped: [],
  }

  return [textCheck, plan, conceptBatch, { ok: true }]
}

export function createOfflineModelClient(): ModelClient {
  return {
    async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const text = textOf(request)

      for (const candidate of candidates(request as StructuredRequest<unknown>)) {
        const parsed = request.schema.safeParse(candidate)
        if (parsed.success) {
          return {
            output: parsed.data as T,
            usage: {
              model: request.model,
              // Plausible, stable numbers so cost accounting and the ledger have
              // something real-shaped to add up.
              inputTokens: 900 + (hashOf(text) % 400),
              outputTokens: 180 + (hashOf(text) % 120),
            },
          }
        }
      }

      throw new Error(
        'offline model client has no canned response matching the requested schema; ' +
          'add one to candidates() in integrations/anthropic/offline.ts',
      )
    },
  }
}
