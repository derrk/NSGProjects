import { createClient } from '@supabase/supabase-js'

import { withRetry } from '../retry'
import { DESIGN_BUCKET, type DesignStorage, type StoredObject } from './types'

export interface SupabaseStorageOptions {
  url?: string
  /**
   * Server-side secret key. Supabase's new scheme is `sb_secret_...`; the legacy
   * `service_role` JWT still works but is being retired. Never give this env var a
   * NEXT_PUBLIC_ prefix — Next.js would inline it into the browser bundle.
   */
  secretKey?: string
  bucket?: string
}

export function createSupabaseStorage(options: SupabaseStorageOptions = {}): DesignStorage {
  const url = options.url ?? process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = options.secretKey ?? process.env['SUPABASE_SECRET_KEY'] ?? process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set')
  }

  const bucket = options.bucket ?? DESIGN_BUCKET
  const client = createClient(url, key, { auth: { persistSession: false } })

  return {
    async upload(path: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
      await withRetry(async () => {
        const { error } = await client.storage.from(bucket).upload(path, bytes, {
          // Mandatory in practice: without it the object is stored as text/plain and
          // silently fails to render as an image.
          contentType,
          // A string, not a number.
          cacheControl: '3600',
          upsert: true,
        })
        if (error) throw error
      })

      return { path, url: this.publicUrl(path) }
    },

    publicUrl(path: string): string {
      // Synchronous, and returns only { data }. Awaiting it or destructuring `error`
      // is a type error.
      const { data } = client.storage.from(bucket).getPublicUrl(path)
      return data.publicUrl
    },
  }
}
