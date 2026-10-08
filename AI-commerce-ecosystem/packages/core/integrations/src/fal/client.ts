import { createFalClient } from '@fal-ai/client'

import { withRetry } from '../retry'
import {
  FAL_MODELS,
  FalConfigurationError,
  type DownloadedImage,
  type GenerateRequest,
  type GeneratedImage,
  type ImagePipeline,
  type RemoveBackgroundRequest,
  type TransparentImage,
  type UpscaleRequest,
  type UpscaledImage,
} from './types'

export interface FalOptions {
  apiKey?: string
  /**
   * How long fal keeps the generated file. The default is undocumented and expired
   * files are unrecoverable, so this is set explicitly rather than trusted. Everything
   * is copied into Supabase Storage immediately anyway; this is only a safety margin.
   */
  retention?: '1h' | '1d' | '7d' | '30d'
}

/** Shape of a generator response. Ideogram and FLUX both return an images array. */
interface GeneratorOutput {
  images?: Array<{ url?: string; width?: number; height?: number }>
  seed?: number | string
}

/** Upscalers and background removal return ONE image, not an array. */
interface SingleImageOutput {
  image?: { url?: string }
}

export function createFalPipeline(options: FalOptions = {}): ImagePipeline {
  const apiKey = options.apiKey ?? process.env['FAL_KEY']
  if (!apiKey) {
    // The client does not fail fast on a missing key — it issues the request anyway
    // and comes back with a confusing 401. Check here instead.
    throw new FalConfigurationError('FAL_KEY is not set. Copy .env.example to .env and fill it in.')
  }

  // A dedicated client rather than the `fal` module singleton, whose config is
  // process-wide global state.
  const client = createFalClient({ credentials: apiKey })
  const storageSettings = { expiresIn: options.retention ?? '7d' } as const

  return {
    async generate(request: GenerateRequest): Promise<GeneratedImage> {
      const model = request.hasText ? FAL_MODELS.text : FAL_MODELS.illustration

      // The two models take different parameters. Ideogram has no output_format and
      // FLUX.2 pro has no num_images, so the inputs are built separately rather than
      // spread from one shared object.
      const input = request.hasText
        ? {
            prompt: request.prompt,
            image_size: { width: request.width, height: request.height },
            num_images: 1,
            // Lettering fidelity is the entire reason this model was chosen.
            rendering_speed: 'QUALITY',
            style: 'DESIGN',
            ...(request.seed === undefined ? {} : { seed: request.seed }),
            ...(request.negativePrompt === undefined
              ? {}
              : { negative_prompt: request.negativePrompt }),
          }
        : {
            prompt: request.prompt,
            image_size: { width: request.width, height: request.height },
            output_format: 'png',
            // A string enum, not a number — `safety_tolerance: 2` is a type error.
            safety_tolerance: '2',
            ...(request.seed === undefined ? {} : { seed: request.seed }),
          }

      const result = await withRetry(() =>
        client.subscribe(model, { input, storageSettings } as never),
      )

      const data = (result as { data?: GeneratorOutput }).data ?? {}
      const first = data.images?.[0]
      if (!first?.url) throw new Error(`${model} returned no image`)

      return {
        url: first.url,
        seed: data.seed === undefined ? null : String(data.seed),
        model,
        width: first.width ?? request.width,
        height: first.height ?? request.height,
      }
    },

    async upscale(request: UpscaleRequest): Promise<UpscaledImage> {
      const result = await withRetry(() =>
        client.subscribe(FAL_MODELS.upscale, {
          input: {
            image_url: request.imageUrl,
            upscale_factor: request.factor ?? 4,
            // Slower, but removes the tile seams that would print as visible lines.
            overlapping_tiles: true,
          },
          storageSettings,
        } as never),
      )

      // Note the shape change: a single `image`, not `images[0]`. A shared
      // "extract the url" helper across generate and upscale would crash here.
      const url = ((result as { data?: SingleImageOutput }).data ?? {}).image?.url
      if (!url) throw new Error(`${FAL_MODELS.upscale} returned no image`)
      return { url, model: FAL_MODELS.upscale }
    },

    async removeBackground(request: RemoveBackgroundRequest): Promise<TransparentImage> {
      const result = await withRetry(() =>
        client.subscribe(FAL_MODELS.removeBackground, {
          input: {
            image_url: request.imageUrl,
            // png, not jpeg — jpeg is not even an accepted value here, and the whole
            // point of this step is the alpha channel.
            output_format: 'png',
          },
          storageSettings,
        } as never),
      )

      const url = ((result as { data?: SingleImageOutput }).data ?? {}).image?.url
      if (!url) throw new Error(`${FAL_MODELS.removeBackground} returned no image`)
      return { url, model: FAL_MODELS.removeBackground }
    },

    async download(url: string): Promise<DownloadedImage> {
      const response = await withRetry(async () => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`downloading ${url} failed with ${res.status}`)
        return res
      })

      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'image/png',
      }
    },
  }
}
