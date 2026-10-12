import type { ModuleAgentSpec } from '@acf/core/modules'

export * from './run'

export const publisherAgentSpec: ModuleAgentSpec = {
  key: 'publisher',
  defaultName: 'Loading bay',
  purpose:
    'Push an approved listing live, and release any product a previous crash left locked.',
  description:
    'Calls Printify publish and reports the result back, because a publish that is never reported back leaves the product permanently uneditable. Makes no model call: by this point every decision has been made.',
  /*
   * No model, and the field is required, so this names the cheapest one rather than
   * pretending. Nothing in this agent sends a prompt — by the time a product is
   * approved every judgement has already been made and written down, and asking a
   * model to confirm them would add a way for the answer to be different.
   */
  defaultModel: 'claude-haiku-5-5',
  /*
   * The last orphan in the chain.
   *
   * `publishProduct` has been written, tested and called by nothing since it landed:
   * approving a `product` did precisely nothing, so the final step of the pipeline
   * was a function with a test suite and no caller.
   */
  defaultSchedule: 'event:product.approved',
  defaultTools: [],
  systemPrompt:
    'You publish an approved listing. There is no judgement left to make at this point — ' +
    'the decisions were made upstream and recorded. Your only job is that the publish ' +
    'either completes or is reported as failed, because a Printify publish locks the ' +
    'product until the caller reports back.',
}
