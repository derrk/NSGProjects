/**
 * Typecheck every package.
 *
 * Not `tsc --build`: that needs composite projects, and `apps/web` sets `noEmit`
 * because Next owns its build. Checking each project separately gets the same
 * answer without making the web app emit declarations nobody consumes.
 *
 * Projects are discovered rather than listed, so a new module is covered the day
 * it is created instead of the day someone remembers to add it here.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const GROUPS = ['packages/core', 'modules', 'apps']

function discover(): string[] {
  const found: string[] = []
  for (const group of GROUPS) {
    if (!existsSync(group)) continue
    for (const entry of readdirSync(group, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const dir = join(group, entry.name)
      if (existsSync(join(dir, 'tsconfig.json'))) found.push(dir)
    }
  }
  return found
}

/**
 * The compiler's own JS entry, run under this Node.
 *
 * Not the `.bin/tsc` shim: on Windows that is a `.cmd`, which Node will only spawn
 * through a shell, and a shell concatenates arguments instead of escaping them —
 * which matters here because this repository's path contains spaces.
 */
const require_ = createRequire(import.meta.url)
const tscEntry = join(dirname(dirname(require_.resolve('typescript'))), 'bin', 'tsc')

const projects = discover()
if (projects.length === 0) {
  console.error('No tsconfig.json found under', GROUPS.join(', '))
  process.exit(1)
}

const failed: string[] = []
for (const project of projects) {
  process.stdout.write(`\n── ${project}\n`)
  const result = spawnSync(process.execPath, [tscEntry, '--noEmit', '-p', project], {
    stdio: 'inherit',
  })
  if (result.status !== 0) failed.push(project)
}

if (failed.length > 0) {
  console.error(`\nTypecheck failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`\nTypecheck clean across ${projects.length} projects.`)
