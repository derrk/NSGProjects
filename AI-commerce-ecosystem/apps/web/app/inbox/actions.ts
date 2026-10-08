'use server'

import { decideApproval } from '@acf/core/approvals'
import { revalidatePath } from 'next/cache'

import { gateDeps } from '@/lib/gate'

/**
 * Record the operator's decision on one design crate.
 *
 * Picking a variant is recorded as an `edited` decision carrying the chosen design id,
 * not as a plain approval: the agent proposed three options and the operator chose, so
 * the pipeline should resume with the operator's payload. It also keeps the graduated-
 * autonomy counters honest — an edit is not a clean approval, and designs that still
 * need a human to choose between them have not earned autonomy.
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

/** Reject all three variants. The concept goes back for a fresh set. */
export async function burnCrate(formData: FormData): Promise<void> {
  const approvalId = String(formData.get('approvalId') ?? '')
  if (!approvalId) throw new Error('approvalId is required')

  await decideApproval({ approvalId, decision: 'rejected', decidedBy: 'operator' }, gateDeps())

  revalidatePath('/inbox')
}
