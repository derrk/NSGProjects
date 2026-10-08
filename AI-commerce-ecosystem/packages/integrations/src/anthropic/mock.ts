import type { ModelClient, StructuredRequest, StructuredResult } from './client'

export interface MockModelClient extends ModelClient {
  readonly requests: StructuredRequest<unknown>[]
}

/**
 * A model client that returns scripted answers.
 *
 * `queue` is consumed in order, one entry per `structured()` call. An entry that is an
 * Error is thrown instead of returned, which is how a test exercises the run wrapper's
 * retry path.
 */
export function createMockModelClient(queue: unknown[]): MockModelClient {
  const requests: StructuredRequest<unknown>[] = []
  let index = 0

  return {
    requests,
    async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      requests.push(request as StructuredRequest<unknown>)
      if (index >= queue.length) throw new Error('mock model client: queue exhausted')
      const next = queue[index++]
      if (next instanceof Error) throw next
      return {
        output: next as T,
        usage: { model: request.model, inputTokens: 1_000, outputTokens: 200 },
      }
    },
  }
}
