import type { AgentContext, AgentDefinition } from '@acf/core/runtime'
import { NonRetriableError } from '@acf/core/runtime'
import { opportunities, type Database } from '@acf/db'
import { eq } from 'drizzle-orm'

import { intakeOutputSchema, type IntakeInput, type IntakeOutput } from './schema'

/**
 * The template agent.
 *
 * Takes an idea, records it as an `opportunity`, and asks the operator what to do
 * with it. Deliberately calls no external API: a scaffold you can run the moment you
 * create the division proves the wiring — registry, task, approval, inbox — without
 * first needing credentials.
 *
 * Note what it does NOT have: a Postgres schema of its own. A new division can go a
 * long way on core `entities`, `opportunities` and `ledger` before it earns dedicated
 * tables, and not having them is what makes it cheap to delete.
 */
export interface IntakeDeps {
  db: Database
}

export function createIntakeAgent(deps: IntakeDeps): AgentDefinition<IntakeInput, IntakeOutput> {
  return {
    key: 'intake',
    outputSchema: intakeOutputSchema,

    async run(ctx: AgentContext<IntakeInput>): Promise<IntakeOutput> {
      const title = ctx.input.title?.trim()
      if (!title) {
        throw new NonRetriableError('intake needs a title; nothing to record')
      }

      const summary =
        ctx.input.summary?.trim() ?? `Recorded by ${ctx.agent.name} with no further detail.`

      // Idempotent on the title within this division, so a redelivered event does not
      // record the same idea twice.
      const existing = await deps.db
        .select()
        .from(opportunities)
        .where(eq(opportunities.divisionId, ctx.division.id))
      const already = existing.find((o) => o.title === title)

      const row =
        already ??
        (
          await deps.db
            .insert(opportunities)
            .values({
              divisionId: ctx.division.id,
              source: `agent:${ctx.agent.name}`,
              title,
              summary,
              url: ctx.input.url ?? null,
              status: 'new',
              evaluatedBy: ctx.agent.name,
              actor: `agent:${ctx.agent.id}`,
            })
            .returning()
        )[0]

      if (!row) throw new Error('failed to record the opportunity')

      await ctx.log('template.recorded', `recorded "${title}"`, {
        refTable: 'opportunities',
        refId: row.id,
      })

      ctx.remember({
        kind: 'fact',
        content: `Recorded the idea "${title}".`,
        importance: 0.3,
      })

      const outcome = await ctx.requestApproval({
        kind: 'intake',
        category: 'idea',
        refTable: 'opportunities',
        refId: row.id,
        summary: title,
        payload: { title, summary, url: ctx.input.url ?? null },
      })

      return {
        opportunityId: row.id,
        approvalId: outcome.approval.id,
        status: outcome.status === 'duplicate' ? 'already_requested' : 'approval_requested',
      }
    },
  }
}
