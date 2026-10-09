/**
 * The core tool catalog: what every module gets for free.
 *
 * Assembled here and handed to the runtime, so a module never wires a tool itself and
 * the operator sees one list of everything any agent could possibly do.
 */

import { ToolCatalog, type ToolSpec } from '@acf/core/tools'
import { createMockFalPipeline, createFalPipeline, type ImagePipeline } from '@acf/integrations/fal'
import {
  createMockStorage,
  createSupabaseStorage,
  type DesignStorage,
} from '@acf/integrations/storage'
import * as z from 'zod'

import type { Database } from '@acf/db'

import { createDbQueryTool } from './db-query'
import {
  createEmbedTextTool,
  createFetchPageTool,
  createGenerateImageTool,
  createWebSearchTool,
  localLexicalEmbeddingProvider,
  simulatedSearchProvider,
  tavilySearchProvider,
  type EmbeddingProvider,
  type SearchProvider,
} from './external-tools'
import { knowledgeTools } from './knowledge-tools'

export * from './db-query'
export * from './external-tools'
export * from './knowledge-tools'

const json = (schema: z.ZodType) => z.toJSONSchema(schema) as Record<string, unknown>

/* ------------------------------------------------------------------ *
 * send_email
 * ------------------------------------------------------------------ */

const emailInput = z.object({
  to: z.string().describe('Recipient address.'),
  subject: z.string().describe('Subject line.'),
  body: z.string().describe('The message. Two short paragraphs at most.'),
  reason: z.string().describe('Why this needs sending. The operator reads this first.'),
})

/**
 * `send_email` does not send email.
 *
 * It drafts one and files it for approval. There is no "send" path in this tool at
 * all, and that is deliberate rather than unfinished: the brief requires a distinct
 * human approval before anything leaves the company, and the most reliable way to
 * guarantee that is for the sending code not to exist until an integration is
 * configured and the category has earned autonomy.
 */
export function createSendEmailTool(
  requestApproval: (input: {
    kind: string
    category: string
    refTable: string
    refId: string
    summary: string
    payload: unknown
    divisionId: string
    taskId: string | null
    requestedBy: string
  }) => Promise<{ approval: { id: string } }>,
): ToolSpec<z.infer<typeof emailInput>, unknown> {
  return {
    name: 'send_email',
    description:
      'Draft an email and file it for the operator to review. It is NOT sent — nothing ' +
      'leaves the company without a human approving the exact text and recipient first. ' +
      'Show the real message, not a placeholder.',
    inputSchema: emailInput,
    jsonSchema: json(emailInput),

    async handler(input, ctx) {
      const refId = crypto.randomUUID()
      const outcome = await requestApproval({
        kind: 'outreach_message',
        category: 'email',
        refTable: 'drafts',
        refId,
        summary: `Email to ${input.to}: ${input.subject}`,
        payload: {
          to: input.to,
          subject: input.subject,
          body: input.body,
          reason: input.reason,
          // Shown to the operator before they approve, per the brief: the exact
          // payload and destination.
          destination: 'email (no provider configured; approving records the decision only)',
        },
        divisionId: ctx.divisionId,
        taskId: ctx.taskId,
        requestedBy: `agent:${ctx.agentId}`,
      })

      await ctx.log('tool.email_drafted', `drafted an email to ${input.to}; awaiting approval`, {
        level: 'warn',
        refTable: 'approvals',
        refId: outcome.approval.id,
      })

      return {
        sent: false,
        status: 'awaiting_approval',
        approvalId: outcome.approval.id,
        note: 'This email has NOT been sent. It is waiting in the approval queue.',
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * Catalog assembly
 * ------------------------------------------------------------------ */

export interface CoreToolOptions {
  db: Database
  requestApproval: Parameters<typeof createSendEmailTool>[0]
  /** Offline stand-ins instead of paid APIs. */
  useMocks?: boolean
  search?: SearchProvider
  embeddings?: EmbeddingProvider
  images?: ImagePipeline
  storage?: DesignStorage
}

/**
 * Build the core catalog.
 *
 * Every provider falls back to an offline adapter, so the catalog is complete with no
 * credentials at all. What changes with a key is the honesty of the output, not the
 * shape of it — which is why nothing downstream has to know.
 */
export function createCoreToolCatalog(options: CoreToolOptions): ToolCatalog {
  const { db, useMocks = false } = options

  const tavilyKey = process.env['TAVILY_API_KEY']
  const search =
    options.search ??
    (!useMocks && tavilyKey ? tavilySearchProvider(tavilyKey) : simulatedSearchProvider())

  const embeddings = options.embeddings ?? localLexicalEmbeddingProvider()

  const images =
    options.images ?? (useMocks || !process.env['FAL_KEY'] ? createMockFalPipeline() : createFalPipeline())

  const storage =
    options.storage ??
    (useMocks || !process.env['SUPABASE_SECRET_KEY'] ? createMockStorage() : createSupabaseStorage())

  return new ToolCatalog([
    ...knowledgeTools(db),
    createDbQueryTool(db) as ToolSpec,
    createWebSearchTool(search) as ToolSpec,
    createFetchPageTool() as ToolSpec,
    createGenerateImageTool(images, storage) as ToolSpec,
    createEmbedTextTool(embeddings) as ToolSpec,
    createSendEmailTool(options.requestApproval) as ToolSpec,
  ])
}

/**
 * Tool names the core provides.
 *
 * Module validation checks grants against this, so an agent cannot be created asking
 * for a tool nobody supplies.
 */
export const CORE_TOOL_NAMES_ACTUAL = [
  'entities.upsert',
  'entities.search',
  'opportunities.create',
  'tasks.create',
  'ledger.post',
  'memory.recall',
  'memory.write',
  'notify_operator',
  'db.query',
  'web_search',
  'fetch_page',
  'generate_image',
  'embed_text',
  'send_email',
] as const
