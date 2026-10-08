import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type * as z from 'zod'

import type { TokenUsage } from '@acf/core/runtime'

/**
 * The model client every agent reasons through.
 *
 * Model choice follows SPEC.md — Sonnet for routine passes, Opus for design
 * concepting and escalations — but with current ids. The spec names
 * `claude-sonnet-4-6` and `claude-opus-4-6`, which are a generation stale.
 */
export const MODELS = {
  /** Routine work: prompt writing, classification, listing copy, vision checks. */
  routine: 'claude-sonnet-5-5',
  /** Concepting, ranking and customer escalations. */
  deep: 'claude-opus-5-5',
} as const

export type ModelName = (typeof MODELS)[keyof typeof MODELS]

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ImagePart {
  kind: 'image'
  base64: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
}

export interface TextPart {
  kind: 'text'
  text: string
}

export type Part = TextPart | ImagePart

export interface StructuredRequest<T> {
  model: ModelName
  system: string
  /** Text and images, in order. Images must come before the text that refers to them. */
  parts: Part[]
  schema: z.ZodType<T>
  maxTokens?: number
  effort?: Effort
}

export interface StructuredResult<T> {
  output: T
  usage: TokenUsage
}

export interface ModelClient {
  structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>
}

function toContentBlocks(parts: Part[]): Anthropic.ContentBlockParam[] {
  return parts.map((part) =>
    part.kind === 'text'
      ? { type: 'text', text: part.text }
      : {
          type: 'image',
          source: { type: 'base64', media_type: part.mediaType, data: part.base64 },
        },
  )
}

export interface AnthropicOptions {
  apiKey?: string
  client?: Anthropic
}

export function createModelClient(options: AnthropicOptions = {}): ModelClient {
  const client =
    options.client ??
    new Anthropic(options.apiKey === undefined ? {} : { apiKey: options.apiKey })

  return {
    async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const message = await client.messages.parse({
        model: request.model,
        max_tokens: request.maxTokens ?? 16_000,
        system: request.system,
        messages: [{ role: 'user', content: toContentBlocks(request.parts) }],
        output_config: {
          // Structured outputs, NOT a forced tool_choice. Current models reject
          // tool_choice "any"/"tool" with a 400, so the pattern SPEC.md describes
          // ("tool use with tool_choice forced on the final structured output") no
          // longer works.
          format: zodOutputFormat(request.schema),
          effort: request.effort ?? 'medium',
        },
      })

      const parsed = message.parsed_output
      if (parsed === null || parsed === undefined) {
        // Thrown so the agent run wrapper treats it as a retriable failure and the
        // next attempt is told what went wrong.
        throw new Error('model returned no parseable structured output')
      }

      return {
        output: parsed as T,
        usage: {
          model: request.model,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          ...(message.usage.cache_creation_input_tokens == null
            ? {}
            : { cacheCreationInputTokens: message.usage.cache_creation_input_tokens }),
          ...(message.usage.cache_read_input_tokens == null
            ? {}
            : { cacheReadInputTokens: message.usage.cache_read_input_tokens }),
        },
      }
    },
  }
}
