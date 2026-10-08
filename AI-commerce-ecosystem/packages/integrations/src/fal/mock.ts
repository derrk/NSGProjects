import type {
  DownloadedImage,
  GenerateRequest,
  GeneratedImage,
  ImagePipeline,
  RemoveBackgroundRequest,
  TransparentImage,
  UpscaleRequest,
  UpscaledImage,
} from './types'

/**
 * An offline stand-in for the fal pipeline.
 *
 * Lets the whole Designer pipeline run end to end in dev and in tests without
 * spending money (SPEC.md §External integrations). It returns a real, valid PNG so
 * anything downstream that decodes the bytes still works.
 */

/** A 2x2 transparent PNG, base64. Small but genuinely decodable. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M+ADzDRQ8GoAoYKAFKgAwOaPoQJAAAAAElFTkSuQmCC'

export interface MockFalOptions {
  /** Fail the nth generate call, to exercise the retry path. */
  failGenerateOnCall?: number
}

export interface MockFalPipeline extends ImagePipeline {
  readonly calls: {
    generate: GenerateRequest[]
    upscale: UpscaleRequest[]
    removeBackground: RemoveBackgroundRequest[]
    download: string[]
  }
}

export function createMockFalPipeline(options: MockFalOptions = {}): MockFalPipeline {
  const calls: MockFalPipeline['calls'] = {
    generate: [],
    upscale: [],
    removeBackground: [],
    download: [],
  }

  return {
    calls,

    async generate(request: GenerateRequest): Promise<GeneratedImage> {
      calls.generate.push(request)
      if (options.failGenerateOnCall === calls.generate.length) {
        throw new Error('mock fal: generate failed on purpose')
      }
      const model = request.hasText ? 'fal-ai/ideogram/v3' : 'fal-ai/flux-2-pro'
      return {
        url: `https://mock.fal.local/${model}/${calls.generate.length}.png`,
        seed: String(request.seed ?? 1000 + calls.generate.length),
        model,
        width: request.width,
        height: request.height,
      }
    },

    async upscale(request: UpscaleRequest): Promise<UpscaledImage> {
      calls.upscale.push(request)
      return { url: `${request.imageUrl}?upscaled=1`, model: 'fal-ai/aura-sr' }
    },

    async removeBackground(request: RemoveBackgroundRequest): Promise<TransparentImage> {
      calls.removeBackground.push(request)
      return { url: `${request.imageUrl}?nobg=1`, model: 'fal-ai/birefnet/v2' }
    },

    async download(url: string): Promise<DownloadedImage> {
      calls.download.push(url)
      return {
        bytes: Uint8Array.from(Buffer.from(TINY_PNG_BASE64, 'base64')),
        contentType: 'image/png',
      }
    },
  }
}
