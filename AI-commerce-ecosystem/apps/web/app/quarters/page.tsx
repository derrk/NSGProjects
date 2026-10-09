import { approvalRules, approvals, db, divisions } from '@acf/db'
import { desc, inArray } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * Quarters: what the operator has trained, and what it has earned.
 *
 * Graduated autonomy is the mechanism this whole system turns on — a category
 * earns auto-approval after enough clean decisions, loses it on one rejection, and
 * can be barred from ever earning it. All of that has been running since week one
 * with no window into it. The inbox shows one bucket's progress while deciding one
 * card; nothing showed the shape of the whole thing.
 *
 * This is also the only honest answer to "how much is this system doing on its own
 * now?", which is a question an operator should be able to answer at a glance and
 * could not.
 */

const RATE_FOR_DISPLAY = (approved: number, decided: number) =>
  decided === 0 ? null : Math.round((approved / decided) * 100)

function when(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16)
}

export default async function QuartersPage() {
  const database = db()

  const divisionRows = await database.select().from(divisions).orderBy(divisions.name)
  const divisionName = new Map(divisionRows.map((d) => [d.id, d.name]))
  const divisionIds = divisionRows.map((d) => d.id)

  const rules =
    divisionIds.length > 0
      ? await database
          .select()
          .from(approvalRules)
          .where(inArray(approvalRules.divisionId, divisionIds))
      : []

  const recent =
    divisionIds.length > 0
      ? await database
          .select()
          .from(approvals)
          .where(inArray(approvals.divisionId, divisionIds))
          .orderBy(desc(approvals.updatedAt))
          .limit(40)
      : []

  const views = rules
    .map((rule) => {
      const decided = rule.approvedCount + rule.rejectedCount + rule.editedCount
      const rate = RATE_FOR_DISPLAY(rule.approvedCount, decided)
      const needed = Math.max(0, rule.thresholdCount - decided)

      let state: 'never' | 'earned' | 'earning' | 'untested'
      if (rule.neverAuto) state = 'never'
      else if (rule.autoEnabled) state = 'earned'
      else if (decided === 0) state = 'untested'
      else state = 'earning'

      return { rule, decided, rate, needed, state }
    })
    .sort((a, b) => b.decided - a.decided)

  const earned = views.filter((v) => v.state === 'earned').length
  const never = views.filter((v) => v.state === 'never').length
  const decidedTotal = views.reduce((n, v) => n + v.decided, 0)
  const autoDecided = recent.filter((a) => a.autoDecided).length

  return (
    <>
      <h1 className="screen-title">Quarters</h1>
      <p className="screen-sub">
        What you have trained, and what it has earned. {decidedTotal} decision
        {decidedTotal === 1 ? '' : 's'} on the books.
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Categories</span>
          <span className="stat-value">{views.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Earned autonomy</span>
          <span className={`stat-value ${earned > 0 ? 'is-waiting' : ''}`}>{earned}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Barred from it</span>
          <span className="stat-value">{never}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Your decisions</span>
          <span className="stat-value">{decidedTotal}</span>
        </div>
      </div>

      {earned === 0 ? (
        <div className="notice">
          <strong>Nothing runs without you yet.</strong> Every category is still at
          <em> propose</em>: an agent files, you decide. A category earns auto-approval only
          after enough clean decisions, and loses it again on a single rejection.
        </div>
      ) : (
        <div className="notice">
          <strong>
            {earned} categor{earned === 1 ? 'y' : 'ies'} now decide without you.
          </strong>{' '}
          They were earned from your own decisions and are revoked by one rejection. The
          never-auto list still outranks them: refunds, purchases, contracts, large price
          changes and anything high IP risk reach you regardless.
        </div>
      )}

      <h2 className="section-title">Every category</h2>
      {views.length === 0 ? (
        <div className="all-quiet">
          <strong>No categories yet.</strong> They appear as agents propose things.
        </div>
      ) : (
        <table className="roster">
          <thead>
            <tr>
              <th>Category</th>
              <th>Your decisions</th>
              <th>Rate</th>
              <th>Standing</th>
            </tr>
          </thead>
          <tbody>
            {views.map(({ rule, decided, rate, needed, state }) => (
              <tr key={rule.id}>
                <td style={{ fontSize: 12 }}>
                  <strong>
                    {rule.kind}
                    {rule.category === '*' ? '' : ` / ${rule.category}`}
                  </strong>
                  <div className="hash">
                    {divisionName.get(rule.divisionId) ?? rule.divisionId}
                  </div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {decided === 0 ? (
                    <span className="hash">none yet</span>
                  ) : (
                    <>
                      {rule.approvedCount} approved, {rule.editedCount} edited,{' '}
                      {rule.rejectedCount} rejected
                      {/*
                        Edits are shown beside rejections on purpose. An edit means the
                        output was close but not shippable, and it counts against the
                        rate — so an operator reading only "approved" would not
                        understand why a bucket is not graduating.
                      */}
                    </>
                  )}
                </td>
                <td style={{ fontSize: 12, width: 150 }}>
                  {rate === null ? (
                    <span className="hash">—</span>
                  ) : (
                    <>
                      {rate}%{' '}
                      <span className="hash">
                        needs {Math.round(rule.thresholdRate * 100)}%
                      </span>
                      {state === 'earning' && needed > 0 ? (
                        <div className="hash">{needed} more decision(s) to qualify</div>
                      ) : null}
                    </>
                  )}
                </td>
                <td style={{ width: 130 }}>
                  <span
                    className={`tag ${
                      state === 'never' ? 'is-flagged' : state === 'earned' ? 'is-cleared' : ''
                    }`}
                  >
                    {state === 'never'
                      ? 'never auto'
                      : state === 'earned'
                        ? 'runs itself'
                        : state === 'earning'
                          ? 'earning'
                          : 'untested'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="section-title">Recent decisions</h2>
      <p className="screen-sub">
        {autoDecided === 0
          ? 'Every one of these was yours.'
          : `${autoDecided} of the last ${recent.length} were decided automatically.`}
      </p>
      {recent.length === 0 ? (
        <div className="all-quiet">
          <strong>Nothing decided yet.</strong>
        </div>
      ) : (
        <table className="roster">
          <tbody>
            {recent.map((approval) => (
              <tr key={approval.id}>
                <td className="hash" style={{ width: 130 }}>
                  {when(approval.updatedAt)}
                </td>
                <td style={{ width: 110 }}>
                  <span
                    className={`tag ${
                      approval.decision === 'rejected'
                        ? 'is-flagged'
                        : approval.decision === 'approved'
                          ? 'is-cleared'
                          : ''
                    }`}
                  >
                    {approval.decision}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>
                  {approval.summary}
                  <div className="hash">
                    {approval.kind}
                    {approval.category === '*' ? '' : ` / ${approval.category}`}
                    {' · '}
                    {/*
                      Who decided, always shown. The audit trail says "operator" and
                      cannot say which person — one passphrase, one operator — and that
                      limit is stated on the sign-in screen rather than implied here.
                    */}
                    {approval.autoDecided ? 'decided automatically' : (approval.decidedBy ?? 'waiting')}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
