import * as z from 'zod'

import type { Provenance } from '../../economics'

/**
 * Counting house schemas.
 *
 * The covering note goes through Anthropic structured outputs, which keeps only a
 * small JSON-Schema keyword allowlist — array sizes and length limits never arrive at
 * the model as constraints, only as prose it may ignore. So "at most three findings"
 * is stated in the `.describe()` AND re-checked after parsing, in `validateNote`.
 *
 * The output schema does one thing the report cannot do for itself: it refuses to
 * carry a note whose marking does not match the provenance of the figures underneath
 * it. A caller cannot reach the findings without going through the object that holds
 * the marking, so there is no shape of this output in which the prose travels alone.
 */

export const provenanceSchema = z.enum(['verified', 'manual', 'estimated', 'simulated'])

/** More than three findings is a list, and a list is something nobody acts on. */
export const MAX_FINDINGS = 3

export const findingSchema = z.object({
  whatISee: z
    .string()
    .describe(
      'The figure or pattern, named exactly, taken only from the report you were ' +
        'given. Never state a figure that is not in it. If the costs behind a number ' +
        'are estimated or simulated, say so in the same sentence as the number.',
    ),
  whatItProbablyMeans: z
    .string()
    .describe(
      'The most likely explanation, written as a hypothesis rather than a conclusion. ' +
        'If two explanations fit, give the one you would bet on and name the other.',
    ),
  whatIWouldCheckNext: z
    .string()
    .describe(
      'One specific check a person could run this week — a statement to pull, a rate ' +
        'to confirm, a supplier invoice to compare against the catalogue figure. Not ' +
        '"monitor it".',
    ),
})

export type Finding = z.infer<typeof findingSchema>

export const modelNoteSchema = z.object({
  findings: z
    .array(findingSchema)
    .describe(
      `At most ${MAX_FINDINGS} findings, and at least one. Order them by how much each ` +
        'changes a decision this week. Fewer is better: two findings that matter beat ' +
        'three where one is filler. If the period is empty, the finding is that it is ' +
        'empty.',
    ),
  leastSureAbout: z
    .string()
    .describe(
      'Which ONE of the findings above you are least sure about, named, and what would ' +
        'settle it.',
    ),
})

export type ModelNote = z.infer<typeof modelNoteSchema>

/**
 * What the figures are worth, in a sentence that travels with the prose.
 *
 * Written out in full rather than as a tag, because "estimated" in a corner of a
 * screen is a word people stop seeing by the second week.
 */
export const MARKING: Record<Provenance, string> = {
  verified:
    'VERIFIED — every figure below traces to an invoice or an imported transaction.',
  manual:
    'ENTERED BY HAND — figures below were typed by a person and have not been reconciled ' +
    'against a statement.',
  estimated:
    'ESTIMATED — some costs below are catalogue figures nobody has checked against a ' +
    'statement. Read the net as a direction, not a balance.',
  simulated:
    'SIMULATED — every figure below comes from demo data. Nothing here describes money ' +
    'that moved.',
}

export function markingFor(provenance: Provenance): string {
  return MARKING[provenance]
}

export const coveringNoteSchema = modelNoteSchema.extend({
  /**
   * First line, always. The findings live inside this object precisely so that no
   * caller can destructure them out and leave the marking behind.
   */
  marking: z.string().min(1),
})

export type CoveringNote = z.infer<typeof coveringNoteSchema>

/**
 * The only sanctioned way to turn the note into prose.
 *
 * Leads with the marking because an operator who reads the findings first has already
 * formed a view by the time the caveat arrives.
 */
export function renderCoveringNote(note: CoveringNote): string {
  const findings = note.findings.map(
    (f, i) =>
      `${i + 1}. ${f.whatISee}\n   What it probably means: ${f.whatItProbablyMeans}\n   What I would check next: ${f.whatIWouldCheckNext}`,
  )
  return [note.marking, '', ...findings, '', `Least sure about: ${note.leastSureAbout}`].join('\n')
}

export const financeInputSchema = z.object({
  /** ISO. Both ends or neither; one alone is a mistake, not a default. */
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
})

export type FinanceInput = z.infer<typeof financeInputSchema>

const skuRowSchema = z.object({
  sku: z.string(),
  orders: z.number(),
  revenueCents: z.number(),
  contributionCents: z.number(),
  contributionPercent: z.number(),
  /** What the COST side of this row is worth. The fee side is assumed in every case. */
  provenance: provenanceSchema,
})

const proposalSchema = z.object({
  sku: z.string(),
  contributionCents: z.number(),
  observedUnitPriceCents: z.number(),
  /**
   * The price at which this SKU contributes exactly zero, solved in code from the same
   * assumptions. Null when no price breaks even under them, which is itself the answer.
   */
  breakEvenPriceCents: z.number().nullable(),
  provenance: provenanceSchema,
  rationale: z.string(),
})

export type Proposal = z.infer<typeof proposalSchema>

export const financeOutputSchema = z
  .object({
    periodStart: z.string(),
    periodEnd: z.string(),
    revenueCents: z.number(),
    costsCents: z.number(),
    netCents: z.number(),
    /** The weakest provenance anywhere in the period. The whole report is worth this. */
    provenance: provenanceSchema,
    /** Redundant with `provenance`, and deliberately so: a boolean is hard to ignore. */
    simulated: z.boolean(),
    note: coveringNoteSchema.nullable(),
    noteStatus: z.enum(['written', 'rejected']),
    /** Why the note was refused, when it was. Empty on the happy path. */
    noteProblems: z.array(z.string()),
    skus: z.array(skuRowSchema),
    lossMakers: z.array(skuRowSchema),
    proposals: z.array(proposalSchema),
    caveats: z.array(z.string()),
    /** Order lines with neither a supplier charge nor a catalogue cost behind them. */
    unpricedLineCount: z.number(),
    approvalId: z.string().nullable(),
    status: z.enum([
      'approval_requested',
      'already_requested',
      'no_action_proposed',
      /**
       * Should be unreachable: price_change is never-auto both in the platform list and
       * on this module's kind. It exists so that a system which somehow reaches it says
       * so, instead of reporting a lie that reads like the happy path.
       */
      'auto_approved',
    ]),
  })
  .superRefine((out, ctx) => {
    if (out.note && out.note.marking !== markingFor(out.provenance)) {
      ctx.addIssue({
        code: 'custom',
        path: ['note', 'marking'],
        message: `the note is marked "${out.note.marking}" but the figures are ${out.provenance}`,
      })
    }
    if (out.simulated !== (out.provenance === 'simulated')) {
      ctx.addIssue({
        code: 'custom',
        path: ['simulated'],
        message: `simulated=${out.simulated} contradicts provenance=${out.provenance}`,
      })
    }
    if ((out.noteStatus === 'written') !== (out.note !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['noteStatus'],
        message: `noteStatus=${out.noteStatus} does not match whether a note is present`,
      })
    }
  })

export type FinanceOutput = z.infer<typeof financeOutputSchema>
