/**
 * The shared tool catalog (SPEC.md §Agent framework → Tools).
 *
 * Three rules this file exists to enforce:
 *
 *  - An agent may only call the tools listed on its row. The runtime builds the tool
 *    set per run and refuses anything outside it, so granting a capability is a
 *    database change the operator can see, not a prompt the model can talk its way
 *    around.
 *  - Tools do all external I/O and resolve credentials by NAME. An agent never sees a
 *    key, and no key reaches a prompt, a tool log or an event.
 *  - Every call is logged with its arguments, so what an agent actually did is
 *    reconstructible afterwards.
 */

import type { OutputValidator } from '../runtime/types'

/** Arguments and results over this many characters are truncated in the log. */
export const MAX_LOGGED_BODY = 2_048

export interface ToolContext {
  divisionId: string
  agentId: string
  agentName: string
  taskId: string | null
  /** May this agent read other divisions' data? Off unless the row says otherwise. */
  crossDivision: boolean
  /**
   * Resolve a credential by name to its value.
   *
   * Throws when it is not configured, which is deliberate: a tool that quietly
   * proceeds without credentials produces output that looks real and is not.
   */
  credential(name: string): Promise<string>
  log(
    kind: string,
    message: string,
    opts?: { level?: 'info' | 'warn' | 'error'; refTable?: string; refId?: string },
  ): Promise<void>
}

export interface ToolSpec<TInput = unknown, TOutput = unknown> {
  name: string
  /** Shown to the model. Say what it does AND what it refuses to do. */
  description: string
  inputSchema: OutputValidator<TInput>
  /** JSON Schema for the model's tool definition. */
  jsonSchema: Record<string, unknown>
  handler(input: TInput, ctx: ToolContext): Promise<TOutput>
  /** Rough cost per call in cents, for the run's estimate. */
  costCents?: number
  /**
   * True when this tool reaches outside the system. Marks its results as untrusted
   * data in the log, and lets the UI show which agents can touch the world.
   */
  external?: boolean
}

export type ToolResult =
  | { ok: true; output: unknown; costCents: number }
  | { ok: false; error: string; costCents: number }

export class UnknownToolError extends Error {
  constructor(readonly tool: string) {
    super(`no tool named "${tool}" is registered`)
    this.name = 'UnknownToolError'
  }
}

export class ToolNotGrantedError extends Error {
  constructor(
    readonly tool: string,
    readonly agent: string,
  ) {
    super(`agent "${agent}" is not granted the tool "${tool}"`)
    this.name = 'ToolNotGrantedError'
  }
}

export class CredentialNotConfiguredError extends Error {
  constructor(readonly credentialName: string) {
    super(
      `the credential "${credentialName}" is not configured. Add it to the credentials ` +
        `table and set the environment variable it names.`,
    )
    this.name = 'CredentialNotConfiguredError'
  }
}

/** Shorten a value for the event log without losing what it was. */
export function truncateForLog(value: unknown): string {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text.length <= MAX_LOGGED_BODY) return text
  return `${text.slice(0, MAX_LOGGED_BODY)}… [${text.length - MAX_LOGGED_BODY} more characters]`
}
