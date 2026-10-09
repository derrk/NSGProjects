'use server'

import { decideApproval } from '@acf/core/approvals'
import { revalidatePath } from 'next/cache'

import { gateDeps } from '@/lib/gate'

/**
 * Record the operator's choice of one design variant.
 *
 * Picking is recorded as an `edited` decision carrying the chosen design id, not a
 * plain approval. The agent proposed three options and the operator chose one, so the
 * pipeline resumes with the operator's payload — and the graduated-autonomy counters
 * stay honest: a design set that still needs a human to choose between it has not
 * earned autonomy.
 */
export async function chooseVariant(formData: FormData): Promise<void> {
  const approvalId = String(formData.get('approvalId') ?? '')
  const designId = String(formData.get('designId') ?? '')
  const variantNo = Number(formData.get('variantNo') ?? 0)

  if (!approvalId || !designId) throw new Error('approvalId and designId are required')

  await decideApproval(
    {
      approvalId,
      decision: 'edited',
      decidedBy: 'operator',
      editPayload: { chosenDesignId: designId, chosenVariantNo: variantNo },
    },
    gateDeps(),
  )

  revalidatePath('/inbox')
}

/** Reject all variants. The concept goes back for a fresh set. */
export async function burnCrate(formData: FormData): Promise<void> {
  const approvalId = String(formData.get('approvalId') ?? '')
  if (!approvalId) throw new Error('approvalId is required')

  await decideApproval({ approvalId, decision: 'rejected', decidedBy: 'operator' }, gateDeps())
  revalidatePath('/inbox')
}

/**
 * Approve or reject any approval kind.
 *
 * Backs the generic JSON card, so a module that has not written a bespoke card yet is
 * still fully usable from the inbox.
 */
export async function decideGeneric(formData: FormData): Promise<void> {
  const approvalId = String(formData.get('approvalId') ?? '')
  const raw = String(formData.get('decision') ?? '')
  if (!approvalId) throw new Error('approvalId is required')
  if (raw !== 'approved' && raw !== 'rejected') {
    throw new Error(`unsupported decision "${raw}"`)
  }

  await decideApproval({ approvalId, decision: raw, decidedBy: 'operator' }, gateDeps())
  revalidatePath('/inbox')
}
