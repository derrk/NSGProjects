'use client'

import { useActionState } from 'react'

import type { ConfigFieldSpec } from '@acf/core/modules'

import { setDivisionConfig, type ConfigState } from './actions'

export interface ConfigFormProps {
  divisionId: string
  divisionName: string
  fields: ConfigFieldSpec[]
  /** Current values, already stringified for the inputs by the server. */
  values: Record<string, string>
}

/**
 * The settings a module says it reads.
 *
 * Generated from the module's own declaration rather than written per module, so
 * core never learns what a Printify shop is and a module that adds a setting gets a
 * screen for it without touching this file.
 *
 * `printifyShopId` lived only in a jsonb column until the Loading bay started failing
 * on it, and the failure message was the only documentation that the field existed.
 * This is that documentation, in the place somebody would look.
 */
export function ConfigForm({ divisionId, divisionName, fields, values }: ConfigFormProps) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(setDivisionConfig, {})

  if (fields.length === 0) return null

  return (
    <form action={action} className="config-form">
      <input type="hidden" name="divisionId" value={divisionId} />

      {fields.map((field) => {
        const value = values[field.key] ?? ''
        const missing = value.trim() === ''
        return (
          <div className="config-field" key={field.key}>
            <label htmlFor={`${divisionId}-${field.key}`}>{field.label}</label>
            <input
              id={`${divisionId}-${field.key}`}
              name={field.key}
              type="text"
              defaultValue={value}
              placeholder={field.placeholder}
              autoComplete="off"
            />
            <p className="hash">{field.help}</p>
            {missing && field.requiredFor ? (
              // Said here rather than discovered from a failed run at two in the
              // morning. An empty setting that stops an agent is not a blank field,
              // it is a broken pipeline, and the screen should say which.
              <p className="config-blocked">Not set — {field.requiredFor}</p>
            ) : null}
          </div>
        )
      })}

      <p className="hash config-note">
        Settings, not secrets. These are stored in plain text and appear in the archive
        export — API tokens belong in environment variables, never here.
      </p>

      <button className="act" type="submit" disabled={pending}>
        {pending ? 'Saving…' : `Save ${divisionName} settings`}
      </button>

      {state.error ? <p className="config-error">{state.error}</p> : null}
      {state.ok ? (
        <p className="hash" role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  )
}
