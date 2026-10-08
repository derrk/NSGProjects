import type { DesignStorage, StoredObject } from './types'

export interface MockStorage extends DesignStorage {
  readonly objects: Map<string, { bytes: Uint8Array; contentType: string }>
}

/** In-memory storage so the pipeline runs with no Supabase project. */
export function createMockStorage(): MockStorage {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()

  return {
    objects,
    async upload(path, bytes, contentType): Promise<StoredObject> {
      objects.set(path, { bytes, contentType })
      return { path, url: `https://mock.storage.local/${path}` }
    },
    publicUrl(path) {
      return `https://mock.storage.local/${path}`
    },
  }
}
