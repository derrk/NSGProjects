/**
 * The local development database: Postgres 17 with pgvector, in Docker.
 *
 * Idempotent — run it as often as you like. If the container exists it is started;
 * if it is already running, nothing happens.
 *
 * Why Docker rather than the Postgres that may already be on your machine: this one
 * needs no password you have to find, cannot collide with anything you already run
 * (it listens on 5433), ships pgvector without a Windows build toolchain, and can be
 * thrown away with `pnpm dev:db:reset`.
 *
 * Production is Postgres on Supabase. Nothing in the app knows the difference;
 * DATABASE_URL is the only thing that changes.
 */

import { execFileSync, execSync } from 'node:child_process'

const NAME = 'acf-pg'
const PORT = process.env['DEV_DB_PORT'] ?? '5433'
const IMAGE = 'pgvector/pgvector:pg17'

function docker(args: string[], opts: { quiet?: boolean } = {}): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: opts.quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'inherit'],
  }).trim()
}

function containerState(): 'missing' | 'exited' | 'running' {
  try {
    const out = docker(['inspect', '-f', '{{.State.Status}}', NAME], { quiet: true })
    return out === 'running' ? 'running' : 'exited'
  } catch {
    return 'missing'
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function main() {
  try {
    docker(['info'], { quiet: true })
  } catch {
    console.error(
      'Docker is not running. Start Docker Desktop, then run this again.\n' +
        'No Docker? Point DATABASE_URL at any Postgres with the pgvector extension.',
    )
    process.exit(1)
  }

  const state = containerState()

  if (state === 'missing') {
    console.log(`creating ${NAME} from ${IMAGE} ...`)
    docker([
      'run',
      '-d',
      '--name',
      NAME,
      '-e',
      'POSTGRES_PASSWORD=acfdev',
      '-e',
      'POSTGRES_USER=acf',
      '-e',
      'POSTGRES_DB=acf',
      '-p',
      `${PORT}:5432`,
      IMAGE,
    ])
  } else if (state === 'exited') {
    console.log(`starting ${NAME} ...`)
    docker(['start', NAME])
  } else {
    console.log(`${NAME} is already running`)
  }

  /*
   * Wait for it to accept connections; `docker run` returns before Postgres is up.
   *
   * The wait is an awaited timer, not a shelled-out sleep. Windows' `timeout /t`
   * needs an interactive console and exits 125 when stdin is redirected — which is
   * exactly how this runs from a package script.
   */
  process.stdout.write('waiting for postgres')
  for (let i = 0; i < 60; i++) {
    try {
      execSync(`docker exec ${NAME} pg_isready -U acf -d acf`, { stdio: 'ignore' })
      console.log('\n')
      console.log(`  postgres ready on 127.0.0.1:${PORT}`)
      console.log(`  DATABASE_URL="postgresql://acf:acfdev@127.0.0.1:${PORT}/acf"\n`)
      return
    } catch {
      process.stdout.write('.')
      await sleep(1000)
    }
  }
  console.error('\npostgres did not become ready in time')
  process.exit(1)
}

main().catch((err: unknown) => {
  console.error('dev database failed to start:', err)
  process.exit(1)
})
