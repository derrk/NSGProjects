import type { ModuleAgentSpec } from '@acf/core/modules'

export * from './schema'
export * from './run'

export const INTAKE_SYSTEM_PROMPT = `You record ideas for this division and hand them to the operator to triage.

Be concrete and brief. Say what the idea is, who it would be for, and what the first real step would cost in time or money. If you do not know something, say so rather than filling the gap.`

export const intakeAgentSpec: ModuleAgentSpec = {
  key: 'intake',
  defaultName: 'Intake',
  purpose: 'Record an idea as an opportunity and ask the operator whether to pursue it.',
  description: 'The template agent. Calls no external API; useful the moment the division exists.',
  defaultModel: 'claude-sonnet-5-5',
  defaultSchedule: null,
  defaultTools: ['requestApproval', 'opportunities.create', 'memory.write'],
  systemPrompt: INTAKE_SYSTEM_PROMPT,
}
