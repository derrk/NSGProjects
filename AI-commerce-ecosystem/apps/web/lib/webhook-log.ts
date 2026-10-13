/**
 * Writing a line about a webhook without writing the webhook into the log.
 *
 * The events table is rendered on the floor, on the division screens and in the
 * archive export. An order payload contains a customer's email, their shipping
 * address and whatever they typed into a personalisation field — so the rule here
 * is that the caller passes a MESSAGE IT COMPOSED, never a payload, and this helper
 * has no way to accept one.
 *
 * It also never throws. A webhook that fails because its log line failed turns a
 * note into a retry, and the order is the thing that matters.
 */

import { events } from '@acf/db'

/** Hard ceiling, so one long error string cannot bloat a table read on four screens. */
export const MAX_LOG_CHARS = 500

export interface WebhookLogLine {
  divisionId: string
  kind: string
  level: 'info' | 'warn' | 'error'
  message: string
  refTable?: string
  refId?: string
}

export async function logWebhook(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural db type
  database: any,
  line: WebhookLogLine,
): Promise<void> {
  try {
    await database.insert(events).values({
      divisionId: line.divisionId,
      kind: line.kind,
      level: line.level,
      message: line.message.slice(0, MAX_LOG_CHARS),
      refTable: line.refTable ?? null,
      refId: line.refId ?? null,
    })
  } catch (err) {
    // Console only. There is nowhere else to put it — the place this would go is
    // the thing that just failed.
    console.error(`[webhook] could not log "${line.kind}": ${err instanceof Error ? err.message : String(err)}`)
  }
}
