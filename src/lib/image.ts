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
 * Reads a photo's pixel size out of its header, without decoding it.
 *
 * Worth the parsing: it tells us whether a photo needs shrinking at all, and
 * the answer is usually no. Before this, every photo was fully decoded once
 * just to measure it and then decoded a second time for display — two passes
 * over a 12-megapixel image to learn something stored in its first few bytes.
 *
 * Returns null for anything it doesn't recognise, and the caller falls back to
 * decoding.
 */
export async function readImageDimensions(
  file: Blob,
): Promise<{ width: number; height: number } | null> {
  // Every format below keeps its dimensions in the first few hundred bytes,
  // except JPEG, whose EXIF thumbnail can push them further in.
  const head = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer())
  return readPng(head) ?? readJpeg(head) ?? readWebp(head) ?? readGif(head)
}

function readPng(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function readJpeg(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]
    // Fill bytes and standalone markers carry no length field.
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    const segmentLength = (b[i + 2] << 8) | b[i + 3]
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isStartOfFrame) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] }
    }
    if (segmentLength < 2) return null
    i += 2 + segmentLength
  }
  return null
}

function readWebp(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3])
  const format = String.fromCharCode(b[8], b[9], b[10], b[11])
  if (tag !== 'RIFF' || format !== 'WEBP') return null
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15])
  if (chunk === 'VP8X') {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    }
  }
  if (chunk === 'VP8 ') {
    return { width: ((b[26] | (b[27] << 8)) & 0x3fff), height: ((b[28] | (b[29] << 8)) & 0x3fff) }
  }
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  return null
}

function readGif(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null
  return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) }
}

/**
 * Loads a photo for editing, shrinking it only if it is genuinely oversized.
 *
 * Form requirements top out in the low hundreds of pixels, so a full 12-
 * megapixel decode is 48 MB spent on detail that the crop throws away. The
 * header tells us the size first, and a photo already within the cap goes
 * straight to the browser with a single decode.
 */
export async function loadCappedImage(file: Blob): Promise<HTMLImageElement> {
  const header = await readImageDimensions(file).catch(() => null)
  // A rotated photo reports its width and height the other way round, but the
  // longest edge is the same either way, which is all this test needs.
  if (header && Math.max(header.width, header.height) <= MAX_SOURCE_EDGE) {
    return loadImage(file)
  }

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
  releaseCanvas(canvas)
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

/**
 * Frees a canvas's backing store immediately.
 *
 * A 2200-pixel canvas holds around 20 MB of pixels. Waiting for the collector
 * to notice is how a batch of photos runs a phone out of memory halfway
 * through, so every canvas we finish with is dropped on the spot.
 */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

export interface PhotoPreview {
  width: number
  height: number
  /** Small data URL for list rows, cheap enough to hold dozens of. */
  thumbnail: string
}

/** Longest edge of a list thumbnail. */
const THUMB_EDGE = 180

/**
 * Reads a photo's true size and makes a small preview, keeping nothing else.
 *
 * The previous version held a fully decoded copy of every picked photo for as
 * long as the screen was open — around 10 MB each for a phone screenshot, and
 * an object URL that was never released. A few photos was enough for Android
 * to kill the WebView mid-conversion.
 */
export async function readPhotoPreview(file: Blob): Promise<PhotoPreview> {
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file)
      const width = bitmap.width
      const height = bitmap.height
      const preview = drawThumbnail(bitmap, width, height)
      return { width, height, thumbnail: preview }
    } catch {
      // Fall through to the <img> path below.
    } finally {
      bitmap?.close()
    }
  }

  const img = await loadImage(file)
  const preview = drawThumbnail(img, img.naturalWidth, img.naturalHeight)
  const result = { width: img.naturalWidth, height: img.naturalHeight, thumbnail: preview }
  revokeIfObjectUrl(img.src)
  return result
}

function drawThumbnail(source: CanvasImageSource, width: number, height: number): string {
  const ratio = Math.min(THUMB_EDGE / Math.max(width, height), 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * ratio))
  canvas.height = Math.max(1, Math.round(height * ratio))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.6)
  releaseCanvas(canvas)
  return url
}

function revokeIfObjectUrl(src: string) {
  if (src.startsWith('blob:')) URL.revokeObjectURL(src)
}

/**
 * Releases the file behind a loaded image.
 *
 * loadImage hands back an <img> pointing at an object URL, and an object URL
 * keeps its blob alive until it is revoked. Preparing a dozen photos in one
 * session without this leaves every one of them in memory.
 */
export function releaseImage(img: HTMLImageElement | null | undefined): void {
  if (img) revokeIfObjectUrl(img.src)
}

/**
 * Decodes a photo straight to the size we actually want.
 *
 * Passing the target size to createImageBitmap lets the browser scale during
 * decode, on its own thread, so the full-resolution pixels are never held at
 * all. Decoding a 12-megapixel photo and then shrinking it costs 48 MB and a
 * long main-thread stall; this costs neither.
 *
 * The canvas is opaque and pre-filled with white, so a screenshot with a
 * transparent background becomes white rather than black once it is a JPEG.
 */
export async function decodeToCanvas(
  file: Blob,
  naturalWidth: number,
  naturalHeight: number,
  maxEdge: number,
): Promise<HTMLCanvasElement> {
  const ratio = Math.min(maxEdge / Math.max(naturalWidth, naturalHeight, 1), 1)
  const width = Math.max(1, Math.round(naturalWidth * ratio))
  const height = Math.max(1, Math.round(naturalHeight * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap =
        ratio < 1
          ? await createImageBitmap(file, {
              resizeWidth: width,
              resizeHeight: height,
              resizeQuality: 'high',
            })
          : await createImageBitmap(file)
      ctx.drawImage(bitmap, 0, 0, width, height)
      bitmap.close()
      return canvas
    } catch {
      // Fall through to the <img> path below.
    }
  }

  const img = await loadImage(file)
  ctx.drawImage(img, 0, 0, width, height)
  revokeIfObjectUrl(img.src)
  return canvas
}

