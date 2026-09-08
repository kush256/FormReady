export function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read this image file.'))
    if (typeof source === 'string') {
      img.src = source
    } else {
      img.src = URL.createObjectURL(source)
    }
  })
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))),
      type,
      quality,
    )
  })
}

export interface CompressResult {
  blob: Blob
  quality: number
  bytes: number
  metTarget: boolean
}

/**
 * Binary-searches JPEG/WEBP quality to land at or under maxBytes while
 * keeping pixel dimensions fixed. Falls back to the smallest-quality
 * result if the target can't be met (metTarget=false so the caller can warn).
 */
export async function compressToTarget(
  canvas: HTMLCanvasElement,
  opts: { maxBytes: number; mimeType?: 'image/jpeg' | 'image/webp'; minQuality?: number },
): Promise<CompressResult> {
  const mimeType = opts.mimeType ?? 'image/jpeg'
  const minQuality = opts.minQuality ?? 0.2
  let lo = minQuality
  let hi = 0.95
  let best: CompressResult | null = null

  // First check the floor — if even minimum quality is too big, dimensions
  // are simply too large for the budget; return the smallest we can make.
  const floorBlob = await canvasToBlob(canvas, mimeType, minQuality)
  if (floorBlob.size > opts.maxBytes) {
    return { blob: floorBlob, quality: minQuality, bytes: floorBlob.size, metTarget: false }
  }

  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2
    const blob = await canvasToBlob(canvas, mimeType, mid)
    if (blob.size <= opts.maxBytes) {
      best = { blob, quality: mid, bytes: blob.size, metTarget: true }
      lo = mid
    } else {
      hi = mid
    }
  }

  if (best) return best
  return { blob: floorBlob, quality: minQuality, bytes: floorBlob.size, metTarget: floorBlob.size <= opts.maxBytes }
}

export interface CropRect {
  /** All values are fractions (0..1) of the source image's natural size. */
  sx: number
  sy: number
  sWidth: number
  sHeight: number
}

/** Renders a fractional crop of `img` onto a canvas at exact target pixel dimensions. */
export function renderCrop(
  img: HTMLImageElement,
  crop: CropRect,
  targetWidth: number,
  targetHeight: number,
  background = '#ffffff',
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = background
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  const sx = crop.sx * img.naturalWidth
  const sy = crop.sy * img.naturalHeight
  const sWidth = crop.sWidth * img.naturalWidth
  const sHeight = crop.sHeight * img.naturalHeight

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight)
  return canvas
}

/** Default centered "cover" crop rectangle for a given target aspect ratio. */
export function coverCrop(img: HTMLImageElement, targetWidth: number, targetHeight: number): CropRect {
  const targetRatio = targetWidth / targetHeight
  const srcRatio = img.naturalWidth / img.naturalHeight
  if (srcRatio > targetRatio) {
    // source is wider than target -> crop left/right
    const sWidth = targetRatio / srcRatio
    return { sx: (1 - sWidth) / 2, sy: 0, sWidth, sHeight: 1 }
  } else {
    // source is taller than target -> crop top/bottom
    const sHeight = srcRatio / targetRatio
    return { sx: 0, sy: (1 - sHeight) / 2, sWidth: 1, sHeight }
  }
}

/** Lightens near-white pixels to pure white in place, to clean up scanned signature backgrounds. */
export function whitenBackground(canvas: HTMLCanvasElement, threshold = 225): void {
  const ctx = canvas.getContext('2d')!
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    const luminance = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    if (luminance >= threshold) {
      px[i] = 255
      px[i + 1] = 255
      px[i + 2] = 255
    }
  }
  ctx.putImageData(data, 0, 0)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(blob)
  })
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}
