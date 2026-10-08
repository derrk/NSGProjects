export interface StoredObject {
  /** Path inside the bucket, e.g. `designs/<conceptId>/1.png`. */
  path: string
  /** URL the command center and Printify can read. */
  url: string
}

export interface DesignStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>
  publicUrl(path: string): string
}

export const DESIGN_BUCKET = 'designs'

/** Storage layout from SPEC.md §Data model. */
export function designPath(conceptId: string, variantNo: number): string {
  return `designs/${conceptId}/${variantNo}.png`
}

export function thumbnailPath(conceptId: string, variantNo: number): string {
  return `designs/${conceptId}/${variantNo}.thumb.png`
}
