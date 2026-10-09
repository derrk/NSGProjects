import { withRetry } from '../retry'
import {
  PrintifyError,
  type CreateProductInput,
  type PrintifyBlueprint,
  type PrintifyClient,
  type PrintifyMockup,
  type PrintifyOrderStatus,
  type PrintifyPrintProvider,
  type PrintifyProduct,
  type PrintifyShop,
  type PrintifyUploadedImage,
  type PrintifyVariant,
} from './types'

const BASE_URL = 'https://api.printify.com/v1'

/**
 * Printify REJECTS any request without a User-Agent, and Node's global fetch does not
 * send one. The same call works in curl and fails here, which is a miserable thing to
 * debug in production, so it is set explicitly on every request.
 */
const USER_AGENT = 'ai-holding-company-os/0.1'

/** Printify's list endpoints cap at 50, not the 100 older docs suggest. */
export const PAGE_LIMIT = 50

export interface PrintifyOptions {
  token?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export function createPrintifyClient(options: PrintifyOptions = {}): PrintifyClient {
  const token = options.token ?? process.env['PRINTIFY_API_TOKEN']
  if (!token) {
    throw new PrintifyError(
      'PRINTIFY_API_TOKEN is not set. Add it to .env, or run with ACF_MOCK_INTEGRATIONS=1.',
    )
  }
  const baseUrl = options.baseUrl ?? BASE_URL
  const doFetch = options.fetchImpl ?? fetch

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return withRetry(async () => {
      const response = await doFetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
          ...(init.headers ?? {}),
        },
      })

      const text = await response.text()
      if (!response.ok) {
        // Printify's error code 8201 means BOTH "file too large" and "unsupported
        // format", so the message is the only thing that distinguishes them.
        let code: number | undefined
        try {
          code = (JSON.parse(text) as { code?: number }).code
        } catch {
          /* not JSON; the status and body will have to do */
        }
        throw new PrintifyError(
          `Printify ${response.status} on ${path}: ${text.slice(0, 500)}`,
          response.status,
          code,
        )
      }

      // Several endpoints answer with an empty body on success — publish is `{}`.
      return (text ? JSON.parse(text) : {}) as T
    })
  }

  return {
    async listShops() {
      return request<PrintifyShop[]>('/shops.json')
    },

    async listBlueprints() {
      return request<PrintifyBlueprint[]>('/catalog/blueprints.json')
    },

    async getPrintProviders(blueprintId) {
      return request<PrintifyPrintProvider[]>(
        `/catalog/blueprints/${blueprintId}/print_providers.json`,
      )
    },

    async getVariants(blueprintId, printProviderId) {
      const body = await request<{ variants: PrintifyVariant[] }>(
        `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
      )
      return body.variants ?? []
    },

    async uploadImageByUrl(fileName, url) {
      // By URL, not base64: a 4500x5400 PNG is large and base64 inflates it by a
      // third, and Printify's own docs say to use the URL form above 5MB.
      return request<PrintifyUploadedImage>('/uploads/images.json', {
        method: 'POST',
        body: JSON.stringify({ file_name: fileName, url }),
      })
    },

    async createProduct(shopId, input: CreateProductInput) {
      return request<PrintifyProduct>(`/shops/${shopId}/products.json`, {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          tags: input.tags,
          blueprint_id: input.blueprintId,
          print_provider_id: input.printProviderId,
          variants: input.variants,
          print_areas: input.printAreas.map((area) => ({
            variant_ids: area.variantIds,
            placeholders: area.placeholders,
          })),
        }),
      })
    },

    async getProduct(shopId, productId) {
      return request<PrintifyProduct>(`/shops/${shopId}/products/${productId}.json`)
    },

    async publish(shopId, productId) {
      /*
       * This LOCKS the product.
       *
       * Printify holds the lock until publishingSucceeded or publishingFailed is
       * called back. A process that dies between the two leaves the product
       * permanently uneditable, which is why the caller treats the callback as its
       * own durable step rather than a `finally` block.
       *
       * The `keyFeatures` key is camelCase while everything around it is snake_case.
       * That is Printify's API, not a typo.
       */
      await request<Record<string, never>>(`/shops/${shopId}/products/${productId}/publish.json`, {
        method: 'POST',
        body: JSON.stringify({
          title: true,
          description: true,
          images: true,
          variants: true,
          tags: true,
          keyFeatures: true,
          shipping_template: true,
        }),
      })
    },

    async publishingSucceeded(shopId, productId, external) {
      await request(`/shops/${shopId}/products/${productId}/publishing_succeeded.json`, {
        method: 'POST',
        body: JSON.stringify({ external: { id: external.id, handle: external.handle } }),
      })
    },

    async publishingFailed(shopId, productId, reason) {
      await request(`/shops/${shopId}/products/${productId}/publishing_failed.json`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
    },

    async getOrder(shopId, orderId) {
      return request<PrintifyOrderStatus>(`/shops/${shopId}/orders/${orderId}.json`)
    },
  }
}

/** Mockups Printify generated for a product, newest set first. */
export function defaultMockups(product: PrintifyProduct): PrintifyMockup[] {
  return (product.images ?? []).filter((i) => i.is_default).slice(0, 4)
}
