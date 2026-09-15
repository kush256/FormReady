/**
 * A drawing surface that exists on the main thread and inside a worker.
 *
 * The compressor runs in a worker so that it keeps working when the app is not
 * on screen — see `compress.worker.ts` — and a worker has no `document`, so it
 * cannot make an `HTMLCanvasElement`. Rather than keep two copies of the render
 * path, everything the compressor draws on goes through here: it makes an
 * `OffscreenCanvas` where there is no document and an ordinary canvas where
 * there is, and the code above it never has to know which it got.
 */
export type Surface = HTMLCanvasElement | OffscreenCanvas

/** True inside a worker, where there is no DOM to fall back on. */
export const offscreenOnly = typeof document === 'undefined'

export function canUseOffscreen(): boolean {
  return typeof OffscreenCanvas === 'function'
}

export function createSurface(width: number, height: number): Surface {
  const w = Math.max(1, Math.ceil(width))
  const h = Math.max(1, Math.ceil(height))
  if (offscreenOnly) {
    if (!canUseOffscreen()) throw new Error('This device cannot draw off the screen.')
    return new OffscreenCanvas(w, h)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

export function sizeSurface(surface: Surface, width: number, height: number): void {
  surface.width = Math.max(1, Math.ceil(width))
  surface.height = Math.max(1, Math.ceil(height))
}

/**
 * The 2D context, opaque by default.
 *
 * A page is painted on white before anything else is drawn, so there is no
 * transparency to keep, and saying so lets the browser skip the alpha channel
 * through both rasterising and encoding.
 */
export function surfaceContext(
  surface: Surface,
  alpha = false,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = surface.getContext('2d', { alpha }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  // Out of memory is how a phone reports this, and an unchecked null here used
  // to surface later as an unrelated TypeError.
  if (!ctx) throw new Error('This device would not give the app a drawing surface.')
  return ctx
}

export function encodeSurface(surface: Surface, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in surface) return surface.convertToBlob({ type, quality })
  return new Promise((resolve, reject) => {
    surface.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
      type,
      quality,
    )
  })
}

/** Hands the pixels back now rather than when the collector gets round to it. */
export function releaseSurface(surface: Surface): void {
  surface.width = 0
  surface.height = 0
}
