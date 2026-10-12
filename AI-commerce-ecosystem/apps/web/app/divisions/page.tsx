import { agents, approvals, db, divisions, modules as modulesTable } from '@acf/db'
import { eq, sql } from 'drizzle-orm'

import { MODULES } from '@/lib/modules'

import { setDivisionStatus } from './actions'
import { ConfigForm } from './config-form'
import { NewDivisionForm, type ModuleOption } from './new-division-form'

export const dynamic = 'force-dynamic'

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
}

export default async function DivisionsPage() {
  const database = db()

  const rows = await database.select().from(divisions).orderBy(divisions.createdAt)
  const registered = await database.select().from(modulesTable)

  const agentCounts = await database
    .select({ divisionId: agents.divisionId, n: sql<number>`COUNT(*)::int` })
    .from(agents)
    .groupBy(agents.divisionId)

  const pendingCounts = await database
    .select({ divisionId: approvals.divisionId, n: sql<number>`COUNT(*)::int` })
    .from(approvals)
    .where(eq(approvals.decision, 'pending'))
    .groupBy(approvals.divisionId)

  const agentsBy = new Map(agentCounts.map((r) => [r.divisionId, r.n]))
  const pendingBy = new Map(pendingCounts.map((r) => [r.divisionId, r.n]))
  const moduleById = new Map(registered.map((m) => [m.id, m.name]))

  // Offered from the composition root, not the database: a module can only be built
  // from if the running app actually has its code.
  const options: ModuleOption[] = MODULES.map((m) => ({
    name: m.name,
    description: m.description,
    agentCount: m.agents.length,
    stationCount: m.stations.length,
  }))

  return (
    <>
      <h1 className="screen-title">Outfits</h1>
      <p className="screen-sub">
        Every business under the roof. {rows.length} standing, {options.length} blueprint
        {options.length === 1 ? '' : 's'} to build from.
      </p>

      {rows.length === 0 ? (
        <div className="all-quiet">
          <strong>Nothing standing</strong>
          Raise your first division below.
        </div>
      ) : (
        <table className="roster">
          <thead>
            <tr>
              <th>Division</th>
              <th>Blueprint</th>
              <th>State</th>
              <th>Crew</th>
              <th>Quarantine</th>
              <th>Cap</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.name}</strong>
                  <div className="hash">{d.slug}</div>
                </td>
                <td>{d.moduleId ? (moduleById.get(d.moduleId) ?? '\u2014') : '\u2014'}</td>
                <td>
                  <span className={`tag ${d.status === 'active' ? 'is-cleared' : ''}`}>
                    {d.status}
                  </span>
                </td>
                <td className="num">{agentsBy.get(d.id) ?? 0}</td>
                <td className="num">{pendingBy.get(d.id) ?? 0}</td>
                <td className="num">{usd(d.dailySpendCapCents)}</td>
                <td>
                  <form action={setDivisionStatus}>
                    <input type="hidden" name="divisionId" value={d.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={d.status === 'active' ? 'paused' : 'active'}
                    />
                    <button className="act" type="submit">
                      {d.status === 'active' ? 'Shutter' : 'Reopen'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Settings</h2>
      <p className="screen-sub">
        What each division needs before its agents can finish a job. An empty setting that
        stops an agent says so here rather than in a failed run.
      </p>
      {rows.map((d) => {
        const mod = MODULES.find((m) => m.name === d.type)
        const fields = mod?.configFields ?? []
        if (fields.length === 0) return null
        const config = (d.config ?? {}) as Record<string, unknown>
        const values: Record<string, string> = {}
        for (const field of fields) {
          const value = config[field.key]
          // Arrays come back as a comma list, which is how they went in. Anything
          // else is shown as the JSON it is rather than as [object Object].
          values[field.key] = Array.isArray(value)
            ? value.join(', ')
            : value === undefined || value === null
              ? ''
              : typeof value === 'string'
                ? value
                : JSON.stringify(value)
        }
        return (
          <div className="crate" key={d.id}>
            <div className="crate-head">
              <strong>{d.name}</strong>
              <span className="hash">{mod?.name ?? d.type}</span>
            </div>
            <div className="crate-body">
              <ConfigForm
                divisionId={d.id}
                divisionName={d.name}
                fields={fields}
                values={values}
              />
            </div>
          </div>
        )
      })}

      <h2 className="section-title">Raise a new division</h2>
      <div className="crate" style={{ borderLeftColor: 'var(--toxic)' }}>
        <div className="crate-body">
          <NewDivisionForm modules={options} />
        </div>
      </div>
    </>
  )
}
