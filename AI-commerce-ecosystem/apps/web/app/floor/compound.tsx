/**
 * The compound, drawn.
 *
 * A list of stations tells you what exists. It does not tell you where work is
 * piling up, which is the only question this screen is really for. So every post is
 * a place, the work against it is a stack of crates, and the approval gate sits in
 * the middle because every agent in this system ends its run there — the
 * hub-and-spoke shape is the architecture, not a layout choice.
 *
 * Nothing here is decorative in the sense of being made up. A crate is a `tasks`
 * row, the light is the heartbeat's own assessment, and the sentence at the top
 * names whichever post holds the most work it cannot move.
 */

export type UnitState = 'running' | 'idle' | 'waiting' | 'stuck' | 'paused' | 'unmanned'

export interface PostView {
  key: string
  label: string
  agentName: string | null
  state: UnitState
  /** The task it is on right now, if any. */
  doing: string | null
  /** Why it is not working, when it is not. */
  reason: string
  queued: number
  blocked: number
  failed: number
  runnable: boolean
}

const UNIT_COLOUR: Record<UnitState, string> = {
  running: 'var(--toxic)',
  idle: 'var(--toxic)',
  waiting: 'var(--amber)',
  stuck: 'var(--rust)',
  paused: 'var(--muted)',
  unmanned: 'var(--edge-bright)',
}

/**
 * A worker at a post.
 *
 * Deliberately crude and readable at 28px rather than detailed: the thing that has
 * to carry across the room is the colour and whether the post is manned at all.
 */
function Unit({ state }: { state: UnitState }) {
  const colour = UNIT_COLOUR[state]
  const manned = state !== 'unmanned'

  return (
    <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true">
      {manned ? (
        <>
          <circle cx="13" cy="7" r="5" fill="none" stroke={colour} strokeWidth="1.5" />
          <path
            d="M4 29v-7a9 9 0 0 1 18 0v7"
            fill="none"
            stroke={colour}
            strokeWidth="1.5"
            strokeLinecap="square"
          />
          {state === 'running' ? (
            <circle cx="13" cy="7" r="2" fill={colour}>
              <animate
                attributeName="opacity"
                values="1;0.25;1"
                dur="1.2s"
                repeatCount="indefinite"
              />
            </circle>
          ) : null}
        </>
      ) : (
        // An empty post: the outline of somebody who is not there.
        <>
          <circle
            cx="13"
            cy="7"
            r="5"
            fill="none"
            stroke={colour}
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />
          <path
            d="M4 29v-7a9 9 0 0 1 18 0v7"
            fill="none"
            stroke={colour}
            strokeWidth="1.5"
            strokeDasharray="2 3"
          />
        </>
      )}
    </svg>
  )
}

/** One crate. Six of them is a problem you can see from the doorway. */
function Crate({ colour }: { colour: string }) {
  return (
    <svg width="18" height="11" viewBox="0 0 18 11" aria-hidden="true">
      <rect x="0.75" y="0.75" width="16.5" height="9.5" fill="none" stroke={colour} />
      <path d="M0.75 3.5h16.5M9 0.75v9.5" stroke={colour} strokeWidth="0.75" opacity="0.6" />
    </svg>
  )
}

/**
 * A stack of crates, capped.
 *
 * Past six the height stops meaning anything and the number does the work — a
 * stack of forty would just be a tall line.
 */
function Stack({ count, label, colour }: { count: number; label: string; colour: string }) {
  const drawn = Math.min(count, 6)
  return (
    <div>
      <div className="stack">
        {count === 0 ? (
          <span className="stack-count" style={{ color: 'var(--edge-bright)' }}>
            —
          </span>
        ) : (
          <>
            {Array.from({ length: drawn }, (_, i) => (
              <Crate key={i} colour={colour} />
            ))}
            {count > drawn ? (
              <span className="stack-count" style={{ color: colour }}>
                +{count - drawn}
              </span>
            ) : null}
          </>
        )}
      </div>
      <div className="stack-label" style={count > 0 ? { color: colour } : undefined}>
        {label} {count > 0 ? count : ''}
      </div>
    </div>
  )
}

export function Post({ post }: { post: PostView }) {
  const className = [
    'post',
    post.state === 'running' ? 'is-running' : '',
    post.state === 'stuck' ? 'is-stuck' : '',
    post.state === 'waiting' ? 'is-waiting' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={className}>
      <div className="post-head">
        <h3 className="post-name">{post.label}</h3>
        <span className="hash">{post.agentName ?? 'unmanned'}</span>
      </div>

      <div className="unit">
        <Unit state={post.state} />
        <span className="unit-doing">
          {post.doing ? (
            <>
              <strong style={{ color: 'var(--fg)' }}>on it:</strong> {post.doing}
            </>
          ) : (
            post.reason
          )}
        </span>
      </div>

      <div className="stacks">
        <Stack count={post.queued} label="waiting" colour="var(--toxic)" />
        <Stack count={post.blocked} label="held" colour="var(--amber)" />
        <Stack count={post.failed} label="failed" colour="var(--rust)" />
      </div>
    </article>
  )
}

export interface GateView {
  pending: number
  byKind: Array<{ kind: string; count: number }>
}

/**
 * The approval gate, in the middle because that is where it is.
 *
 * Every agent's run ends here. A number climbing in this box is not the system
 * being slow; it is the system waiting for the operator, which is a different
 * problem with a different fix.
 */
export function Gate({ gate }: { gate: GateView }) {
  return (
    <div className={`gate ${gate.pending === 0 ? 'is-empty' : ''}`}>
      <h3 className="gate-title">Quarantine</h3>
      <span className="gate-count" style={{ color: gate.pending > 0 ? 'var(--amber)' : 'var(--muted)' }}>
        {gate.pending}
      </span>
      <p className="hash" style={{ margin: 0 }}>
        {gate.pending === 0
          ? 'Nothing waiting on you.'
          : 'waiting on you — every run ends here'}
      </p>
      {gate.byKind.length > 0 ? (
        <ul className="gate-kinds">
          {gate.byKind.map((k) => (
            <li className="tag is-flagged" key={k.kind}>
              {k.kind} {k.count}
            </li>
          ))}
        </ul>
      ) : null}
      {gate.pending > 0 ? (
        <a className="act" href="/inbox">
          Open the queue
        </a>
      ) : null}
    </div>
  )
}
