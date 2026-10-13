/**
 * Shopify order webhooks.
 *
 * The first endpoint in this app that an outsider can reach and that writes to the
 * database. Everything below is shaped by that.
 *
 * WHY THE DIVISION IS IN THE PATH
 * A webhook arrives at a URL, and the URL is the only thing that says which shop it
 * belongs to before the signature can be checked. `X-Shopify-Shop-Domain` is a
 * header, and headers are not covered by the HMAC — trusting one to pick which
 * division's secret to verify against would let a caller choose their own verifier.
 * The slug picks the division, the division picks the secret, and the signature
 * either matches that secret or the request is refused.
 *
 * WHY IT RETURNS FAST
 * Shopify gives a webhook five seconds and retries anything slower, so a handler
 * that routes the order inline turns one slow supplier lookup into duplicate
 * deliveries. This records the order and queues the work, which is also why
 * ingestion has to be idempotent — and it is, by unique index rather than by check.
 *
 * WHAT IT DOES NOT DO
 * It does not route, spend, or message anyone. It writes an order and a task. Every
 * consequential thing downstream still passes a gate.
 */

import { db, tasks, divisions, agents } from '@acf/db'
import { inngest } from '@acf/jobs'
import { ingestOrder, shopifyOrderPayloadSchema, toIncomingOrder } from '@acf/pod'
import { and, eq } from 'drizzle-orm'

import {
  MAX_WEBHOOK_BODY_BYTES,
  SHOPIFY_HMAC_HEADER,
  SHOPIFY_TOPIC_HEADER,
  topicIngests,
  verifyShopifySignature,
  webhookSecretFor,
} from '@/lib/webhook-auth'
import { logWebhook } from '@/lib/webhook-log'

/** Needs the database driver, so Node rather than Edge. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Every reply is a bare status with a short string.
 *
 * Nothing about why a signature failed, which division exists, or what the database
 * said. An unauthenticated caller learns whether their signature was right and
 * nothing else; the detail goes to the event log where the operator can see it.
 */
