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

export interface ConfigState {
  error?: string
  ok?: string
}

/**
 * Save the settings a module declared.
 *
 * MERGED into the existing config rather than replacing it. The form only renders the
 * fields the module declares TODAY, so a replace would silently drop anything written
 * by an older version of the module or by hand — and the operator would have no way
 * to know, because the screen never showed those keys in the first place.
 *
 * Nothing here is a secret and the form says so. This action does not enforce that —
 * it cannot know what somebody types — but it does refuse values long enough to be a
 * token pasted by mistake, which is the common way that goes wrong.
 */
export async function setDivisionConfig(
  _prev: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  // A server action is a POST endpoint with its own id, reachable without any page
  // ever rendering. The layout gate does not cover it; this does.
  await requireOperator()

  const divisionId = String(formData.get('divisionId') ?? '').trim()
  if (!divisionId) return { error: 'divisionId is required' }

  const database = db()
  const [division] = await database
    .select()
    .from(divisions)
    .where(eq(divisions.id, divisionId))
    .limit(1)
  if (!division) return { error: 'That division no longer exists.' }

  const mod = MODULES.find((m) => m.name === division.type)
  const fields = mod?.configFields ?? []
  if (fields.length === 0) {
    return { error: `The ${division.type} module declares no settings.` }
  }

  const next: Record<string, unknown> = { ...((division.config ?? {}) as object) }

  for (const field of fields) {
    const raw = formData.get(field.key)
    // A field the form did not submit is left alone, not cleared. Absent and empty
    // are different answers and only one of them is the operator's.
    if (raw === null) continue
    const value = String(raw).trim()

    if (value.length > 400) {
      return {
        error:
          `"${field.label}" is ${value.length} characters, which is too long to be a setting. ` +
          'If that is an API token it must not go here — tokens are environment variables.',
      }
    }

    if (value === '') {
      delete next[field.key]
      continue
    }

    next[field.key] =
      field.kind === 'list'
        ? [...new Set(value.split(',').map((p) => p.trim()).filter(Boolean))]
        : value
  }

  await database
    .update(divisions)
    .set({ config: next, updatedAt: new Date() })
    .where(eq(divisions.id, divisionId))

  revalidatePath('/divisions')
  revalidatePath('/supply')
  revalidatePath('/floor')

  return { ok: `Saved. ${division.name} picks these up on its next run.` }
}
