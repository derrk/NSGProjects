'use client'

import { useActionState } from 'react'

import { createDivisionAction, type CreateDivisionState } from './actions'

export interface ModuleOption {
  name: string
  description: string
  agentCount: number
  stationCount: number
}

/**
 * The "New division" form.
 *
 * A client component only because it reports the result inline; everything it does
 * happens in the server action.
 */
export function NewDivisionForm({ modules }: { modules: ModuleOption[] }) {
  const [state, action, pending] = useActionState<CreateDivisionState, FormData>(
    createDivisionAction,
    {},
  )

  return (
    <form action={action} className="build-form">
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" placeholder="Filament Works" required autoComplete="off" />
      </div>

      <div className="field">
        <label htmlFor="moduleName">Built from</label>
        <select id="moduleName" name="moduleName" defaultValue={modules[0]?.name ?? ''}>
          {modules.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} — {m.agentCount} agent{m.agentCount === 1 ? '' : 's'}, {m.stationCount}{' '}
              station{m.stationCount === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <p className="field-hint">
          {modules.find((m) => m.name)?.description ??
            'A module supplies the agents, the approval kinds and the stations.'}
        </p>
      </div>

      <div className="field">
        <label htmlFor="dailyCap">Daily spend cap (USD)</label>
        <input id="dailyCap" name="dailyCap" type="number" min="1" step="1" defaultValue="25" />
        <p className="field-hint">Breaching it pauses this division&apos;s agents.</p>
      </div>

      <div className="field field-check">
        <label htmlFor="activate">
          <input id="activate" name="activate" type="checkbox" defaultChecked />
          Start it running
        </label>
        <p className="field-hint">
          Agents still begin at <code>propose</code>; nothing acts on its own until a category
          earns it.
        </p>
      </div>

      <div className="actions" style={{ borderTop: 'none', paddingTop: 0 }}>
        <button className="act clear" type="submit" disabled={pending}>
          {pending ? 'Raising\u2026' : 'Raise division'}
        </button>
      </div>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.created ? (
        <p className="form-ok" role="status">
          {state.created}
        </p>
      ) : null}
    </form>
  )
}
