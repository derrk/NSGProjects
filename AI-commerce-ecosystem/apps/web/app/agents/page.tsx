import { assessAgentHealth } from '@acf/core/health'
import { agentRuns, agents, db, divisions } from '@acf/db'
import { desc, eq } from 'drizzle-orm'

import { resolveAgentDefinition } from '@/lib/modules'

import { runAgentNow, setAgentStatus } from './actions'

export const dynamic = 'force-dynamic'

export default async function CrewPage() {
  const database = db()

  const rows = await database
    .select({ agent: agents, divisionName: divisions.name, divisionType: divisions.type })
    .from(agents)
    .innerJoin(divisions, eq(agents.divisionId, divisions.id))
    .orderBy(divisions.name, agents.name)

  const runs = await database
    .select({
      agentId: agentRuns.agentId,
      status: agentRuns.status,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
    })
    .from(agentRuns)
    .orderBy(desc(agentRuns.startedAt))
    .limit(500)

  // The same assessment the heartbeat writes, so this page and the floor agree.
  const health = assessAgentHealth(
    rows.map((r) => ({
      id: r.agent.id,
      name: r.agent.name,
      divisionId: r.agent.divisionId,
      schedule: r.agent.schedule,
      status: r.agent.status,
    })),
    runs
      .filter((r): r is typeof r & { agentId: string } => r.agentId !== null)
      .map((r) => ({
        agentId: r.agentId,
        status: r.status,
        startedAt: new Date(r.startedAt),
        finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
      })),
    new Date(),
  )
  const healthBy = new Map(health.map((h) => [h.agentId, h]))

  return (
    <>
      <h1 className="screen-title">The Crew</h1>
      <p className="screen-sub">
        Every agent across every division. {rows.length} on the books.
      </p>

      {rows.length === 0 ? (
        <div className="all-quiet">
          <strong>Nobody here</strong>
          Raise a division and it brings its own crew.
        </div>
      ) : (
        rows.map(({ agent, divisionName, divisionType }) => {
          const h = healthBy.get(agent.id)
          const runnable = resolveAgentDefinition(divisionType, agent.moduleAgentKey) !== null

          return (
            <article className="crate" key={agent.id}>
              <div className="crate-head">
                <h2 className="crate-title">
                  <span className={`light light-${h?.light ?? 'amber'}`} aria-hidden="true" />
                  {agent.name}
                </h2>
                <span className="hash">{divisionName}</span>
              </div>

              <div className="crate-body">
                <ul className="tags">
                  <li className="tag">{agent.moduleAgentKey}</li>
                  <li className="tag">{agent.autonomy}</li>
                  <li className={`tag ${agent.status === 'active' ? 'is-cleared' : 'is-flagged'}`}>
                    {agent.status}
                  </li>
                  <li className="tag">{agent.schedule ?? 'manual only'}</li>
                  {!runnable ? <li className="tag is-flagged">no runner yet</li> : null}
                </ul>

                {agent.purpose ? (
                  <p style={{ marginTop: 0, color: 'var(--muted)' }}>{agent.purpose}</p>
                ) : null}

                <p className="hash" style={{ marginBottom: 12 }}>
                  {h?.reason ?? 'no reading'} &middot; model {agent.model}
                </p>

                <details>
                  <summary className="tag" style={{ cursor: 'pointer' }}>
                    Orders
                  </summary>
                  <pre className="payload" style={{ marginTop: 10 }}>
                    {agent.systemPrompt || '(no prompt set)'}
                  </pre>
                </details>

                <div className="actions">
                  <form action={runAgentNow} className="run-now">
                    <input type="hidden" name="agentId" value={agent.id} />
                    <input
                      name="input"
                      placeholder='input JSON, e.g. {"conceptId":"..."}'
                      autoComplete="off"
                    />
                    <button className="act clear" type="submit" disabled={!runnable}>
                      Run now
                    </button>
                  </form>
                  <form action={setAgentStatus}>
                    <input type="hidden" name="agentId" value={agent.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={agent.status === 'active' ? 'paused' : 'active'}
                    />
                    <button className="act" type="submit">
                      {agent.status === 'active' ? 'Stand down' : 'Call up'}
                    </button>
                  </form>
                </div>
              </div>
            </article>
          )
        })
      )}
    </>
  )
}
