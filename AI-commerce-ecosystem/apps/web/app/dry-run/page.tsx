import { runPetNicheWalkthrough } from '@acf/pod/walkthrough'

export const dynamic = 'force-dynamic'

const ROOM_LABEL = {
  research: 'Research lab',
  factory: 'Factory',
  publishing: 'Publishing room',
  orders: 'Order floor',
  comms: 'Comms lab',
  treasury: 'Treasury',
} as const

const PROVENANCE_TAG = {
  simulated: 'is-flagged',
  estimated: '',
  verified: 'is-cleared',
} as const

/**
 * The whole pipeline, run on demand, with nothing real touched.
 *
 * Rendered from the same function the tests assert against rather than from a
 * fixture of what it once produced — a hand-written fixture would keep rendering a
 * green screen long after the pipeline behind it stopped working.
 */
export default async function DryRunPage() {
  const result = await runPetNicheWalkthrough({
    // The inbox is bypassed here on purpose, and the page says so below. This screen
    // demonstrates the chain; the approval it stands in for is the real one in
    // Quarantine.
    approve: async (request) => ({
      approvalId: `dry-run:${request.what.slice(0, 24)}`,
      approvedBy: 'dry run (no human asked)',
    }),
  })

  const gates = result.steps.filter((s) => s.humanGate).length

  return (
    <>
      <h1 className="screen-title">Dry Run</h1>
      <p className="screen-sub">
        One pet portrait poster on Etsy, one hair remover on Shopify, start to finish.
      </p>

      <div className="notice">
        <strong>Nothing here is real.</strong> Every figure on this page is fictional, every
        listing is simulated, and no order, message, or payment reached any outside service. The
        research numbers were invented for this walkthrough and are not market data. The approvals
        below were auto-granted so the chain could run end to end &mdash; the real gate is in
        Quarantine.
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Steps</span>
          <span className="stat-value">{result.steps.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Human gates</span>
          <span className="stat-value is-waiting">{gates}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Reached a real service</span>
          <span className="stat-value">0</span>
        </div>
        <div className="stat">
          <span className="stat-label">Money moved</span>
          <span className="stat-value">$0.00</span>
        </div>
      </div>

      <h2 className="section-title">The chain</h2>
      {result.steps.map((step, i) => (
        <article className="crate" key={step.key}>
          <div className="crate-head">
            <h3 className="crate-title">
              <span
                className={`light ${
                  step.humanGate
                    ? 'light-amber'
                    : step.provenance === 'verified'
                      ? 'light-green'
                      : 'light-red'
                }`}
              />
              {String(i + 1).padStart(2, '0')} &middot; {step.title}
            </h3>
            <span className="hash">{ROOM_LABEL[step.room]}</span>
          </div>
          <div className="crate-body">
            <ul className="tags">
              <li className={`tag ${PROVENANCE_TAG[step.provenance]}`}>{step.provenance}</li>
              {step.humanGate ? <li className="tag is-flagged">human gate</li> : null}
            </ul>
            <p style={{ margin: '0 0 12px', fontSize: 13 }}>{step.detail}</p>
            {step.facts && step.facts.length > 0 ? (
              <table className="roster">
                <tbody>
                  {step.facts.map((fact, j) => (
                    <tr key={`${step.key}-${j}`}>
                      <td style={{ width: '22%', fontSize: 11, color: 'var(--muted)' }}>
                        {fact.label}
                      </td>
                      <td style={{ fontSize: 12 }}>{fact.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </article>
      ))}

      <h2 className="section-title">The support reply that was not sent</h2>
      <article className="crate">
        <div className="crate-head">
          <h3 className="crate-title">
            <span className="light light-amber" />
            Draft to {result.supportDraft.to}
          </h3>
          <span className="hash">never sent</span>
        </div>
        <div className="crate-body">
          <p className="hash" style={{ marginTop: 0 }}>
            {result.supportDraft.subject}
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              margin: 0,
              fontFamily: 'inherit',
              color: 'var(--muted)',
            }}
          >
            {result.supportDraft.body}
          </pre>
        </div>
      </article>

      {result.findings.length > 0 ? (
        <>
          <h2 className="section-title">Rule findings raised along the way</h2>
          <table className="roster">
            <tbody>
              {result.findings.map((f, i) => (
                <tr key={`${f.rule}-${i}`}>
                  <td style={{ width: 90 }}>
                    <span className={`tag ${f.severity === 'blocking' ? 'is-flagged' : ''}`}>
                      {f.severity}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div className="hash">{f.rule}</div>
                    {f.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  )
}
