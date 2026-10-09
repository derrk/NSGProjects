import { db } from '@acf/db'
import { loadTaskRecord, taskRecordToMarkdown } from '@acf/jobs'

/**
 * Download one task record as Markdown, ready to drop into an Obsidian vault.
 *
 * A file rather than a copy button: the point of the archive is that the record
 * outlives this app, and a file is the format that does.
 */
export async function GET(
  _request: Request,
  // Next 16: route params are a Promise.
  context: { params: Promise<{ taskId: string }> },
): Promise<Response> {
  const { taskId } = await context.params

  const record = await loadTaskRecord(db(), taskId)
  if (!record) {
    return new Response('No such task.', { status: 404 })
  }

  const markdown = taskRecordToMarkdown(record)

  // A filename someone can find again: the task title, not its uuid.
  const slug =
    record.task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'task'

  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${slug}-${taskId.slice(0, 8)}.md"`,
    },
  })
}
