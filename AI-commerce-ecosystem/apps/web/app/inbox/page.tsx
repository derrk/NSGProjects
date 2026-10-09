import { approvalRules, approvals, db, divisions } from '@acf/db'
import { asc, eq } from 'drizzle-orm'

import { burnCrate, chooseVariant, decideGeneric } from './actions'

export const dynamic = 'force-dynamic'

/** What the Designer puts in a `design` approval payload. */
interface DesignVariant {
  designId: string
  variantNo: number
  thumbnailUrl?: string | null
  imageUrl?: string | null
  seed?: string | null
}

interface DesignPayload {
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
    .select({
      approval: approvals,
      divisionName: divisions.name,
    })
    .from(approvals)
    .innerJoin(divisions, eq(approvals.divisionId, divisions.id))
    .where(eq(approvals.decision, 'pending'))
    .orderBy(asc(approvals.createdAt))

  const rules = await database.select().from(approvalRules)
  const ruleFor = (divisionId: string, kind: string, category: string) =>
    rules.find((r) => r.divisionId === divisionId && r.kind === kind && r.category === category) ??
    rules.find((r) => r.divisionId === divisionId && r.kind === kind && r.category === '*')

  // Grouped by division, then kind, exactly as the spec describes the queue.
  const byDivision = new Map<string, typeof pending>()
  for (const row of pending) {
    const list = byDivision.get(row.divisionName)
    if (list) list.push(row)
    else byDivision.set(row.divisionName, [row])
  }

  return (
    <>
      <h1 className="screen-title">Quarantine</h1>
      <p className="screen-sub">
        Nothing leaves the compound until you clear it. {pending.length} crate
        {pending.length === 1 ? '' : 's'} holding across {byDivision.size} division
        {byDivision.size === 1 ? '' : 's'}.
      </p>

      <div className="notice">
        <strong>No lock on this door yet</strong> — operator sign-in lands in week 3. Run this
        locally only; do not deploy it to a public URL until then.
      </div>

      {pending.length === 0 ? (
        <div className="all-quiet">
          <strong>All quiet</strong>
          Nothing is waiting on you. Work queues here when an agent proposes something.
        </div>
      ) : (
        [...byDivision.entries()].map(([divisionName, rows]) => (
          <section key={divisionName}>
            <h2 className="section-title">{divisionName}</h2>

            {rows.map(({ approval: row }) => {
              const rule = ruleFor(row.divisionId, row.kind, row.category)
              const decided =
                (rule?.approvedCount ?? 0) + (rule?.rejectedCount ?? 0) + (rule?.editedCount ?? 0)
              const threshold = rule?.thresholdCount ?? 20
              const rate =
                decided === 0 ? 0 : Math.round(((rule?.approvedCount ?? 0) / decided) * 100)

              const payload = asDesignPayload(row.payload)
              const variants = payload.variants ?? []
              const isDesignPicker = row.kind === 'design' && variants.length > 0

              return (
                <article className="crate" key={row.id}>
                  <div className="crate-head">
                    <h3 className="crate-title">{payload.conceptTitle ?? row.summary}</h3>
                    <span className="hash">CRATE {shortHash(row.id)}</span>
                  </div>

                  <div className="crate-body">
                    <ul className="tags">
                      <li className="tag">{row.kind}</li>
                      <li className="tag">{row.category}</li>
                      {rule?.neverAuto ? <li className="tag is-flagged">never auto</li> : null}
                      <li className={`tag ${rule?.autoEnabled ? 'is-cleared' : ''}`}>
                        {rule?.autoEnabled
                          ? 'crew cleared'
                          : `clearance ${decided} / ${threshold} · ${rate}%`}
                      </li>
                    </ul>

                    {payload.promptBrief ? (
                      <p style={{ marginTop: 0, color: 'var(--muted)' }}>{payload.promptBrief}</p>
                    ) : null}

                    {isDesignPicker ? (
                      <>
                        <div className="variants">
                          {variants.map((variant) => {
                            const src = variant.thumbnailUrl ?? variant.imageUrl
                            return (
                              <figure className="variant" key={variant.designId} style={{ margin: 0 }}>
                                {src ? (
                                  // A plain <img>: these are Supabase Storage URLs on an
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
                      </>
                    ) : (
                      <>
                        {/*
                          The generic card. Any approval kind without a dedicated card
                          still renders and is still decidable, so a new module is never
                          blocked on UI work.
                        */}
                        <pre className="payload">{JSON.stringify(row.payload, null, 2)}</pre>
                        <div className="actions">
                          <form action={decideGeneric}>
                            <input type="hidden" name="approvalId" value={row.id} />
                            <input type="hidden" name="decision" value="approved" />
                            <button className="act clear" type="submit">
                              Clear
                            </button>
                          </form>
                          <form action={decideGeneric}>
                            <input type="hidden" name="approvalId" value={row.id} />
                            <input type="hidden" name="decision" value="rejected" />
                            <button className="act burn" type="submit">
                              Burn
                            </button>
                          </form>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </section>
        ))
      )}
    </>
  )
}
