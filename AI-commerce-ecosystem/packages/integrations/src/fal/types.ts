/**
 * The image pipeline, as an interface.
 *
 * Everything the Designer agent needs is behind this port so the whole pipeline can
 * run end to end in dev against `mock.ts` without spending money (SPEC.md
 * §External integrations).
 */

/** fal endpoint ids, verified against the shipped typed endpoint map. */
export const FAL_MODELS = {
  /** Text-heavy designs. Ideogram is the one that gets lettering right. */
  text: 'fal-ai/ideogram/v3',
  /** Illustrative designs. FLUX.2 pro is newer and cheaper than flux-pro/v1.1. */
  illustration: 'fal-ai/flux-2-pro',
  /**
   * Pure super-resolution, no prompt, no diffusion.
   *
   * NOT `fal-ai/clarity-upscaler`, which is the obvious-looking choice and wrong for
   * this product: it is a diffusion upscaler whose defaults (creativity 0.35, prompt
   * "masterpiece, best quality, highres") hallucinate detail and visibly mangle
   * lettering — and almost every design here has lettering. It is also billed on
   * OUTPUT megapixels, so cost grows with the square of the upscale factor: a 4x
   * upscale of a 1024-square image is ~16.8 MP, about $0.50 for one image, which is a
   * third of the entire daily fal budget.
   */
  upscale: 'fal-ai/aura-sr',
  /** Background removal to transparent PNG. v2 is the current generation. */
  removeBackground: 'fal-ai/birefnet/v2',
} as const

export interface GenerateRequest {
  prompt: string
  /** Chooses the model: Ideogram for lettering, FLUX for illustration. */
  hasText: boolean
  width: number
  height: number
  /** Pass one to make the result reproducible. */
  seed?: number
  negativePrompt?: string
}

export interface GeneratedImage {
  url: string
  /** Null when the model does not return one. */
  seed: string | null
  model: string
  width: number
  height: number
}

export interface UpscaleRequest {
  imageUrl: string
  /** Integer factor. aura-sr defaults to 4. */
  factor?: number
}

export interface UpscaledImage {
  url: string
  model: string
}

export interface RemoveBackgroundRequest {
  imageUrl: string
}

export interface TransparentImage {
  url: string
  model: string
}

export interface DownloadedImage {
  bytes: Uint8Array
  contentType: string
}

export interface ImagePipeline {
  generate(request: GenerateRequest): Promise<GeneratedImage>
  upscale(request: UpscaleRequest): Promise<UpscaledImage>
  removeBackground(request: RemoveBackgroundRequest): Promise<TransparentImage>
  /**
   * Fetch the bytes.
   *
   * Call this promptly: fal serves results from a CDN whose default retention is not
   * documented, and expired files are deleted permanently. Nothing in this system
   * should ever treat a fal URL as durable storage.
   */
  download(url: string): Promise<DownloadedImage>
}

export class FalConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FalConfigurationError'
  }
}
