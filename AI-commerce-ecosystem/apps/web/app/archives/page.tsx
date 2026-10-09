import { db, divisions } from '@acf/db'
import { searchArchive } from '@acf/jobs'

export const dynamic = 'force-dynamic'

const STATUSES = ['queued', 'running', 'blocked', 'done', 'failed'] as const

function when(d: Date | null): string {
  if (!d) return '—'
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16)
}

export default async function ArchivesPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<{ q?: string; division?: string; status?: string }>
}) {
  const params = await searchParams
  const database = db()

  const divisionRows = await database.select().from(divisions).orderBy(divisions.name)

  const results = await searchArchive(database, {
    ...(params.q ? { query: params.q } : {}),
    ...(params.division ? { divisionId: params.division } : {}),
    ...(params.status ? { status: params.status } : {}),
    limit: 100,
  })

  return (
    <>
      <h1 className="screen-title">Archives</h1>
      <p className="screen-sub">
        Everything that happened, and why. Search the record, then take a copy.
      </p>

      <form method="get" className="filter-bar">
        <input
          name="q"
          placeholder="Search titles, inputs and approvals…"
          defaultValue={params.q ?? ''}
          autoComplete="off"
        />
        <select name="division" defaultValue={params.division ?? ''}>
          <option value="">every division</option>
          {divisionRows.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={params.status ?? ''}>
          <option value="">any state</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="act clear" type="submit">
          Search
        </button>
      </form>

      <p className="hash" style={{ margin: '14px 0' }}>
        {results.length} record{results.length === 1 ? '' : 's'}
        {results.length === 100 ? ' (showing the first 100)' : ''}
      </p>

      {results.length === 0 ? (
        <div className="all-quiet">
          <strong>Nothing found</strong>
          No task matches that. Try a broader search.
        </div>
      ) : (
        <table className="roster">
          <thead>
            <tr>
              <th>Task</th>
              <th>Division</th>
              <th>Crew</th>
              <th>State</th>
              <th>Started</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.taskId}>
                <td>
                  <a href={`/archives/${r.taskId}`}>{r.title}</a>
                  <div className="hash">{r.source}</div>
                </td>
                <td>{r.divisionName}</td>
                <td>{r.agentName ?? '—'}</td>
                <td>
                  <span className={`tag ${r.status === 'done' ? 'is-cleared' : ''}`}>
                    {r.status}
                  </span>
                </td>
                <td className="hash">{when(r.createdAt)}</td>
                <td>
                  <a className="act" href={`/archives/${r.taskId}/export`}>
                    .md
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
