import { DEFAULT_THRESHOLDS } from '@acf/core/approvals'
import { approvalRules, approvals, db } from '@acf/db'
import { and, asc, eq } from 'drizzle-orm'

import { burnCrate, chooseVariant } from './actions'

export const dynamic = 'force-dynamic'

/** What the Designer agent puts in a `design` approval payload. */
interface DesignVariant {
  designId: string
  variantNo: number
  thumbnailUrl?: string | null
  imageUrl?: string | null
  seed?: string | null
  sourceModel?: string | null
}

interface DesignPayload {
  conceptId?: string
  conceptTitle?: string
  promptBrief?: string
  style?: string
  variants?: DesignVariant[]
}

function asDesignPayload(payload: unknown): DesignPayload {
  return typeof payload === 'object' && payload !== null ? (payload as DesignPayload) : {}
}

/** Short hash-style id. The ledger is the one thing that survived. */
function shortHash(id: string): string {
  return id.replace(/-/g, '').slice(0, 12).toUpperCase()
}

export default async function QuarantinePage() {
  const database = db()

  const pending = await database
    .select()
    .from(approvals)
    .where(and(eq(approvals.decision, 'pending'), eq(approvals.kind, 'design')))
    .orderBy(asc(approvals.createdAt))

  const rules = await database.select().from(approvalRules).where(eq(approvalRules.kind, 'design'))
  const ruleByCategory = new Map(rules.map((r) => [r.category, r]))

  return (
    <>
      <h1 className="screen-title">Quarantine</h1>
      <p className="screen-sub">
        Nothing leaves the compound until you clear it. {pending.length} crate
        {pending.length === 1 ? '' : 's'} holding.
      </p>

      <div className="notice">
        <strong>No lock on this door yet</strong> — operator sign-in lands in week 3. Run this
        locally only; do not deploy it to a public URL until then.
      </div>

      {pending.length === 0 ? (
        <div className="all-quiet">
          <strong>All quiet</strong>
          No design crates are waiting. The Design Shed queues work here when a concept clears.
        </div>
      ) : (
        pending.map((row) => {
          const payload = asDesignPayload(row.payload)
          const variants = payload.variants ?? []
          const rule = ruleByCategory.get(row.category)
          const decided =
            (rule?.approvedCount ?? 0) + (rule?.rejectedCount ?? 0) + (rule?.editedCount ?? 0)
          const threshold = rule?.threshold ?? DEFAULT_THRESHOLDS.design
          const rate = decided === 0 ? 0 : Math.round(((rule?.approvedCount ?? 0) / decided) * 100)

          return (
            <article className="crate" key={row.id}>
              <div className="crate-head">
                <h2 className="crate-title">{payload.conceptTitle ?? row.summary}</h2>
                <span className="hash">CRATE {shortHash(row.id)}</span>
              </div>

              <div className="crate-body">
                <ul className="tags">
                  <li className="tag">{row.category}</li>
                  {payload.style ? <li className="tag">{payload.style}</li> : null}
                  <li className={`tag ${rule?.autoEnabled ? 'is-cleared' : ''}`}>
                    {rule?.autoEnabled
                      ? 'crew cleared'
                      : `clearance ${decided} / ${threshold} · ${rate}%`}
                  </li>
                </ul>

                {payload.promptBrief ? (
                  <p style={{ marginTop: 0, color: 'var(--muted)' }}>{payload.promptBrief}</p>
                ) : null}

                <div className="variants">
                  {variants.map((variant) => {
                    const src = variant.thumbnailUrl ?? variant.imageUrl
                    return (
                      <figure
                        className="variant"
                        key={variant.designId}
                        style={{ margin: 0 }}
                      >
                        {src ? (
                          // Plain <img>: these are Supabase Storage URLs on an
                          // arbitrary host, and next/image would need each one
                          // allowlisted in next.config for no benefit here.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={`Variant ${variant.variantNo}`} />
                        ) : (
                          <div className="variant-missing">image missing</div>
                        )}
                        <figcaption>
                          <span>Var {variant.variantNo}</span>
                          <span>{variant.seed ? `seed ${variant.seed}` : '—'}</span>
                        </figcaption>
                      </figure>
                    )
                  })}
                </div>

                <div className="actions">
                  {variants.map((variant) => (
                    <form action={chooseVariant} key={`pick-${variant.designId}`}>
                      <input type="hidden" name="approvalId" value={row.id} />
                      <input type="hidden" name="designId" value={variant.designId} />
                      <input type="hidden" name="variantNo" value={variant.variantNo} />
                      <button className="act clear" type="submit">
                        Clear var {variant.variantNo}
                      </button>
                    </form>
                  ))}
                  <form action={burnCrate}>
                    <input type="hidden" name="approvalId" value={row.id} />
                    <button className="act burn" type="submit">
                      Burn all
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
