import { integrationMatrix, OWNER_SETUP_STEPS, readIntegrationEnv } from '@acf/pod/integrations'

export const dynamic = 'force-dynamic'

const MODE_LABEL = {
  live: 'live',
  demo: 'demo',
  manual: 'yours to do',
} as const

export default function SupplyLinesPage() {
  const env = readIntegrationEnv()
  const matrix = integrationMatrix(env)

  const liveCount = matrix.filter((i) => i.mode === 'live').length
  const anythingLive = liveCount > 0

  return (
    <>
      <h1 className="screen-title">Supply Lines</h1>
      <p className="screen-sub">
        What is actually connected, and what is pretending. {liveCount} of {matrix.length} live.
      </p>

      {!anythingLive ? (
        <div className="notice">
          <strong>Everything is simulated</strong> — nothing in this system has reached an outside
          service. No listing exists, no order was placed, no message was sent, and no money has
          moved. Figures elsewhere in the app are modelled, not earned.
        </div>
      ) : (
        <div className="notice">
          <strong>{liveCount} live connection(s)</strong> — actions through these reach real
          services and can cost real money. Everything else is still simulated.
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
