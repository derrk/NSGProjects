/**
 * Run one agent from the command line, through the same executor the queue and the
 * "Run now" button use.
 *
 *   pnpm --filter @acf/web agent "Design bay"
 *   pnpm --filter @acf/web agent "Design bay" '{"conceptId":"..."}'
 *
 * Useful when the UI is not the fastest way to see what an agent did.
 */

import { agents, createDatabase, divisions, tasks } from '@acf/db'
import { executeTask, inngest } from '@acf/jobs'
import { eq } from 'drizzle-orm'

import { resolveAgentDefinition } from '../lib/modules'

async function main() {
  const [, , nameArg, inputArg] = process.argv
  if (!nameArg) {
    console.error('usage: agent "<agent name>" [input JSON]')
    process.exit(1)
  }

  const db = createDatabase()
  const rows = await db
    .select({ agent: agents, divisionName: divisions.name })
    .from(agents)
    .innerJoin(divisions, eq(agents.divisionId, divisions.id))

  const match = rows.find((r) => r.agent.name.toLowerCase() === nameArg.toLowerCase())
  if (!match) {
    console.error(`no agent named "${nameArg}". Known agents:`)
    for (const r of rows) console.error(`  - ${r.agent.name} (${r.divisionName})`)
    process.exit(1)
  }

  const input: unknown = inputArg ? JSON.parse(inputArg) : {}

  const [task] = await db
    .insert(tasks)
    .values({
      divisionId: match.agent.divisionId,
      agentId: match.agent.id,
      title: `${match.agent.name}: cli run`,
      input,
      source: 'operator',
      priority: 100,
      actor: 'operator',
    })
    .returning()

  console.log(`running ${match.agent.name} (task ${task!.id}) ...`)
  const result = await executeTask(task!.id, {
    db,
    resolveAgent: resolveAgentDefinition,
    bus: inngest,
  })

  console.log(JSON.stringify(result, null, 2))
  process.exit(result.status === 'ok' ? 0 : 1)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
