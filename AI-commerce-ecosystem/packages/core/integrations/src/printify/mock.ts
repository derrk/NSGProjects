import type {
  CreateProductInput,
  PrintifyClient,
  PrintifyProduct,
  PrintifyVariant,
} from './types'
import { PrintifyError } from './types'

/**
 * An offline Printify.
 *
 * Models the behaviours that actually bite, not just the happy path: publishing locks
 * the product, a locked product refuses edits, and the lock is only released by a
 * callback. A mock that ignored the lock would let the pipeline pass tests it would
 * fail in production.
 */

/** Fixtures shaped like the real catalog, for the blueprints SPEC.md names. */
const BLUEPRINTS = [
  { id: 6, title: 'Unisex Jersey Short Sleeve Tee', brand: 'Bella+Canvas', model: '3001', images: [] },
  { id: 49, title: 'Unisex Heavy Blend Hooded Sweatshirt', brand: 'Gildan', model: '18500', images: [] },
  { id: 77, title: 'Unisex Heavy Blend Crewneck Sweatshirt', brand: 'Gildan', model: '18000', images: [] },
  { id: 68, title: 'Mug 11oz', brand: 'Generic', model: '11oz', images: [] },
  { id: 1108, title: 'Mug 15oz', brand: 'Generic', model: '15oz', images: [] },
]

const PROVIDERS = [
  { id: 29, title: 'Monster Digital' },
  { id: 99, title: 'Printify Choice' },
]

/** Placeholder sizes differ per blueprint and provider; these mirror that. */
function variantsFor(blueprintId: number): PrintifyVariant[] {
  const isMug = blueprintId === 68 || blueprintId === 1108
  const placeholder = isMug
    ? { position: 'front', width: blueprintId === 68 ? 2700 : 3300, height: blueprintId === 68 ? 1050 : 1200 }
    : { position: 'front', width: 4500, height: 5400 }

  const titles = isMug ? ['11oz'] : ['S', 'M', 'L', 'XL']
  return titles.map((title, i) => ({
    id: blueprintId * 1000 + i,
    title,
    options: { size: title },
    placeholders: [placeholder],
    // Costs in cents, roughly realistic so the pricing table produces sane prices.
    cost: isMug ? 520 : 1180,
    is_enabled: true,
  }))
}

export interface MockPrintifyClient extends PrintifyClient {
  readonly products: Map<string, PrintifyProduct>
  readonly calls: {
    createProduct: CreateProductInput[]
    publish: string[]
    publishingSucceeded: string[]
    publishingFailed: Array<{ productId: string; reason: string }>
    uploads: Array<{ fileName: string; url: string }>
  }
}

export function createMockPrintifyClient(): MockPrintifyClient {
  const products = new Map<string, PrintifyProduct>()
  const calls: MockPrintifyClient['calls'] = {
    createProduct: [],
    publish: [],
    publishingSucceeded: [],
    publishingFailed: [],
    uploads: [],
  }
  let seq = 0

  return {
    products,
    calls,

    async listShops() {
      return [{ id: 1, title: 'Mock Shop', sales_channel: 'shopify' }]
    },

    async listBlueprints() {
      return BLUEPRINTS
    },

    async getPrintProviders() {
      return PROVIDERS
    },

    async getVariants(blueprintId) {
      return variantsFor(blueprintId)
    },

    async uploadImageByUrl(fileName, url) {
      calls.uploads.push({ fileName, url })
      return {
        id: `img_${++seq}`,
        file_name: fileName,
        width: 4500,
        height: 5400,
        preview_url: `https://mock.printify.local/preview/${seq}.png`,
      }
    },

    async createProduct(_shopId, input) {
      calls.createProduct.push(input)
      const id = `prod_${++seq}`
      const product: PrintifyProduct = {
        id,
        title: input.title,
        description: input.description,
        tags: input.tags,
        blueprint_id: input.blueprintId,
        print_provider_id: input.printProviderId,
        variants: input.variants.map((v) => ({
          id: v.id,
          title: `variant ${v.id}`,
          options: {},
          placeholders: [],
          price: v.price,
          is_enabled: v.is_enabled,
        })),
        images: [1, 2, 3].map((n) => ({
          src: `https://mock.printify.local/mockup/${id}/${n}.jpg`,
          variant_ids: input.variants.map((v) => v.id),
          position: n === 1 ? 'front' : 'context',
          is_default: n <= 2,
        })),
        visible: false,
        is_locked: false,
      }
      products.set(id, product)
      return product
    },

    async getProduct(_shopId, productId) {
      const product = products.get(productId)
      if (!product) throw new PrintifyError(`no product ${productId}`, 404)
      return product
    },

    async publish(_shopId, productId) {
      const product = products.get(productId)
      if (!product) throw new PrintifyError(`no product ${productId}`, 404)
      if (product.is_locked) {
        throw new PrintifyError(`product ${productId} is locked by a previous publish`, 400)
      }
      // The real API locks here and keeps it locked until a callback arrives.
      product.is_locked = true
      calls.publish.push(productId)
    },

    async publishingSucceeded(_shopId, productId) {
      const product = products.get(productId)
      if (!product) throw new PrintifyError(`no product ${productId}`, 404)
      product.is_locked = false
      product.visible = true
      calls.publishingSucceeded.push(productId)
    },

    async publishingFailed(_shopId, productId, reason) {
      const product = products.get(productId)
      if (!product) throw new PrintifyError(`no product ${productId}`, 404)
      product.is_locked = false
      calls.publishingFailed.push({ productId, reason })
    },

    async getOrder(_shopId, orderId) {
      return { id: orderId, status: 'in-production', shipments: [] }
    },
  }
}
