/**
 * What to tell the operator after an agent takes their idea.
 *
 * A pure function, apart from the server action, because the thing it decides is the
 * kind of claim this project keeps getting wrong: the Research Desk printed "It is
 * waiting in Quarantine" on every successful run, including the runs that
 * deliberately filed nothing. A scout that correctly refused to invent a market
 * because no search provider was configured told the operator its findings were
 * waiting for them. They would open Quarantine, find nothing, and have no way to
 * tell a refusal from a bug.
 *
 * The rule: say it is waiting only when something is waiting. An agent that filed
 * nothing says WHY, in its own words, because with this system the reason is the
 * finding — "every result was simulated" is the most useful sentence that run could
 * produce.
 */

export interface IdeaOutcome {
  message: string
  /** True when there is actually a card in the inbox to go and look at. */
  filed: boolean
}

export function describeIdeaOutcome(agentName: string, output: unknown): IdeaOutcome {
  const o = (output ?? {}) as Record<string, unknown>

  const approvalId = typeof o['approvalId'] === 'string' ? o['approvalId'].trim() : ''
  if (approvalId) {
    return { message: `${agentName} filed it. It is waiting in Quarantine.`, filed: true }
  }

  /*
   * `rejected` before any other signal.
   *
   * An agent that found nothing puts the reason here, and the first entry is the one
   * it considered worth leading with. Checked for shape rather than trusted: this
   * comes back through a jsonb column and an agent that returns a bare string would
   * otherwise print "[object Object]" at the operator.
   */
  const rejected = Array.isArray(o['rejected']) ? o['rejected'] : []
  for (const entry of rejected) {
    const reason = (entry as { reason?: unknown } | null)?.reason
    if (typeof reason === 'string' && reason.trim()) {
      return { message: `${agentName} looked and filed nothing: ${reason.trim()}`, filed: false }
    }
  }

  return { message: `${agentName} ran and filed nothing for you to decide.`, filed: false }
}
