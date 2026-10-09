/**
 * The rest of the core tools.
 *
 * The knowledge-layer ones run against real SQL because their whole job is writing
 * rows correctly. The external ones are tested for the thing that actually matters
 * about them: that an offline adapter says it is offline, and that nothing reaches
 * outside without being marked untrusted.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { agents, divisions, entities, ledger, opportunities, tasks } from '@acf/db'
import { createTestDatabase, type TestDatabase } from '@acf/db/testing'
import type { ToolContext } from '@acf/core/tools'

import {
  createEmbedTextTool,
  createFetchPageTool,
  createWebSearchTool,
  htmlToText,
  localLexicalEmbeddingProvider,
  simulatedSearchProvider,
  UNTRUSTED_PREAMBLE,
} from './external-tools'
import {
  createEntitySearchTool,
  createEntityUpsertTool,
  createLedgerTool,
  createOpportunityTool,
  createTaskTool,
  scoreOpportunity,
} from './knowledge-tools'
import { createSendEmailTool } from './index'

let h: TestDatabase
const logged: Array<{ kind: string; message: string; level: string }> = []

beforeAll(async () => {
  h = await createTestDatabase()
}, 120_000)

afterAll(async () => {
  await h.close()
})

beforeEach(async () => {
  await h.truncate()
  logged.length = 0
})

async function seedDivision(name = 'POD') {
  const [division] = await h.db
    .insert(divisions)
    .values({ name, slug: name.toLowerCase(), type: 'pod', status: 'active' })
    .returning()
  const [agent] = await h.db
    .insert(agents)
    .values({ divisionId: division!.id, name: 'Analyst', model: 'claude-sonnet-5-5' })
    .returning()
  return { division: division!, agent: agent! }
}

function ctxFor(divisionId: string, agentId: string, over: Partial<ToolContext> = {}): ToolContext {
  return {
    divisionId,
    agentId,
    agentName: 'Analyst',
    taskId: null,
    crossDivision: false,
    credential: async (name) => `secret-${name}`,
    log: async (kind, message, opts) => {
      logged.push({ kind, message, level: opts?.level ?? 'info' })
    },
    ...over,
  }
}

/* ------------------------------------------------------------------ *
 * entities
 * ------------------------------------------------------------------ */

describe('entities.upsert', () => {
  it('creates a record scoped to the division', async () => {
    const { division, agent } = await seedDivision()
    const tool = createEntityUpsertTool(h.db as never)

    const out = (await tool.handler(
      { type: 'customer', name: 'Ada Lovelace', externalIds: { shopify: '1' } },
      ctxFor(division.id, agent.id),
    )) as { created: boolean }

    expect(out.created).toBe(true)
    const [row] = await h.db.select().from(entities)
    expect(row).toMatchObject({ divisionId: division.id, type: 'customer', name: 'Ada Lovelace' })
  })

  it('merges into an existing record rather than replacing it', async () => {
    const { division, agent } = await seedDivision()
    const tool = createEntityUpsertTool(h.db as never)
    const ctx = ctxFor(division.id, agent.id)

    await tool.handler({ type: 'customer', name: 'Ada', externalIds: { shopify: '1' } }, ctx)
    const out = (await tool.handler(
      { type: 'customer', name: 'Ada', externalIds: { printify: '2' } },
      ctx,
    )) as { created: boolean }

    expect(out.created).toBe(false)
    const rows = await h.db.select().from(entities)
    expect(rows).toHaveLength(1)
    // A call that learns one new id must not erase the ids another call found.
    expect(rows[0]!.externalIds).toEqual({ shopify: '1', printify: '2' })
  })

  it('treats the same name under a different type as a different record', async () => {
    const { division, agent } = await seedDivision()
    const tool = createEntityUpsertTool(h.db as never)
    const ctx = ctxFor(division.id, agent.id)

    await tool.handler({ type: 'customer', name: 'Acme' }, ctx)
    await tool.handler({ type: 'supplier', name: 'Acme' }, ctx)

    expect(await h.db.select().from(entities)).toHaveLength(2)
  })
})

describe('entities.search', () => {
  it('only returns the agent’s own division by default', async () => {
    const a = await seedDivision('Alpha')
    const b = await seedDivision('Beta')
    const upsert = createEntityUpsertTool(h.db as never)

    await upsert.handler({ type: 'lead', name: 'Shared Name' }, ctxFor(a.division.id, a.agent.id))
    await upsert.handler({ type: 'lead', name: 'Shared Name' }, ctxFor(b.division.id, b.agent.id))

    const search = createEntitySearchTool(h.db as never)
    const out = (await search.handler({ query: 'Shared' }, ctxFor(a.division.id, a.agent.id))) as {
      count: number
    }

    // Customer and lead data stays inside its division without an explicit grant.
    expect(out.count).toBe(1)
  })

  it('reaches across divisions when the agent is granted it', async () => {
    const a = await seedDivision('Alpha')
    const b = await seedDivision('Beta')
    const upsert = createEntityUpsertTool(h.db as never)

    await upsert.handler({ type: 'lead', name: 'Shared' }, ctxFor(a.division.id, a.agent.id))
    await upsert.handler({ type: 'lead', name: 'Shared' }, ctxFor(b.division.id, b.agent.id))

    const search = createEntitySearchTool(h.db as never)
    const out = (await search.handler(
      { query: 'Shared' },
      ctxFor(a.division.id, a.agent.id, { crossDivision: true }),
    )) as { count: number }

    expect(out.count).toBe(2)
  })
})

