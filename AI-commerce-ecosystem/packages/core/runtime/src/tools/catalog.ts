/**
 * The tool catalog.
 *
 * Core tools plus every enabled module's tools, in one registry. An agent's row names
 * which of them it may call; this builds that subset and refuses everything else.
 */

import {
  ToolNotGrantedError,
  UnknownToolError,
  truncateForLog,
  type ToolContext,
  type ToolResult,
  type ToolSpec,
} from './types'

/** What the model is shown for one tool. */
export interface ModelToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export class ToolCatalog {
  private readonly specs = new Map<string, ToolSpec>()

  constructor(specs: readonly ToolSpec[] = []) {
    for (const spec of specs) this.register(spec)
  }

  register(spec: ToolSpec): void {
    if (this.specs.has(spec.name)) {
      // Two tools answering to one name means an agent's grant is ambiguous, which is
      // the kind of thing that silently works until the wrong one runs.
      throw new Error(`a tool named "${spec.name}" is already registered`)
    }
    this.specs.set(spec.name, spec)
  }

  has(name: string): boolean {
    return this.specs.has(name)
  }

  names(): string[] {
    return [...this.specs.keys()].sort()
  }

  get(name: string): ToolSpec | undefined {
    return this.specs.get(name)
  }

  /**
   * The tools one agent may use.
   *
   * A grant naming a tool that does not exist is an error, not a silent omission: the
   * operator believes that agent can do something it cannot, and the failure would
   * otherwise surface mid-run as the model asking for a tool that is not there.
   */
  forAgent(granted: readonly string[]): ToolSpec[] {
    const out: ToolSpec[] = []
    const missing: string[] = []
    for (const name of granted) {
      const spec = this.specs.get(name)
      if (spec) out.push(spec)
      else missing.push(name)
    }
    if (missing.length > 0) {
      throw new UnknownToolError(missing.join(', '))
    }
    return out
  }

  /** The tool definitions to send to the model for this agent. */
  definitionsFor(granted: readonly string[]): ModelToolDefinition[] {
    return this.forAgent(granted).map((spec) => ({
      name: spec.name,
      description: spec.description,
      input_schema: spec.jsonSchema,
    }))
  }

  /**
   * Run one tool call on an agent's behalf.
   *
   * Never throws for anything the model did wrong — an unknown tool, a tool it was not
   * granted, arguments that fail validation all come back as `ok: false` so the model
   * can see the error and correct itself. Only a genuine defect propagates.
   */
  async invoke(
    name: string,
    args: unknown,
    ctx: ToolContext,
    granted: readonly string[],
  ): Promise<ToolResult> {
    const spec = this.specs.get(name)
    if (!spec) {
      return { ok: false, error: new UnknownToolError(name).message, costCents: 0 }
    }
    if (!granted.includes(name)) {
      // The model asked for something the operator did not grant. Refused, and
      // recorded at warn level, because an agent reaching for a capability it does
      // not have is worth seeing.
      const err = new ToolNotGrantedError(name, ctx.agentName)
      await ctx.log('tool.refused', err.message, { level: 'warn' })
      return { ok: false, error: err.message, costCents: 0 }
    }

    let input: unknown
    try {
      input = spec.inputSchema.parse(args)
    } catch (err) {
      const message = `invalid arguments for "${name}": ${describe(err)}`
      await ctx.log('tool.invalid_args', message, { level: 'warn' })
      return { ok: false, error: message, costCents: 0 }
    }

    const started = Date.now()
    try {
      const output = await spec.handler(input, ctx)
      await ctx.log(
        'tool.called',
        `${name}(${truncateForLog(input)}) → ${truncateForLog(output)}`,
      )
      return { ok: true, output, costCents: spec.costCents ?? 0 }
    } catch (err) {
      const message = describe(err)
      await ctx.log(
        'tool.failed',
        `${name}(${truncateForLog(input)}) failed after ${Date.now() - started}ms: ${message}`,
        { level: 'error' },
      )
      // Handed back to the model rather than thrown: a tool that cannot reach its
      // service is something the agent may be able to work around, and the run loop
      // already retries genuine faults.
      return { ok: false, error: message, costCents: spec.costCents ?? 0 }
    }
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
