'use client'

import { useActionState } from 'react'

import { signIn, type SignInState } from './actions'

const INITIAL: SignInState = { error: null }

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL)

  return (
    <form action={action} className="build-form">
      <div className="field">
        <label htmlFor="passphrase">Operator passphrase</label>
        <input
          id="passphrase"
          name="passphrase"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
        <p className="field-hint">
          One passphrase, one operator. This does not identify anyone — two people who both
          know it are indistinguishable in every log this system keeps.
        </p>
      </div>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button className="act" type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Open up'}
      </button>
    </form>
  )
}
