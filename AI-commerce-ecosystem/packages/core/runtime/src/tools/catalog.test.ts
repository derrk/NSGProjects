import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ToolCatalog } from './catalog'
import {
  MAX_LOGGED_BODY,
  truncateForLog,
  UnknownToolError,
  type ToolContext,
  type ToolSpec,
} from './types'

const logged: Array<{ kind: string; message: string; level: string }> = []

function context(over: Partial<ToolContext> = {}): ToolContext {
  return {
    divisionId: 'div_1',
    agentId: 'agent_1',
    agentName: 'Intake',
    taskId: 'task_1',
    crossDivision: false,
    credential: async (name) => `secret-for-${name}`,
    log: async (kind, message, opts) => {
      logged.push({ kind, message, level: opts?.level ?? 'info' })
    },
    ...over,
  }
}

const echo: ToolSpec<{ text: string }, { echoed: string }> = {
  name: 'echo',
  description: 'Echo the text back.',
  inputSchema: {
    parse(value) {
      const v = value as { text?: unknown }
      if (typeof v?.text !== 'string') throw new Error('text must be a string')
      return { text: v.text }
    },
  },
  jsonSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  async handler(input) {
    return { echoed: input.text }
  },
  costCents: 0.5,
}

const explodes: ToolSpec<Record<string, never>, never> = {
  name: 'explodes',
  description: 'Always fails.',
  inputSchema: { parse: () => ({}) as Record<string, never> },
  jsonSchema: { type: 'object', properties: {} },
  async handler() {
    throw new Error('the upstream service is down')
  },
}

beforeEach(() => {
  logged.length = 0
})

describe('registration', () => {
  it('lists registered tools', () => {
    const catalog = new ToolCatalog([echo, explodes])
    expect(catalog.names()).toEqual(['echo', 'explodes'])
    expect(catalog.has('echo')).toBe(true)
    expect(catalog.has('nope')).toBe(false)
  })

  it('refuses two tools with the same name', () => {
    // An ambiguous grant works silently until the wrong one runs.
    expect(() => new ToolCatalog([echo, { ...echo }])).toThrow(/already registered/)
  })
})

describe('forAgent', () => {
  const catalog = new ToolCatalog([echo, explodes])

  it('returns only the granted tools', () => {
    expect(catalog.forAgent(['echo']).map((t) => t.name)).toEqual(['echo'])
  })

  it('throws when a grant names a tool that does not exist', () => {
    // Otherwise the operator believes the agent can do something it cannot, and finds
    // out mid-run when the model asks for a tool that is not there.
    expect(() => catalog.forAgent(['echo', 'ghost'])).toThrow(UnknownToolError)
  })

  it('builds the definitions the model is shown', () => {
    const [def] = catalog.definitionsFor(['echo'])
    expect(def).toEqual({
      name: 'echo',
      description: 'Echo the text back.',
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    })
  })
})

describe('invoke', () => {
  const catalog = new ToolCatalog([echo, explodes])

  it('runs a granted tool and returns its output', async () => {
    const result = await catalog.invoke('echo', { text: 'hello' }, context(), ['echo'])
    expect(result).toEqual({ ok: true, output: { echoed: 'hello' }, costCents: 0.5 })
  })

  it('logs the call with its arguments and result', async () => {
    await catalog.invoke('echo', { text: 'hello' }, context(), ['echo'])
    const entry = logged.find((l) => l.kind === 'tool.called')
    expect(entry!.message).toContain('hello')
    expect(entry!.message).toContain('echoed')
  })

  it('refuses a tool the agent was not granted', async () => {
    const result = await catalog.invoke('echo', { text: 'hi' }, context(), ['explodes'])

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: expect.stringContaining('not granted') })
    // An agent reaching for a capability it does not have is worth seeing.
    expect(logged.find((l) => l.kind === 'tool.refused')?.level).toBe('warn')
  })

  it('does not run the handler for an ungranted tool', async () => {
    const spy = vi.fn()
    const catalogWithSpy = new ToolCatalog([{ ...echo, handler: spy }])
    await catalogWithSpy.invoke('echo', { text: 'hi' }, context(), [])
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns an error for an unknown tool rather than throwing', async () => {
    const result = await catalog.invoke('ghost', {}, context(), ['ghost'])
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('no tool named') })
  })

  it('hands invalid arguments back to the model instead of crashing', async () => {
    const result = await catalog.invoke('echo', { text: 42 }, context(), ['echo'])

    // The model can see this and correct itself; a thrown error would kill the run.
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('invalid arguments') })
    expect(logged.find((l) => l.kind === 'tool.invalid_args')?.level).toBe('warn')
  })

  it('turns a failing tool into an error result, logged at error level', async () => {
    const result = await catalog.invoke('explodes', {}, context(), ['explodes'])

    expect(result).toMatchObject({ ok: false, error: 'the upstream service is down' })
    expect(logged.find((l) => l.kind === 'tool.failed')?.level).toBe('error')
  })

  it('still charges for a tool that failed after doing work', async () => {
    const paid: ToolSpec = {
      ...explodes,
      name: 'paid',
      costCents: 2,
    }
    const c = new ToolCatalog([paid])
    expect(await c.invoke('paid', {}, context(), ['paid'])).toMatchObject({ costCents: 2 })
  })

  it('charges nothing for a call that never ran', async () => {
    expect(await catalog.invoke('echo', { text: 1 }, context(), ['echo'])).toMatchObject({
      costCents: 0,
    })
  })

  it('passes the division and agent through to the handler', async () => {
    let seen: ToolContext | undefined
    const c = new ToolCatalog([
      {
        ...echo,
        async handler(_input, ctx) {
          seen = ctx
          return { echoed: '' }
        },
      },
    ])

    await c.invoke('echo', { text: 'x' }, context({ divisionId: 'div_cards' }), ['echo'])
    expect(seen!.divisionId).toBe('div_cards')
    expect(seen!.agentName).toBe('Intake')
  })
})

describe('truncateForLog', () => {
  it('leaves a short value alone', () => {
    expect(truncateForLog({ a: 1 })).toBe('{"a":1}')
  })

  it('truncates a long one and says how much was dropped', () => {
    const long = 'x'.repeat(MAX_LOGGED_BODY + 500)
    const out = truncateForLog(long)

    expect(out.length).toBeLessThan(long.length)
    expect(out).toContain('500 more characters')
  })

  it('survives a value that cannot be serialised', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(() => truncateForLog(circular)).not.toThrow()
  })
})