/* ------------------------------------------------------------------ *
 * opportunities
 * ------------------------------------------------------------------ */

describe('scoreOpportunity', () => {
  it('rewards profit and confidence, punishes hours and risk', () => {
    const base = { estProfitCents: 10_000, confidence: 0.8, hoursRequired: 4, risk: 'low' as const }

    expect(scoreOpportunity(base)).toBeGreaterThan(
      scoreOpportunity({ ...base, confidence: 0.2 }),
    )
    expect(scoreOpportunity(base)).toBeGreaterThan(
      scoreOpportunity({ ...base, hoursRequired: 40 }),
    )
    expect(scoreOpportunity(base)).toBeGreaterThan(scoreOpportunity({ ...base, risk: 'high' }))
  })

  it('never divides by zero when no hours are given', () => {
    expect(Number.isFinite(scoreOpportunity({ estProfitCents: 1000, hoursRequired: 0 }))).toBe(true)
  })

  it('treats a missing estimate as zero rather than as free money', () => {
    expect(scoreOpportunity({})).toBe(0)
  })
})

describe('opportunities.create', () => {
  it('records and scores it', async () => {
    const { division, agent } = await seedDivision()
    const tool = createOpportunityTool(h.db as never)

    const out = (await tool.handler(
      {
        title: 'Enamel pins',
        summary: 'Same audience, different product.',
        estProfitCents: 50_000,
        confidence: 0.6,
        hoursRequired: 10,
        risk: 'med',
      },
      ctxFor(division.id, agent.id),
    )) as { score: number }

    expect(out.score).toBeGreaterThan(0)
    const [row] = await h.db.select().from(opportunities)
    expect(row).toMatchObject({ title: 'Enamel pins', status: 'new', evaluatedBy: 'Analyst' })
  })
})

/* ------------------------------------------------------------------ *
 * tasks and ledger
 * ------------------------------------------------------------------ */

describe('tasks.create', () => {
  it('queues work and records who asked for it', async () => {
    const { division, agent } = await seedDivision()
    const tool = createTaskTool(h.db as never)

    await tool.handler(
      { title: 'Check the comps', input: { sku: 'x' } },
      ctxFor(division.id, agent.id),
    )

    const [row] = await h.db.select().from(tasks)
    expect(row).toMatchObject({ title: 'Check the comps', source: 'agent', divisionId: division.id })
  })

  it('links a subtask to the task that spawned it', async () => {
    const { division, agent } = await seedDivision()
    const [parent] = await h.db
      .insert(tasks)
      .values({ divisionId: division.id, title: 'parent', input: {}, source: 'operator' })
      .returning()

    const tool = createTaskTool(h.db as never)
    await tool.handler({ title: 'child' }, ctxFor(division.id, agent.id, { taskId: parent!.id }))

    const [child] = await h.db.select().from(tasks).where(eq(tasks.title, 'child'))
    expect(child!.parentTaskId).toBe(parent!.id)
  })

  it('refuses to assign work to an agent that is not in this division', async () => {
    const a = await seedDivision('Alpha')
    await seedDivision('Beta')
    const tool = createTaskTool(h.db as never)

    await expect(
      tool.handler({ title: 'x', agentName: 'Nobody' }, ctxFor(a.division.id, a.agent.id)),
    ).rejects.toThrow(/no agent named/)
  })
})

describe('ledger.post', () => {
  it('records a signed entry', async () => {
    const { division, agent } = await seedDivision()
    const tool = createLedgerTool(h.db as never)

    await tool.handler(
      { kind: 'revenue', amountCents: 2_500, source: 'invoice:stripe' },
      ctxFor(division.id, agent.id),
    )

    const [row] = await h.db.select().from(ledger)
    expect(row).toMatchObject({ kind: 'revenue', source: 'invoice:stripe' })
    expect(Number(row!.amountCents)).toBe(2_500)
  })

  it('refuses to let an agent post api_cost', async () => {
    const { division, agent } = await seedDivision()
    const tool = createLedgerTool(h.db as never)

    // Metered by the runtime from real token usage. An agent's guess must not be
    // mixed in with it.
    await expect(
      tool.handler(
        { kind: 'api_cost' as never, amountCents: -1, source: 'agent' },
        ctxFor(division.id, agent.id),
      ),
    ).rejects.toThrow(/recorded by the runtime/)
  })
})

/* ------------------------------------------------------------------ *
 * external tools
 * ------------------------------------------------------------------ */

