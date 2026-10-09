import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolvePeriod, unhedgedClaims, validateNote } from './run'
import type { FinanceReport } from './report'

const est = { provenance: 'estimated' } as unknown as FinanceReport
const out: string[] = []
const p = (label: string, v: unknown) => out.push(`${label}: ${JSON.stringify(v)}`)

describe('probe', () => {
  it('all', () => {
    const note = {
      findings: [
        {
          whatISee: 'Contribution was $412 across the week',
          whatItProbablyMeans: 'These are estimated costs.',
          whatIWouldCheckNext: 'Pull the invoice.',
        },
      ],
      leastSureAbout: 'The first one, it is an estimate.',
    }
    p('MERGE problems', validateNote(note, est))

    const noteNoMerge = {
      findings: [
        {
          whatISee: 'Contribution was $412 across the week.',
          whatItProbablyMeans: 'These are estimated costs.',
          whatIWouldCheckNext: 'Pull the invoice.',
        },
      ],
      leastSureAbout: 'The first one, it is an estimate.',
    }
    p('NO-MERGE problems', validateNote(noteNoMerge, est))

    p('two-digit', unhedgedClaims('Net was -42 and revenue 90.'))
    p('three-digit', unhedgedClaims('Net was -412.'))
    p('sku with digits', unhedgedClaims('POSTER-A2-1200 is the worst performer.'))
    p('catalogue word', unhedgedClaims('Contribution was $412 and the catalogue is fine.'))
    p('demo word', unhedgedClaims('Contribution was $412 in the demo of the quarter.'))
    p('likely', unhedgedClaims('We lost $412 and will likely raise the price.'))
    p('appears', unhedgedClaims('The mug lost $412; a refund appears on the statement.'))
    p('date strip', unhedgedClaims('Between 2026-10-01T00:00:00.000Z and 2026-10-07T23:59:59.999Z nothing happened.'))
    p('no trailing period', unhedgedClaims('Revenue was $5,000'))
    p('newline split', unhedgedClaims('Revenue was $5,000.\nIt is estimated.'))

    const now = new Date('2026-10-08T07:00:00.000Z')
    p('date-only', resolvePeriod({ periodStart: '2026-10-01', periodEnd: '2026-10-07' }, now))
    p('no-tz time', resolvePeriod({ periodStart: '2026-10-01T00:00', periodEnd: '2026-10-07T23:59' }, now))
    p('TZ env', [process.env.TZ ?? null, new Date('2026-10-07T23:59').toISOString(), new Date().getTimezoneOffset()])
    p('default', resolvePeriod({}, now))

    writeFileSync('zzprobe-out.txt', out.join('\n'))
    expect(true).toBe(true)
  })
})
