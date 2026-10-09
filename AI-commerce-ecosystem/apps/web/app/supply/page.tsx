import { db, ledger } from '@acf/db'
import { sql } from 'drizzle-orm'

import { integrationMatrix, OWNER_SETUP_STEPS, readIntegrationEnv } from '@acf/pod/integrations'

export const dynamic = 'force-dynamic'

const MODE_LABEL = {
  live: 'live',
  demo: 'demo',
  manual: 'yours to do',
} as const

export default async function SupplyLinesPage() {
  const env = readIntegrationEnv()
  const matrix = integrationMatrix(env)

  const liveCount = matrix.filter((i) => i.mode === 'live').length
  const anythingLive = liveCount > 0

  // What the environment cannot tell you: whether anything has ever been spent.
  const [counted] = await db()
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(ledger)
  const ledgerRowCount = counted?.n ?? 0

  return (
    <>
      <h1 className="screen-title">Supply Lines</h1>
      <p className="screen-sub">
        What is actually connected, and what is pretending. {liveCount} of {matrix.length} live.
      </p>

      {/*
        Present tense, deliberately.

        This page reads the environment, which describes how THIS process is
        configured and nothing else. An earlier version said "nothing in this system
        has reached an outside service" — a claim about history, from a current env
        read. Run an agent with a real ANTHROPIC_API_KEY, restart with
        ACF_MOCK_INTEGRATIONS=1, and the page would assert that nothing had ever
        happened while the ledger held the metered spend from the run that did.

        The ledger is the thing that knows what happened. This says what is wired.
      */}
      {!anythingLive ? (
        <div className="notice">
          <strong>Nothing is connected right now</strong> — no integration in this process can
          reach an outside service, so nothing done from here will create a listing, place an
          order, send a message or spend money. That describes how this process is configured,
          not its history: a run with real credentials at any point would still have spent and
          would still be in the ledger. <a href="/treasury">Treasury</a> is the record of what
          actually happened{ledgerRowCount > 0 ? ` — ${ledgerRowCount} entries so far` : ''}.
        </div>
      ) : (
        <div className="notice">
          <strong>{liveCount} live connection(s)</strong> — actions through these reach real
          services and can cost real money. Everything else is simulated.{' '}
          <a href="/treasury">Treasury</a> is the record of what has actually been spent.
        </div>
      )}

      <h2 className="section-title">Integrations</h2>
      <table className="roster">
        <thead>
          <tr>
            <th>Service</th>
            <th>Mode</th>
            <th>What it does right now</th>
            <th>To go live</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((i) => (
            <tr key={i.key}>
              <td>
                <strong>{i.label}</strong>
                {i.requires.length > 0 ? (
                  <div className="hash">{i.requires.join(', ')}</div>
                ) : null}
              </td>
              <td>
                <span
                  className={`tag ${
                    i.mode === 'live' ? 'is-cleared' : i.mode === 'manual' ? 'is-flagged' : ''
                  }`}
                >
                  {MODE_LABEL[i.mode]}
                </span>
              </td>
              <td style={{ fontSize: 12 }}>{i.summary}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                {i.toGoLive ?? '—'}
                {i.deepLink ? (
                  <>
                    {' '}
                    <a href={i.deepLink} target="_blank" rel="noreferrer noopener">
                      open
                    </a>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title">Yours to do</h2>
      <div className="notice">
        <strong>No agent can do these</strong> — identity, banking and tax go through each
        platform&apos;s own flow, and none of it is stored in this system.
      </div>
      <table className="roster">
        <tbody>
          {OWNER_SETUP_STEPS.map((s) => (
            <tr key={s.key}>
              <td style={{ width: '30%' }}>
                <strong>{s.label}</strong>
              </td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.why}</td>
              <td style={{ width: 70 }}>
                {s.deepLink ? (
                  <a className="act" href={s.deepLink} target="_blank" rel="noreferrer noopener">
                    open
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