/**
 * Encodes a JPEG close to a byte budget, in at most three attempts.
 *
 * The binary search in compressToTarget is the right tool when the number is a
 * hard requirement printed in a notification. A page inside a PDF only has a
 * budget, so eight encodes of a full-size photo is time the user waits for
 * with nothing to show for it.
 */
export async function encodeJpegNearTarget(
  canvas: HTMLCanvasElement,
  maxBytes: number,
  startQuality = 0.82,
): Promise<Blob> {
  let quality = startQuality
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  for (let attempt = 0; attempt < 2 && blob.size > maxBytes; attempt++) {
    // JPEG size responds to quality roughly as a square root, so this lands
    // close on the first correction instead of creeping down step by step.
    quality = Math.max(0.35, quality * Math.sqrt(maxBytes / blob.size))
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  }
  return blob
}

/**
 * Colour steps per channel to try when a PNG has to hit a size, best first.
 *
 * PNG has no quality dial, so the only lever that keeps the exact pixel
 * dimensions a form asks for is how many distinct colours the image contains.
 * Fewer colours means longer runs of identical pixels, which is precisely what
 * PNG's compression is good at.
 */
const PNG_LEVELS = [256, 192, 128, 96, 64, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2]

function posterise(source: ImageData, target: ImageData, levels: number): void {
  const step = 255 / (levels - 1)
  const lookup = new Uint8ClampedArray(256)
  for (let value = 0; value < 256; value++) lookup[value] = Math.round(Math.round(value / step) * step)

  const src = source.data
  const dst = target.data
  for (let i = 0; i < src.length; i += 4) {
    dst[i] = lookup[src[i]]
    dst[i + 1] = lookup[src[i + 1]]
    dst[i + 2] = lookup[src[i + 2]]
    dst[i + 3] = src[i + 3]
  }
}

/**
 * Gets a PNG under a byte budget without changing its pixel dimensions.
 *
 * Reducing the colour count is the only honest lever here: the dimensions are
 * the requirement, so they cannot move. It searches for the richest palette
 * that still fits, and reports metTarget=false rather than pretending when
 * even two levels per channel is too large.
 */
export async function compressPngToTarget(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<CompressResult> {
  const plain = await canvasToBlob(canvas, 'image/png')
  if (plain.size <= maxBytes) {
    return { blob: plain, quality: 1, bytes: plain.size, metTarget: true }
  }

  const ctx = canvas.getContext('2d')!
  const original = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const scratch = ctx.createImageData(canvas.width, canvas.height)

  let lo = 1
  let hi = PNG_LEVELS.length - 1
  let best: CompressResult | null = null

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    posterise(original, scratch, PNG_LEVELS[mid])
    ctx.putImageData(scratch, 0, 0)
    const blob = await canvasToBlob(canvas, 'image/png')
    if (blob.size <= maxBytes) {
      best = { blob, quality: PNG_LEVELS[mid] / 256, bytes: blob.size, metTarget: true }
      // It fits, so try to keep more colour than this.
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }

  if (!best) {
    posterise(original, scratch, PNG_LEVELS[PNG_LEVELS.length - 1])
    ctx.putImageData(scratch, 0, 0)
    const floor = await canvasToBlob(canvas, 'image/png')
    best = {
      blob: floor,
      quality: PNG_LEVELS[PNG_LEVELS.length - 1] / 256,
      bytes: floor.size,
      metTarget: floor.size <= maxBytes,
    }
  }

  // Hand the canvas back as it arrived; the caller keeps the blob, not this.
  ctx.putImageData(original, 0, 0)
  return best
}

/**
 * Roughly the smallest a PNG of these dimensions can get with its colours cut
 * right back. Higher than the JPEG floor because PNG never throws away detail,
 * it only compresses what is there. Errs low, like its JPEG counterpart.
 */
export function estimateSmallestPngBytes(width: number, height: number): number {
  return Math.max(3072, Math.round(width * height * 0.05))
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

export interface InkBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Finds the box around everything darker than paper.
 *
 * A signature drawn on a phone never fills the pad, and the empty margin is
 * what makes a drawn signature look small and lost once it is shrunk to
 * 140 by 60. Trimming to the ink first means the stroke fills the frame the
 * way a photographed signature does.
 */
export function findInkBounds(canvas: HTMLCanvasElement, threshold = 235): InkBounds | null {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      const alpha = data[i + 3]
      if (alpha < 8) continue
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (luminance > threshold) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Draws the ink from a signature pad into an exact target size, on white,
 * keeping its proportions and leaving a small even margin.
 */
export function renderTrimmedInk(
  source: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  marginRatio = 0.06,
): HTMLCanvasElement {
  const bounds = findInkBounds(source) ?? {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { alpha: false })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetWidth, targetHeight)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const marginX = targetWidth * marginRatio
  const marginY = targetHeight * marginRatio
  const boxWidth = Math.max(1, targetWidth - marginX * 2)
  const boxHeight = Math.max(1, targetHeight - marginY * 2)
  const scale = Math.min(boxWidth / bounds.width, boxHeight / bounds.height)
  const drawWidth = bounds.width * scale
  const drawHeight = bounds.height * scale

  ctx.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    (targetWidth - drawWidth) / 2,
    (targetHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
  return canvas
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
