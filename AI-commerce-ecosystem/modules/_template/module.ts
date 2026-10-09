/**
 * The scaffold for a new division (SPEC.md §Module interface).
 *
 * Copy this folder, rename it, and you have a division that already appears on the
 * floor, already routes through the one inbox, and already has a working agent. Then
 * replace the Intake agent with the ones your business actually needs.
 *
 * What it shows, and what to keep:
 *  - a module is declarative; core reads these rows and renders itself
 *  - every agent starts at `propose`; autonomy is earned per category
 *  - a division needs no Postgres schema of its own until it earns one
 *
 * The name must be a bare lowercase identifier: it becomes a Postgres schema if the
 * division ever adds tables, and the registry rejects anything else at boot.
 */

import type { ModuleDefinition } from '@acf/core/modules'

import { intakeAgentSpec } from './agents/intake/index'

export { createIntakeAgent, intakeAgentSpec } from './agents/intake/index'

export const templateModule: ModuleDefinition = {
  name: 'generic',
  version: '0.1.0',
  description: 'A blank division: record ideas, triage them, grow from there.',

  stations: [{ key: 'intake', label: 'Intake', agentKey: 'intake', counter: 'generic.ideas_today' }],

  approvalKinds: [
    {
      kind: 'intake',
      label: 'Idea',
      // No bespoke card: the inbox falls back to the generic JSON card, which is
      // exactly the point — a new division is never blocked on UI work.
    },
  ],

  agents: [intakeAgentSpec],

  async onDivisionCreate(ctx) {
    await ctx.log('Division created from the generic template. Intake is ready to run.')
  },
}

export default templateModule
