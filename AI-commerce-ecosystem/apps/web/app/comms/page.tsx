import { db, divisions } from '@acf/db'
import { podSchema, storedFactsOnly } from '@acf/pod'
import { desc, eq, inArray } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

const { messages, replies, orders } = podSchema

/**
 * The comms lab.
 *
 * Everything this system might ever say to a customer passes through here, and
 * nothing has ever left. That is not a milestone still to come — `send_email` has no
 * send path in the tool catalog at all, deliberately, because the most reliable way
 * to guarantee a human sees outbound mail is for the sending code not to exist.
 *
 * So the first number on the page is the count of messages sent, it is zero, and it
 * is computed rather than written down. If a send path is ever added and used, this
 * figure moves on its own and the claim above stops being made.
 */

const INTENT_LABEL: Record<string, string> = {
  shipping_eta: 'Where is it',
  sizing: 'Sizing',
  tracking: 'Tracking',
  refund: 'Refund',
  complaint: 'Complaint',
  custom: 'Custom request',
  other: 'Other',
}

function when(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16)
}

export default async function CommsPage() {
  const database = db()

  const divisionRows = await database.select().from(divisions)
  const divisionName = new Map(divisionRows.map((d) => [d.id, d.name]))
  const divisionIds = divisionRows.map((d) => d.id)

  const messageRows =
    divisionIds.length > 0
      ? await database
          .select()
          .from(messages)
          .where(inArray(messages.divisionId, divisionIds))
          .orderBy(desc(messages.receivedAt))
          .limit(100)
      : []

  const replyRows =
    divisionIds.length > 0
      ? await database
          .select()
          .from(replies)
          .where(inArray(replies.divisionId, divisionIds))
          .orderBy(desc(replies.createdAt))
          .limit(100)
      : []

  const orderRows =
    divisionIds.length > 0
      ? await database.select().from(orders).where(inArray(orders.divisionId, divisionIds))
      : []
  const orderById = new Map(orderRows.map((o) => [o.id, o]))
  const messageById = new Map(messageRows.map((m) => [m.id, m]))

  /*
   * Counted, not asserted. If a send path is ever added and used, this moves on its
   * own and the "nothing has been sent" banner below stops being shown — rather than
   * the banner staying true-looking because nobody remembered to take it down.
   */
  const sentCount = replyRows.filter((r) => r.status === 'sent' || r.autoSent).length
  const drafted = replyRows.filter((r) => r.status === 'pending_approval')
  const rejected = replyRows.filter((r) => r.status === 'rejected')
  const escalated = messageRows.filter((m) => m.status === 'escalated')

  return (
    <>
      <h1 className="screen-title">Comms Lab</h1>
      <p className="screen-sub">
        Everything this system might say to a customer. None of it has left.
      </p>

      {sentCount === 0 ? (
        <div className="notice">
          <strong>Nothing has ever been sent from this system.</strong> Not a holdback and not a
          milestone — <code>send_email</code> has no send path in the tool catalog. It files a
          draft and stops. The most reliable way to guarantee a human sees outbound mail is for
          the sending code not to exist.
        </div>
      ) : (
        <div className="notice">
          <strong>{sentCount} message(s) have been sent.</strong> A send path now exists. Every
          one of these reached a real person, and the drafts below are not hypothetical.
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Sent, ever</span>
          <span className="stat-value">{sentCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Drafts waiting</span>
          <span className={`stat-value ${drafted.length > 0 ? 'is-waiting' : ''}`}>
            {drafted.length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Escalated unanswered</span>
          <span className={`stat-value ${escalated.length > 0 ? 'is-waiting' : ''}`}>
            {escalated.length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Inbound on file</span>
          <span className="stat-value">{messageRows.length}</span>
        </div>
      </div>

      <h2 className="section-title">Drafts waiting on a human</h2>
      {drafted.length === 0 ? (
        <div className="all-quiet">
          <strong>No drafts.</strong> The Support deck writes them; it is seeded paused until its
          runner is wired, so nothing has drafted anything yet.
        </div>
      ) : (
        drafted.map((reply) => {
          const message = messageById.get(reply.messageId)
          const order = message?.orderId ? orderById.get(message.orderId) : null

          /*
           * Only the record goes under "facts it was allowed to use".
           *
           * cited_data also carries the model's OWN account of what it cited, which
           * is never checked against anything. Rendering that under a heading saying
           * "facts" made the operator's check circular: they compared the draft
           * against a list the same model wrote, and a sentence like "made in
           * Portland from recycled cotton" — which no grounding check covers —
           * appeared as its own evidence.
           */
          const stored = (reply.citedData ?? {}) as Record<string, unknown>
          const cited = storedFactsOnly(stored)
          const asStrings = (value: unknown): string[] =>
            Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
          const modelClaimed = asStrings(stored['modelClaimedFacts'])
          const recordNotes = asStrings(stored['recordNotes'])
          const groundingWarnings = asStrings(stored['groundingWarnings'])

          return (
            <article className="crate" key={reply.id}>
              <div className="crate-head">
                <h3 className="crate-title">
                  <span className="light light-amber" />
                  {message?.subject ?? 'Reply'}
                </h3>
                <span className="hash">
                  {divisionName.get(reply.divisionId) ?? reply.divisionId} &middot;{' '}
                  {when(reply.createdAt)}
                </span>
              </div>
              <div className="crate-body">
                <ul className="tags">
                  <li className="tag is-flagged">not sent</li>
                  {message?.intent ? (
                    <li className="tag">{INTENT_LABEL[message.intent] ?? message.intent}</li>
                  ) : null}
                  {order ? <li className="tag">order {order.orderNumber ?? order.id}</li> : null}
                </ul>

                {message ? (
                  <>
                    <p className="hash" style={{ marginTop: 0 }}>
                      Customer wrote, {when(message.receivedAt)} — treated as data, never as
                      instructions
                    </p>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        margin: '0 0 14px',
                        fontFamily: 'inherit',
                        color: 'var(--muted)',
                        borderLeft: '2px solid var(--edge)',
                        paddingLeft: 10,
                      }}
                    >
                      {message.body}
                    </pre>
                  </>
                ) : null}

                <p className="hash" style={{ marginTop: 0 }}>
                  Drafted reply
                </p>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                    margin: '0 0 14px',
                    fontFamily: 'inherit',
                  }}
                >
                  {reply.body}
                </pre>

                {Object.keys(cited).length > 0 ? (
                  <>
                    {/*
                      The only facts the draft was allowed to use. Shown because it is
                      what makes a wrong promise traceable: if the reply claims
                      something that is not in here, the draft invented it.
                    */}
                    <p className="hash" style={{ marginBottom: 4 }}>
                      Facts it was allowed to use
                    </p>
                    <table className="roster">
                      <tbody>
                        {Object.entries(cited).map(([k, v]) => (
                          <tr key={k}>
                            <td style={{ width: '28%', fontSize: 11, color: 'var(--muted)' }}>
                              {k}
                            </td>
                            <td style={{ fontSize: 12 }}>
                              {v === null || v === undefined ? '—' : String(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="hash" style={{ margin: 0 }}>
                    No cited facts recorded. A draft with nothing behind it cannot be checked.
                  </p>
                )}

                {recordNotes.length > 0 ? (
                  <>
                    {/*
                      What the record could not tell us. A substituted placed-at date
                      says so here, and the draft is not allowed to state it.
                    */}
                    <p className="hash" style={{ marginTop: 14, marginBottom: 4 }}>
                      Gaps in the record
                    </p>
                    <ul className="tags" style={{ display: 'block', margin: 0 }}>
                      {recordNotes.map((note, i) => (
                        <li key={`note-${i}`} style={{ fontSize: 12, color: 'var(--amber)' }}>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {groundingWarnings.length > 0 ? (
                  <>
                    <p className="hash" style={{ marginTop: 14, marginBottom: 4 }}>
                      Grounding warnings, not blocking
                    </p>
                    <ul className="tags" style={{ display: 'block', margin: 0 }}>
                      {groundingWarnings.map((w, i) => (
                        <li key={`warn-${i}`} style={{ fontSize: 12, color: 'var(--amber)' }}>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {modelClaimed.length > 0 ? (
                  <>
                    {/*
                      Deliberately NOT under "facts". This is the model's own account
                      of what it cited, checked against nothing — useful for spotting
                      a claim the grounding checks do not cover, worthless as evidence.
                    */}
                    <p className="hash" style={{ marginTop: 14, marginBottom: 4 }}>
                      What the model SAYS it used — its own claim, verified by nothing
                    </p>
                    <ul className="tags" style={{ display: 'block', margin: 0 }}>
                      {modelClaimed.map((claim, i) => (
                        <li key={`claim-${i}`} style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {claim}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </article>
          )
        })
      )}

      <h2 className="section-title">Escalated, deliberately unanswered</h2>
      <div className="notice">
        Refunds, cancellations, changes and damage claims are decisions, not questions. No agent
        drafts a reply to one — a plausible draft makes the wrong answer easy to send by reflex.
      </div>
      {escalated.length === 0 ? (
        <div className="all-quiet">
          <strong>Nothing escalated.</strong>
        </div>
      ) : (
        <table className="roster">
          <tbody>
            {escalated.map((m) => (
              <tr key={m.id}>
                <td style={{ width: 120 }} className="hash">
                  {when(m.receivedAt)}
                </td>
                <td style={{ width: 130 }}>
                  <span className="tag is-flagged">
                    {m.intent ? (INTENT_LABEL[m.intent] ?? m.intent) : 'unclassified'}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>
                  <strong>{m.subject ?? '(no subject)'}</strong>
                  <div className="hash">{m.fromEmail ?? 'unknown sender'}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rejected.length > 0 ? (
        <>
          <h2 className="section-title">Drafts the operator rejected</h2>
          <p className="screen-sub">
            Kept rather than deleted. What a draft got wrong is the only evidence for whether the
            agent is getting better.
          </p>
          <table className="roster">
            <tbody>
              {rejected.map((r) => (
                <tr key={r.id}>
                  <td style={{ width: 120 }} className="hash">
                    {when(r.createdAt)}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.body.slice(0, 180)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  )
}
