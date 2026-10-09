/**
 * Create a division from the command line.
 *
 * The same code path as the "New division" button, for when scripting a demo or a
 * reset is faster than clicking.
 *
 *   pnpm --filter @acf/web new-division "Filament Works" generic
 */

import { createDivision, registerModules } from '@acf/core/modules'
import { createDatabase } from '@acf/db'
import {
  agentStore,
  approvalRuleSeedStore,
  divisionStore,
  eventSink,
  moduleStore,
} from '@acf/jobs'

import { MODULES } from '../lib/modules'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  const [, , name, moduleName = 'generic'] = process.argv
  if (!name) {
    console.error('usage: new-division "<name>" [module]')
    console.error(`modules: ${MODULES.map((m) => m.name).join(', ')}`)
    process.exit(1)
  }

  const db = createDatabase()
  const deps = {
    modules: moduleStore(db),
    divisions: divisionStore(db),
    agents: agentStore(db),
    rules: approvalRuleSeedStore(db),
    events: eventSink(db),
  }

  await registerModules(MODULES, deps)

  const slug = slugify(name)
  if (await deps.divisions.findBySlug(slug)) {
    console.log(`division "${slug}" already exists; leaving it alone`)
    process.exit(0)
  }

  const { division, agents } = await createDivision(
    { name, slug, moduleName, activate: true },
    MODULES,
    deps,
  )

  console.log(`created "${division.name}" from ${moduleName} with ${agents.length} agent(s)`)
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
