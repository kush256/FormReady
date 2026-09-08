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

/**
 * Longest edge we keep from a source photo. Form requirements top out in the
 * low hundreds of pixels, so anything beyond this is memory and decode time
 * spent on detail that gets thrown away at crop time.
 */
const MAX_SOURCE_EDGE = 2400

/**
 * Decodes a photo off the main thread and caps its size before it ever
 * reaches the DOM. A 12-megapixel phone photo decoded straight into an <img>
 * blocks the main thread and holds ~48 MB; this keeps it to a few MB.
 */
export async function loadCappedImage(file: Blob): Promise<HTMLImageElement> {
  if (typeof createImageBitmap !== 'function') {
    return loadImage(file)
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return loadImage(file)
  }

  const longestEdge = Math.max(bitmap.width, bitmap.height)
  if (longestEdge <= MAX_SOURCE_EDGE) {
    bitmap.close()
    return loadImage(file)
  }

  const ratio = MAX_SOURCE_EDGE / longestEdge
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * ratio)
  canvas.height = Math.round(bitmap.height * ratio)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92)
  canvas.width = 0
  canvas.height = 0
  return loadImage(blob)
}

/**
 * Roughly the smallest a JPEG of these dimensions can get before it stops
 * being usable. Used to catch impossible requirements before any work starts,
 * so it errs low — better to attempt a tight target than to refuse a possible
 * one. Photographic JPEGs bottom out near 0.07 bytes per pixel.
 */
export function estimateSmallestJpegBytes(width: number, height: number): number {
  return Math.max(2048, Math.round(width * height * 0.07))
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

export interface InkAnalysis {
  /** Enough of the ink reads as blue that a portal is likely to reject it. */
  isBlue: boolean
  /** Share of the image that is ink rather than paper. */
  inkRatio: number
}

const INK_LUMINANCE = 165

/**
 * Looks at the colour of the ink in a signature.
 *
 * SSC, UPSC and IBPS notifications ask for signatures in black ink, and a blue
 * one is a widely reported cause of an "unclear image" rejection. Cheap to
 * detect: ink pixels whose blue channel runs well ahead of their red.
 */
export function analyseInk(canvas: HTMLCanvasElement): InkAnalysis {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  let inkPixels = 0
  let bluePixels = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    if (luminance >= INK_LUMINANCE) continue
    inkPixels++
    if (b - r > 24 && b > g) bluePixels++
  }

  const totalPixels = data.length / 4
  return {
    isBlue: inkPixels > 0 && bluePixels / inkPixels > 0.35,
    inkRatio: totalPixels > 0 ? inkPixels / totalPixels : 0,
  }
}

/**
 * Turns coloured ink black and cleans the paper to white, in place.
 *
 * Greyscales first, then stretches the levels between the darkest and
 * lightest parts actually present, so antialiased strokes stay smooth rather
 * than turning into jagged pure-black pixels.
 */
export function forceInkBlack(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data

  const histogram = new Uint32Array(256)
  const luminances = new Uint8ClampedArray(data.length / 4)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    luminances[p] = luminance
    histogram[luminances[p]]++
  }

  const total = luminances.length
  const inkLevel = percentile(histogram, total, 0.02)
  const paperLevel = percentile(histogram, total, 0.92)
  const span = Math.max(1, paperLevel - inkLevel)

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const stretched = Math.max(0, Math.min(255, ((luminances[p] - inkLevel) / span) * 255))
    data[i] = stretched
    data[i + 1] = stretched
    data[i + 2] = stretched
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const goal = total * fraction
  let seen = 0
  for (let level = 0; level < histogram.length; level++) {
    seen += histogram[level]
    if (seen >= goal) return level
  }
  return 255
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