function reply(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params

  /*
   * Size first, before anything is read.
   *
   * The signature cannot be verified until the whole body is in memory, so the body
   * is read before the caller is trusted. Content-Length is a claim, which is why
   * the actual byte length is checked again below — but refusing an obviously huge
   * request without reading it is still worth doing.
   */
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BODY_BYTES) {
    return reply(413, 'too large')
  }

  let raw: ArrayBuffer
  try {
    raw = await request.arrayBuffer()
  } catch {
    return reply(400, 'unreadable body')
  }
  if (raw.byteLength > MAX_WEBHOOK_BODY_BYTES) return reply(413, 'too large')

  const topic = (request.headers.get(SHOPIFY_TOPIC_HEADER) ?? '').trim().toLowerCase()
  const database = db()

  /* ---------------- whose shop ---------------- */

  const [division] = await database
    .select()
    .from(divisions)
    .where(eq(divisions.slug, slug))
    .limit(1)

  /*
   * A 404 for an unknown slug, before the signature check.
   *
   * There is nothing to verify against — no division, no secret — so there is no
   * check to perform. The slug is not a secret: it is in a URL somebody pasted into
   * Shopify's admin, and whether a division exists is not information worth
   * protecting with a constant-time comparison.
   */
  if (!division) return reply(404, 'unknown shop')

  const secret = webhookSecretFor(slug, (name) => process.env[name])
  const verdict = await verifyShopifySignature(
    raw,
    request.headers.get(SHOPIFY_HMAC_HEADER),
    secret,
  )

  if (!verdict.ok) {
    await logWebhook(database, {
      divisionId: division.id,
      kind: verdict.status === 503 ? 'pod.webhook_unconfigured' : 'pod.webhook_rejected',
      level: verdict.status === 503 ? 'error' : 'warn',
      message: `shopify ${topic || '(no topic)'}: ${verdict.reason}`,
    })
    return reply(verdict.status, verdict.status === 503 ? 'not configured' : 'bad signature')
  }

  /* ---------------- from here the caller holds the shop's secret ---------------- */

  if (!topicIngests(topic)) {
    // 200 so Shopify stops. A topic enabled by mistake is a misconfiguration, and
    // answering it with an error turns that into a retry queue that never drains.
    return reply(200, 'ignored')
  }

  if (division.status !== 'active') {
    /*
     * A shuttered division still RECORDS its orders.
     *
     * Pausing stops agents doing work; it does not stop customers buying, and an
     * order dropped here is money taken for a parcel nobody will ever hear about.
     * The task below is what is skipped, not the order.
     */
    await logWebhook(database, {
      divisionId: division.id,
      kind: 'pod.webhook_division_paused',
      level: 'warn',
      message: `${division.name} is ${division.status}; the order is recorded but nothing will act on it`,
    })
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return reply(400, 'not json')
  }

  const parsed = shopifyOrderPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    await logWebhook(database, {
      divisionId: division.id,
      kind: 'pod.webhook_unreadable',
      level: 'error',
      message: `shopify ${topic}: the payload is not a shape this can read`,
    })
    // 200: redelivering the same unreadable payload will not make it readable, and
    // the operator has an error in the log to act on.
    return reply(200, 'unreadable payload')
  }

  const mapped = toIncomingOrder(parsed.data)
  if (!mapped.ok) {
    await logWebhook(database, {
      divisionId: division.id,
      kind: 'pod.webhook_refused',
      level: 'error',
      message: `shopify ${topic} ${String(parsed.data.id)}: ${mapped.reason}`,
    })
    return reply(200, 'refused')
  }

  for (const warning of mapped.warnings) {
    await logWebhook(database, {
      divisionId: division.id,
      kind: 'pod.webhook_warning',
      level: 'warn',
      message: `shopify order ${mapped.order.channelOrderId}: ${warning}`,
    })
  }

  /* ---------------- record it ---------------- */

  let result: Awaited<ReturnType<typeof ingestOrder>>
  try {
    result = await ingestOrder(database as never, division.id, mapped.order)
  } catch (err) {
    /*
     * 500 on purpose, so Shopify retries.
     *
     * This is the one failure where losing the delivery loses the order. Ingestion
     * is idempotent, so a retry is free; silently answering 200 would mean a
     * customer paid and nothing in here knows.
     */
    await logWebhook(database, {
      divisionId: division.id,
      kind: 'pod.webhook_ingest_failed',
      level: 'error',
      message: `shopify order ${mapped.order.channelOrderId}: ${err instanceof Error ? err.message : String(err)}`,
    })
    return reply(500, 'could not record')
  }

  await logWebhook(database, {
    divisionId: division.id,
    kind: 'pod.order_received',
    level: 'info',
    // The order id and the counts. Not the payload, not the email, not what the
    // buyer typed into a personalisation field — the events table is read on
    // several screens and exported in the archive.
    message:
      `shopify order ${mapped.order.channelOrderId}: ` +
      (result.created ? 'recorded' : 'already recorded') +
      `, ${result.linesCreated} new line(s), ${result.linesSkipped} already seen`,
    refTable: 'pod.orders',
    refId: result.orderId,
  })

  /* ---------------- hand the work to the queue ---------------- */

  if (result.created && division.status === 'active') {
    /*
     * Only on the FIRST delivery, and only through the ordinary task queue.
     *
     * `result.created` is the idempotency signal — a redelivered webhook reports
     * false and queues nothing, so Shopify's retries cannot pile up duplicate
     * routing runs against one order.
     */
    const [fulfiller] = await database
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.divisionId, division.id),
          eq(agents.moduleAgentKey, 'fulfillment'),
          eq(agents.status, 'active'),
        ),
      )
      .limit(1)

    if (fulfiller) {
      const [task] = await database
        .insert(tasks)
        .values({
          divisionId: division.id,
          agentId: fulfiller.id,
          title: `Order ${mapped.order.orderNumber ?? mapped.order.channelOrderId}`,
          input: { orderId: result.orderId },
          // 'event' rather than a new enum value: the task_source enum is
          // schedule/event/operator/agent, and an order arriving from outside is an
          // event by any reading of it.
          source: 'event' as const,
          priority: 90,
          actor: 'system',
        })
        .returning()

      if (task) {
        // Sent after the row exists. The reverse order has the worker arrive before
        // the task it was told about.
        await inngest.send({ name: 'task.created', data: { taskId: task.id } }).catch(async (err) => {
          // The order and the task are both saved; only the nudge failed. The
          // scheduler will not pick this up on its own, so it has to be visible.
          await logWebhook(database, {
            divisionId: division.id,
            kind: 'pod.order_dispatch_failed',
            level: 'error',
            message:
              `order ${mapped.order.channelOrderId} is recorded and a task is queued, but the ` +
              `event bus could not be reached (${err instanceof Error ? err.message : String(err)}); ` +
              'nothing will route it until that task is run',
            refTable: 'pod.orders',
            refId: result.orderId,
          })
        })
      }
    } else {
      await logWebhook(database, {
        divisionId: division.id,
        kind: 'pod.order_unrouted',
        level: 'warn',
        message:
          `order ${mapped.order.channelOrderId} is recorded, but ${division.name} has no active ` +
          'Fulfilment desk, so nothing will route it',
        refTable: 'pod.orders',
        refId: result.orderId,
      })
    }
  }

  return reply(200, 'ok')
}

/**
 * Anything other than POST.
 *
 * Shopify only POSTs. A GET here is somebody poking at the URL, and it should learn
 * nothing from the answer — including whether the slug is real.
 */
export async function GET(): Promise<Response> {
  return reply(405, 'method not allowed')
}