describe('web_search', () => {
  it('marks simulated results as simulated, loudly', async () => {
    const tool = createWebSearchTool(simulatedSearchProvider())
    const out = (await tool.handler({ query: 'nurse gifts' }, ctxFor('d', 'a'))) as {
      provider: string
      note: string
      results: Array<{ provenance: string; title: string; snippet: string }>
    }

    expect(out.provider).toBe('simulated')
    expect(out.results.every((r) => r.provenance === 'simulated')).toBe(true)
    // Plausible-looking fake results are worse than none: an agent cites them and the
    // citation looks checkable.
    expect(out.results[0]!.title).toContain('SIMULATED')
    expect(out.results[0]!.snippet).toContain('not a real search result')
    expect(logged.find((l) => l.kind === 'tool.web_search')?.level).toBe('warn')
  })

  it('tells the model the results are untrusted data', async () => {
    const tool = createWebSearchTool(simulatedSearchProvider())
    const out = (await tool.handler({ query: 'x' }, ctxFor('d', 'a'))) as { note: string }
    expect(out.note).toBe(UNTRUSTED_PREAMBLE)
  })

  it('caps the number of results', async () => {
    const tool = createWebSearchTool(simulatedSearchProvider())
    const out = (await tool.handler({ query: 'x', maxResults: 50 }, ctxFor('d', 'a'))) as {
      results: unknown[]
    }
    expect(out.results.length).toBeLessThanOrEqual(10)
  })
})

describe('fetch_page', () => {
  const tool = createFetchPageTool()

  it.each([
    ['localhost', 'http://localhost:3000/admin'],
    ['loopback', 'http://127.0.0.1/secrets'],
    ['private range', 'http://192.168.1.1/'],
    ['link-local metadata', 'http://169.254.169.254/latest/meta-data/'],
  ])('refuses to fetch a %s address', async (_label, url) => {
    // Otherwise a research tool becomes a way to read the network it runs on.
    await expect(tool.handler({ url }, ctxFor('d', 'a'))).rejects.toThrow(/private or local/)
  })

  it.each([
    ['a file URL', 'file:///etc/passwd'],
    ['nonsense', 'not a url'],
  ])('refuses %s', async (_label, url) => {
    await expect(tool.handler({ url }, ctxFor('d', 'a'))).rejects.toThrow()
  })

  it('strips markup down to readable text', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><p>Hello &amp; welcome</p><script>evil()</script></body></html>'
    const text = htmlToText(html)

    expect(text).toBe('Hello & welcome')
    expect(text).not.toContain('evil')
    expect(text).not.toContain('color:red')
  })
})

describe('embed_text', () => {
  const tool = createEmbedTextTool(localLexicalEmbeddingProvider())

  it('says plainly that it is not semantic', async () => {
    const out = (await tool.handler({ text: 'a nurse mug' }, ctxFor('d', 'a'))) as {
      semantic: boolean
      provider: string
      vector: number[]
    }

    expect(out.semantic).toBe(false)
    expect(out.provider).toBe('local-lexical')
    expect(out.vector).toHaveLength(1536)
    expect(logged.find((l) => l.kind === 'tool.embed_text')?.level).toBe('warn')
  })

  it('is deterministic', async () => {
    const a = (await tool.handler({ text: 'coffee and chaos' }, ctxFor('d', 'a'))) as {
      vector: number[]
    }
    const b = (await tool.handler({ text: 'coffee and chaos' }, ctxFor('d', 'a'))) as {
      vector: number[]
    }
    expect(a.vector).toEqual(b.vector)
  })

  it('puts texts sharing vocabulary closer than texts that do not', async () => {
    const vec = async (text: string) =>
      ((await tool.handler({ text }, ctxFor('d', 'a'))) as { vector: number[] }).vector
    const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0)

    const base = await vec('funny nurse coffee mug')
    const similar = await vec('funny coffee mug for a nurse')
    const different = await vec('industrial filament extruder maintenance')

    expect(dot(base, similar)).toBeGreaterThan(dot(base, different))
  })

  it('returns a zero vector for text with no words, without dividing by zero', async () => {
    const out = (await tool.handler({ text: '!!! ???' }, ctxFor('d', 'a'))) as { vector: number[] }
    expect(out.vector.every((v) => v === 0)).toBe(true)
  })
})

describe('send_email', () => {
  it('does not send: it files the exact message for approval', async () => {
    const requested: Array<Record<string, unknown>> = []
    const tool = createSendEmailTool(async (input) => {
      requested.push(input as unknown as Record<string, unknown>)
      return { approval: { id: 'apr_1' } }
    })

    const out = (await tool.handler(
      {
        to: 'buyer@example.com',
        subject: 'About your order',
        body: 'It shipped today.',
        reason: 'Customer asked where it was.',
      },
      ctxFor('div_1', 'agent_1'),
    )) as { sent: boolean; status: string }

    expect(out.sent).toBe(false)
    expect(out.status).toBe('awaiting_approval')

    // The operator sees the exact payload and destination before approving.
    const payload = requested[0]!['payload'] as Record<string, unknown>
    expect(payload['to']).toBe('buyer@example.com')
    expect(payload['body']).toBe('It shipped today.')
    expect(requested[0]!['kind']).toBe('outreach_message')
  })
})
