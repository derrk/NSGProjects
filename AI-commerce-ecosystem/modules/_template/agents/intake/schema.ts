import * as z from 'zod'

/** Anything the operator or another agent hands this division. */
export const intakeInputSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
  /** Set when the task arrived from the core dispatcher. */
  refId: z.string().optional(),
  refTable: z.string().optional(),
})

export type IntakeInput = z.infer<typeof intakeInputSchema>

export const intakeOutputSchema = z.object({
  opportunityId: z.string(),
  approvalId: z.string().nullable(),
  status: z.enum(['approval_requested', 'already_requested']),
})

export type IntakeOutput = z.infer<typeof intakeOutputSchema>
