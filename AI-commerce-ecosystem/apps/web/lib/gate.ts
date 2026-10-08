import 'server-only'

import type { GateDeps } from '@acf/core/approvals'
import { db } from '@acf/db'
import { approvalStore, eventBus, eventSink, inngest, newId, ruleStore, systemClock } from '@acf/jobs'

/**
 * Wire the approval gate to the real database and the real event bus.
 *
 * The gate itself knows nothing about either — see packages/core/src/approvals.
 */
export function gateDeps(): GateDeps {
  const database = db()
  return {
    approvals: approvalStore(database),
    rules: ruleStore(database),
    events: eventSink(database),
    bus: eventBus(inngest),
    clock: systemClock,
    newId,
  }
}
