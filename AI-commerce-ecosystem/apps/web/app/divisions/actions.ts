'use server'

import { createDivision, DivisionSlugTakenError, UnknownModuleError } from '@acf/core/modules'
import { db, divisions } from '@acf/db'
import {
  agentStore,
  approvalRuleSeedStore,
  divisionStore,
  eventSink,
  moduleStore,
} from '@acf/jobs'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { MODULES } from '@/lib/modules'
import { requireOperator } from '@/lib/auth'

function registryDeps() {
  const database = db()
  return {
    modules: moduleStore(database),
    divisions: divisionStore(database),
    agents: agentStore(database),
    rules: approvalRuleSeedStore(database),
    events: eventSink(database),
  }
}

/** Turn a name into a url-safe slug, since the operator should not have to. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export interface CreateDivisionState {
  error?: string
  created?: string
}

/**
 * The "New division" button.
 *
 * Everything that makes a division real — its agents, its approval rules, its module
 * setup — is seeded by core from the module's own declaration. This action only
 * collects the name and the config.
 */
export async function createDivisionAction(
  _prev: CreateDivisionState,
  formData: FormData,
): Promise<CreateDivisionState> {
  // A server action is a POST endpoint with its own id, reachable without any page
  // ever rendering. The layout gate does not cover it; this does.
  await requireOperator()

  const name = String(formData.get('name') ?? '').trim()
  const moduleName = String(formData.get('moduleName') ?? '').trim()
  const activate = formData.get('activate') === 'on'
  const capDollars = Number(formData.get('dailyCap') ?? 25)

  if (!name) return { error: 'Give the division a name.' }
  if (!moduleName) return { error: 'Pick a module.' }

  const slug = slugify(name)
  if (!slug) return { error: 'That name has no letters or digits in it.' }

  try {
    const deps = registryDeps()
    const { division, agents } = await createDivision(
      { name, slug, moduleName, activate, config: {} },
      MODULES,
      deps,
    )

    if (Number.isFinite(capDollars) && capDollars > 0) {
      await db()
        .update(divisions)
        .set({ dailySpendCapCents: Math.round(capDollars * 100) })
        .where(eq(divisions.id, division.id))
    }

    revalidatePath('/divisions')
    revalidatePath('/')
    revalidatePath('/agents')

    return { created: `${division.name} is up, with ${agents.length} agent(s).` }
  } catch (err) {
    if (err instanceof DivisionSlugTakenError) {
      return { error: `A division already uses the slug "${slug}". Pick a different name.` }
    }
    if (err instanceof UnknownModuleError) {
      return { error: `No module named "${moduleName}" is registered.` }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Pause or resume a division. Pausing stops its agents within one scheduler tick. */
export async function setDivisionStatus(formData: FormData): Promise<void> {
  // A server action is a POST endpoint with its own id, reachable without any page
  // ever rendering. The layout gate does not cover it; this does.
  await requireOperator()

  const id = String(formData.get('divisionId') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!id) throw new Error('divisionId is required')
  if (status !== 'active' && status !== 'paused') {
    throw new Error(`unsupported status "${status}"`)
  }

  await db().update(divisions).set({ status, updatedAt: new Date() }).where(eq(divisions.id, id))

  revalidatePath('/divisions')
  revalidatePath('/')
}
