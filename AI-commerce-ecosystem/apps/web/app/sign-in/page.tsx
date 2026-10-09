import { redirect } from 'next/navigation'

import { currentSession } from '@/lib/auth'

import { SignInForm } from './sign-in-form'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const session = await currentSession()

  // Already in, or no gate to pass. Either way this page has nothing to offer.
  if (session.status === 'valid' || session.status === 'open') redirect('/')

  if (session.status === 'misconfigured') {
    return (
      <>
        <h1 className="screen-title">Shut</h1>
        <div className="notice">
          <strong>The operator passphrase is not usable, so nothing is being served.</strong>
          <p style={{ marginBottom: 0 }}>{session.reason}</p>
        </div>
        <p className="screen-sub">
          Fixing the environment variable and restarting is the only way past this. The app
          will not fall back to running open — a gate that quietly stops being a gate is worse
          than never having had one.
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="screen-title">Who goes there</h1>
      <p className="screen-sub">Nothing past this point until you say the word.</p>
      <SignInForm />
    </>
  )
}
