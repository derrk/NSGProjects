/**
 * Turning an agent's schedule into "how often should this have run?".
 *
 * The heartbeat needs an expected interval to decide whether an agent is overdue, and
 * `agents.schedule` is a free-text cron string. This is a deliberately small reader:
 * it handles the shapes the scheduler actually produces and returns null for anything
 * it does not understand, because guessing an interval wrong turns a healthy station
 * amber (or, worse, hides a dead one).
 */

export const MINUTE = 1
export const HOUR = 60
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY

/** A schedule that fires on an event rather than a clock, e.g. `event:design.approved`. */
export function isEventDriven(schedule: string | null | undefined): boolean {
  return typeof schedule === 'string' && schedule.trim().toLowerCase().startsWith('event:')
}

/** Strip an Inngest-style `TZ=America/Chicago ` prefix. */
function stripTimezone(expr: string): string {
  return expr.replace(/^TZ=\S+\s+/i, '').trim()
}

function stepOf(field: string): number | null {
  const match = /^(\*|\d+(?:-\d+)?)\/(\d+)$/.exec(field)
  return match ? Number(match[2]) : null
}

/**
 * Approximate minutes between runs, or null when it cannot be determined.
 *
 * Null is a real answer: an event-driven agent is never "overdue", and an expression
 * this cannot read should not produce a confident wrong number.
 */
export function intervalMinutes(schedule: string | null | undefined): number | null {
  if (!schedule) return null
  if (isEventDriven(schedule)) return null

  const expr = stripTimezone(schedule)
  const fields = expr.split(/\s+/)
  if (fields.length < 5) return null

  const [minute, hour, dom, , dow] = fields as [string, string, string, string, string]

  // */N in the minute field: every N minutes.
  const minuteStep = stepOf(minute)
  if (minuteStep !== null) return minuteStep
  if (minute === '*') return MINUTE

  // A fixed minute. How often depends on the hour field.
  const hourStep = stepOf(hour)
  if (hourStep !== null) return hourStep * HOUR
  if (hour === '*') return HOUR

  // A fixed hour too, so at most daily. A list of hours fires that many times a day.
  const hourCount = hour.includes(',') ? hour.split(',').length : 1
  const perDay = Math.max(1, hourCount)

  const restrictedByDow = dow !== '*' && dow !== '?'
  const restrictedByDom = dom !== '*' && dom !== '?'

  if (restrictedByDow) {
    const days = dow.includes(',') ? dow.split(',').length : 1
    // Weekly on `days` days of the week.
    return Math.round(WEEK / Math.max(1, days) / perDay)
  }
  if (restrictedByDom) {
    // Monthly, near enough for a staleness check.
    return Math.round((30 * DAY) / perDay)
  }

  return Math.round(DAY / perDay)
}
