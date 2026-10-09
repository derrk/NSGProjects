/**
 * Printify API v1, as this system uses it.
 *
 * Printify prints and ships; the operator never touches a box. What this client has to
 * get right is the product creation body and the publish handshake, because both have
 * failure modes that cost real money or leave a product permanently stuck.
 */

export interface PrintifyShop {
  id: number
  title: string
  sales_channel: string
}

export interface PrintifyBlueprint {
  id: number
  title: string
  brand: string
  model: string
  images: string[]
}

export interface PrintifyPrintProvider {
  id: number
  title: string
}

/**
 * A placeholder is one printable area on one variant.
 *
 * Its pixel dimensions differ per blueprint AND per print provider, which is why
 * nothing in this system hard-codes 4500x5400: generating one file and reusing it
 * across providers letterboxes or crops it.
 */
export interface PrintifyPlaceholder {
  position: string
  width: number
  height: number
}

export interface PrintifyVariant {
  id: number
  title: string
  options: Record<string, unknown>
  placeholders: PrintifyPlaceholder[]
  /** Printify's cost to make it, in cents. The basis for the retail price. */
  cost?: number
  price?: number
  is_enabled?: boolean
}

export interface PrintifyUploadedImage {
  id: string
  file_name: string
  height: number
  width: number
  preview_url: string
}

export interface PrintifyMockup {
  src: string
  variant_ids: number[]
  position: string
  is_default: boolean
}

export interface PrintifyProduct {
  id: string
  title: string
  description: string
  tags: string[]
  blueprint_id: number
  print_provider_id: number
  variants: PrintifyVariant[]
  images: PrintifyMockup[]
  visible?: boolean
  is_locked?: boolean
}

export interface CreateProductInput {
  title: string
  description: string
  tags: string[]
  blueprintId: number
  printProviderId: number
  variants: Array<{ id: number; price: number; is_enabled: boolean }>
  printAreas: Array<{
    variantIds: number[]
    placeholders: Array<{
      position: string
      images: Array<{ id: string; x: number; y: number; scale: number; angle: number }>
    }>
  }>
}

export interface PrintifyOrderStatus {
  id: string
  status: string
  shipments: Array<{ carrier: string; number: string; url: string; delivered_at?: string }>
}

export class PrintifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'PrintifyError'
  }
}

/**
 * The whole Printify surface this system needs, as a port.
 *
 * Everything behind it is mockable, so the pipeline runs end to end in dev without a
 * token and without creating products in a real shop.
 */
export interface PrintifyClient {
  listShops(): Promise<PrintifyShop[]>
  listBlueprints(): Promise<PrintifyBlueprint[]>
  getPrintProviders(blueprintId: number): Promise<PrintifyPrintProvider[]>
  /** Variants carry the per-provider placeholder sizes and the production cost. */
  getVariants(blueprintId: number, printProviderId: number): Promise<PrintifyVariant[]>
  /** Upload by URL rather than base64: a 300dpi PNG inflates ~33% as base64. */
  uploadImageByUrl(fileName: string, url: string): Promise<PrintifyUploadedImage>
  createProduct(shopId: string, input: CreateProductInput): Promise<PrintifyProduct>
  getProduct(shopId: string, productId: string): Promise<PrintifyProduct>
  /**
   * Publish to the connected sales channel.
   *
   * Returns nothing useful — Printify answers `{}`. More importantly it LOCKS the
   * product, and the lock is only released by calling back `publishingSucceeded` or
   * `publishingFailed`. A crash in between leaves the product uneditable forever.
   */
  publish(shopId: string, productId: string): Promise<void>
  publishingSucceeded(
    shopId: string,
    productId: string,
    external: { id: string; handle: string },
  ): Promise<void>
  publishingFailed(shopId: string, productId: string, reason: string): Promise<void>
  getOrder(shopId: string, orderId: string): Promise<PrintifyOrderStatus>
}
