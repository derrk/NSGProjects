/**
 * Relational metadata for `db.query.*`.
 *
 * drizzle-orm 0.45.x `relations()` API. Do NOT reach for `defineRelations` from the
 * 1.0 release candidate — that export does not exist on the stable line.
 */

import { relations } from 'drizzle-orm'

import { approvalRules, approvals } from './governance'
import { entities, events, ledger, opportunities } from './knowledge'
import { agents, divisions, goals, modules } from './registry'
import { agentMemory, agentRuns, tasks } from './work'

export const modulesRelations = relations(modules, ({ many }) => ({
  divisions: many(divisions),
}))

export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  module: one(modules, { fields: [divisions.moduleId], references: [modules.id] }),
  agents: many(agents),
  goals: many(goals),
  tasks: many(tasks),
  approvals: many(approvals),
  approvalRules: many(approvalRules),
  entities: many(entities),
  opportunities: many(opportunities),
  ledger: many(ledger),
  events: many(events),
}))

export const agentsRelations = relations(agents, ({ one, many }) => ({
  division: one(divisions, { fields: [agents.divisionId], references: [divisions.id] }),
  runs: many(agentRuns),
  memories: many(agentMemory),
  tasks: many(tasks),
  goals: many(goals),
}))

export const goalsRelations = relations(goals, ({ one }) => ({
  division: one(divisions, { fields: [goals.divisionId], references: [divisions.id] }),
  agent: one(agents, { fields: [goals.agentId], references: [agents.id] }),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  division: one(divisions, { fields: [tasks.divisionId], references: [divisions.id] }),
  agent: one(agents, { fields: [tasks.agentId], references: [agents.id] }),
  runs: many(agentRuns),
  approvals: many(approvals),
}))

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  agent: one(agents, { fields: [agentRuns.agentId], references: [agents.id] }),
  task: one(tasks, { fields: [agentRuns.taskId], references: [tasks.id] }),
  division: one(divisions, { fields: [agentRuns.divisionId], references: [divisions.id] }),
}))

export const agentMemoryRelations = relations(agentMemory, ({ one }) => ({
  agent: one(agents, { fields: [agentMemory.agentId], references: [agents.id] }),
  division: one(divisions, { fields: [agentMemory.divisionId], references: [divisions.id] }),
}))

export const approvalsRelations = relations(approvals, ({ one }) => ({
  division: one(divisions, { fields: [approvals.divisionId], references: [divisions.id] }),
  task: one(tasks, { fields: [approvals.taskId], references: [tasks.id] }),
}))

export const opportunitiesRelations = relations(opportunities, ({ one }) => ({
  division: one(divisions, { fields: [opportunities.divisionId], references: [divisions.id] }),
}))

export const ledgerRelations = relations(ledger, ({ one }) => ({
  division: one(divisions, { fields: [ledger.divisionId], references: [divisions.id] }),
}))

export const entitiesRelations = relations(entities, ({ one }) => ({
  division: one(divisions, { fields: [entities.divisionId], references: [divisions.id] }),
}))

export const eventsRelations = relations(events, ({ one }) => ({
  division: one(divisions, { fields: [events.divisionId], references: [divisions.id] }),
  agent: one(agents, { fields: [events.agentId], references: [agents.id] }),
}))
