import 'server-only'

import type { GateDeps } from '@acf/core/approvals'
import { db } from '@acf/db'
import {
  approvalStore,
  eventBus,
  eventSink,
  inngest,
  newId,
  ruleStore,
  spendGuard,
  systemClock,
  taskGate,
} from '@acf/jobs'

/**
 * Wire the approval gate to the real database and the real event bus.
 *
 * The gate itself knows nothing about either — see packages/core/runtime/src/approvals.
 */
export function gateDeps(): GateDeps {
  const database = db()
  return {
    approvals: approvalStore(database),
    rules: ruleStore(database),
    events: eventSink(database),
    bus: eventBus(inngest),
    tasks: taskGate(database),
    spendGuard: spendGuard(database),
    clock: systemClock,
    newId,
  }
}
