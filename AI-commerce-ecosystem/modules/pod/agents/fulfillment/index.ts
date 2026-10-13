import type { ModuleAgentSpec } from '@acf/core/modules'

export * from './run'

export const fulfillmentAgentSpec: ModuleAgentSpec = {
  key: 'fulfillment',
  defaultName: 'Fulfilment desk',
  purpose:
    'Take a recorded order and queue the lines that are allowed to be made, holding the rest with the reason.',
  description:
    'Runs the routing rules against one order. Makes no model call: the five rules that decide whether a line may be made are tested code, and the only thing it escalates is a personalised line nobody has read yet.',
  /*
   * No model. The field is required, so it names the cheapest one rather than
   * pretending otherwise — nothing here sends a prompt. `mayRouteOrder` is five
   * explicit rules about spending money, and handing those to a model would swap a
   * rule that always holds for one that usually does.
   */
  defaultModel: 'claude-haiku-5-5',
  /*
   * Queued by the webhook that recorded the order, not by a schedule.
   *
   * There is no `event:` trigger for this because the dispatcher only fires on
   * approval decisions, and an order arriving is not one. The webhook inserts the
   * task directly and sends `task.created`, which is the same path everything else
   * in the queue takes.
   *
   * The empty schedule keeps the scheduler from considering it due on a clock: an
   * order is work that arrives, not work that comes round.
   */
  defaultSchedule: null,
  defaultTools: [],
  systemPrompt:
    'You route one order. Every decision is already made by tested rules; you apply them ' +
    'and report what happened. A line you cannot route is held with the reason, never ' +
    'routed anyway with a caveat.',
}
