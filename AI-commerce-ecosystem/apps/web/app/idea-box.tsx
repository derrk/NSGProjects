'use client'

import { useActionState } from 'react'

import { submitIdea, type IdeaState } from './actions'

export interface DivisionOption {
  id: string
  name: string
}

/**
 * The research desk.
 *
 * Step one of the demo workflow: an operator types an idea and an agent takes it.
 * Deliberately on the home screen — if dropping in an idea takes three clicks to
 * reach, it does not get used.
 */
export function IdeaBox({ divisions }: { divisions: DivisionOption[] }) {
  const [state, action, pending] = useActionState<IdeaState, FormData>(submitIdea, {})

  if (divisions.length === 0) {
    return (
      <p className="field-hint">
        No active division to hand an idea to. Raise one in <a href="/divisions">Outfits</a> first.
      </p>
    )
  }

  return (
    <form action={action} className="build-form" style={{ maxWidth: '100%' }}>
      <div className="field">
        <label htmlFor="idea-title">The idea</label>
        <input
          id="idea-title"
          name="title"
          placeholder="Dog-themed enamel pins"
          required
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="idea-summary">What you know about it</label>
        <input
          id="idea-summary"
          name="summary"
          placeholder="Sells alongside apparel in the same niches; different supplier though."
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="idea-division">Who should look at it</label>
        <select id="idea-division" name="divisionId" defaultValue={divisions[0]?.id ?? ''}>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="actions" style={{ borderTop: 'none', paddingTop: 0 }}>
        <button className="act clear" type="submit" disabled={pending}>
          {pending ? 'Running…' : 'Hand it over'}
        </button>
      </div>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="form-ok" role="status">
          {state.ok}{' '}
          {state.taskId ? <a href={`/archives/${state.taskId}`}>See the record</a> : null}
        </p>
      ) : null}
    </form>
  )
}
