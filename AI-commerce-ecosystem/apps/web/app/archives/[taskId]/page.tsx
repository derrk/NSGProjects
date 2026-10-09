import { db } from '@acf/db'
import { loadTaskRecord } from '@acf/jobs'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

function when(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '—'
}

export default async function TaskRecordPage({
  params,
}: {
  // Next 16 removed synchronous params entirely; this is a Promise.
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  const record = await loadTaskRecord(db(), taskId)
  if (!record) notFound()

  const { task } = record
  const estimatedCost = record.runs.reduce((sum, r) => sum + Number(r.costCents), 0)

  return (
    <>
      <p className="hash">
        <a href="/archives">← Archives</a>
      </p>
      <h1 className="screen-title">{task.title}</h1>
      <p className="screen-sub">
        {record.divisionName} &middot; {record.agentName ?? 'unassigned'} &middot; started by{' '}
        {task.source}
      </p>

      <ul className="tags">
        <li className={`tag ${task.status === 'done' ? 'is-cleared' : ''}`}>{task.status}</li>
        <li className="tag">created {when(task.createdAt)}</li>
        <li className="tag">finished {when(task.finishedAt)}</li>
        <li className="tag">{record.runs.length} run(s)</li>
      </ul>

      <div className="actions" style={{ borderTop: 'none', paddingTop: 0, marginBottom: 20 }}>
        <a className="act clear" href={`/archives/${task.id}/export`}>
          Export Markdown
        </a>
      </div>

      <h2 className="section-title">Input</h2>
      <pre className="payload">{JSON.stringify(task.input, null, 2)}</pre>

      {task.output ? (
        <>
          <h2 className="section-title">Output</h2>
          <pre className="payload">{JSON.stringify(task.output, null, 2)}</pre>
        </>
      ) : null}

      {task.error ? (
        <>
          <h2 className="section-title">Error</h2>
          <div className="notice">
            <strong>Failed</strong> {task.error}
          </div>
        </>
      ) : null}

      <h2 className="section-title">Runs</h2>
      {record.runs.length === 0 ? (
        <p className="hash">none</p>
      ) : (
        <>
          <table className="roster">
            <thead>
              <tr>
                <th>Started</th>
                <th>State</th>
                <th>Attempts</th>
                <th>Tokens in</th>
                <th>Tokens out</th>
                <th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {record.runs.map((r) => (
                <tr key={r.id}>
                  <td className="hash">{when(r.startedAt)}</td>
                  <td>
                    <span className={`tag ${r.status === 'ok' ? 'is-cleared' : 'is-flagged'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="num">{r.attempts}</td>
                  <td className="num">{r.tokensIn}</td>
                  <td className="num">{r.tokensOut}</td>
                  <td className="num">{Number(r.costCents).toFixed(4)}c</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="notice" style={{ marginTop: 12 }}>
            <strong>Estimate</strong> &mdash; {estimatedCost.toFixed(4)} cents, priced from a model
            rate table rather than a bill. Verified spend means a provider invoice or an imported
            transaction, and this is neither.
          </div>
        </>
      )}

      <h2 className="section-title">Approvals</h2>
      {record.approvals.length === 0 ? (
        <p className="hash">none</p>
      ) : (
        record.approvals.map((a) => (
          <article className="crate" key={a.id}>
            <div className="crate-head">
              <h3 className="crate-title">
                {a.kind} / {a.category}
              </h3>
              <span className={`tag ${a.decision === 'pending' ? '' : 'is-cleared'}`}>
                {a.decision}
              </span>
            </div>
            <div className="crate-body">
              <p style={{ marginTop: 0 }}>{a.summary}</p>
              <p className="hash">
                {a.refTable} {a.refId} &middot; requested by {a.requestedBy} &middot; decided by{' '}
                {a.decidedBy ?? '—'} {when(a.decidedAt)}
                {a.autoDecided ? ' (automatically)' : ''}
              </p>
              <pre className="payload">{JSON.stringify(a.payload, null, 2)}</pre>
              {a.editPayload ? (
                <>
                  <p className="hash">Operator&apos;s edit:</p>
                  <pre className="payload">{JSON.stringify(a.editPayload, null, 2)}</pre>
                </>
              ) : null}
            </div>
          </article>
        ))
      )}

      <h2 className="section-title">What the agent kept</h2>
      {record.memories.length === 0 ? (
        <p className="hash">nothing</p>
      ) : (
        <ul>
          {record.memories.map((m) => (
            <li key={m.id} style={{ fontSize: 12, marginBottom: 6 }}>
              <span className="tag">{m.kind}</span> {m.content}{' '}
              <span className="hash">(importance {m.importance})</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title">Event log</h2>
      {record.events.length === 0 ? (
        <p className="hash">none recorded against this task</p>
      ) : (
        <table className="roster">
          <tbody>
            {record.events.map((e) => (
              <tr key={e.id}>
                <td className="hash" style={{ whiteSpace: 'nowrap' }}>
                  {when(e.ts)}
                </td>
                <td>
                  <span className={`tag ${e.level === 'error' ? 'is-flagged' : ''}`}>{e.kind}</span>
                </td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
