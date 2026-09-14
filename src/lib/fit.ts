import { canvasToBlob, loadImage, readImageDimensions, releaseCanvas, releaseImage } from './image'

/**
 * Working out what size a photo should be, by measuring rather than guessing.
 *
 * `requirements.ts` answers the same family of questions from formulas, which is
 * instant and good enough to refuse an impossible requirement before any work
 * starts. This module answers them by actually encoding the photo, which costs
 * a fraction of a second and is the only way to be right: how many bytes a
 * photo needs depends entirely on what is in it. A plain portrait and a page of
 * dense texture at identical dimensions differ by an order of magnitude.
 */

/**
 * Quality used while choosing dimensions.
 *
 * Not the maximum, deliberately. Maximum quality costs roughly three times the
 * bytes of this, which would buy about half the linear dimensions — and for a
 * photograph more pixels at 0.92 beats fewer pixels at 1.0 by a wide margin.
 * The argument for preferring maximum quality in `compressToTarget` applies
 * where dimensions are fixed by a form and pixels cannot be bought at all.
 * Here they can, so they are.
 */
const SIZING_QUALITY = 0.92

/** Aim just under the limit: close enough to spend it, clear enough not to breach it. */
const AIM_FRACTION = 0.94

/** First probe: large enough to be representative, small enough to be quick. */
const PROBE_PIXELS = 400_000

/** Opening guess for the exponent below, replaced by the measured value. */
const DEFAULT_EXPONENT = 0.8

/** An exponent outside this band is measurement noise; keep the default. */
const MIN_EXPONENT = 0.35
const MAX_EXPONENT = 1.6

/** Matches MAX_SOURCE_EDGE in image.ts: beyond this is memory, not detail. */
const MAX_AUTO_EDGE = 2400

/** Below this an image stops being a photograph. */
const MIN_EDGE = 20

/** More than this share of the limit left unused means the dimensions waste it. */
const WASTE_THRESHOLD = 0.6

/** A suggestion worth interrupting for: at least 20% more on each edge. */
const GROWTH_THRESHOLD = 1.44

export interface PhotoFacts {
  width: number
  height: number
  bytes: number
  /** JPG, PNG, WEBP… as a person would write it. */
  format: string
}

function formatFromFile(file: File): string {
  const fromType = file.type.split('/')[1]
  const raw = fromType || file.name.split('.').pop() || 'image'
  const upper = raw.toUpperCase()
  return upper === 'JPEG' ? 'JPG' : upper
}

/**
 * What the photo is, before anything is done to it.
 *
 * Reads the header only — a 12-megapixel photo is measured without decoding a
 * single pixel of it. Falls back to one decode for a format the header parser
 * does not recognise.
 */
export async function readPhotoFacts(file: File): Promise<PhotoFacts> {
  const format = formatFromFile(file)
  const header = await readImageDimensions(file).catch(() => null)
  if (header && header.width > 0 && header.height > 0) {
    return { ...header, bytes: file.size, format }
  }

  const bitmap = await createImageBitmap(file)
  const facts = { width: bitmap.width, height: bitmap.height, bytes: file.size, format }
  bitmap.close()
  return facts
}

/**
 * A photo decoded once, ready to be drawn at any size.
 *
 * This exists because the first version decoded the file afresh for every
 * measurement — three probes, a ceiling check and the final render, so five
 * full decodes of a multi-megapixel JPEG within a second or two. On Android
 * that exhausts the WebView's memory, and the failure is not graceful: once it
 * is gone, `getContext('2d')` returns null for everything afterwards and the
 * app stays broken until the process is killed. Decoding once and drawing from
 * the result many times costs a fraction as much and cannot run away.
 */
export interface PreparedPhoto {
  /** Dimensions of the decoded copy, already capped to something sane. */
  width: number
  height: number
  /** Draws a centred cover-crop of this photo onto a canvas of the given size. */
  render(width: number, height: number, reuse?: HTMLCanvasElement): HTMLCanvasElement
  close(): void
}

/** The centred rectangle of a photo that fills a given shape without distorting it. */
export function coverRect(naturalWidth: number, naturalHeight: number, aspect: number) {
  const sourceAspect = naturalWidth / naturalHeight
  if (sourceAspect > aspect) {
    const sw = naturalHeight * aspect
    return { sx: Math.round((naturalWidth - sw) / 2), sy: 0, sw: Math.round(sw), sh: naturalHeight }
  }
  const sh = naturalWidth / aspect
  return { sx: 0, sy: Math.round((naturalHeight - sh) / 2), sw: naturalWidth, sh: Math.round(sh) }
}

/**
 * Makes a 2D context, and says so plainly when the platform will not give one.
 *
 * A null context used to be asserted away with `!`, which turned an out-of-
 * memory condition into an unrelated TypeError several lines later.
 */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('This device would not give the app a drawing surface.')
  return ctx
}

/**
 * Decodes the photo once, shrinking it during the decode if it is very large.
 *
 * The cap is the same one `image.ts` uses: past 2400 px on the longest edge we
 * are holding memory rather than detail, and no form asks for more.
 */
export async function preparePhoto(file: Blob, natural: { width: number; height: number }): Promise<PreparedPhoto> {
  const scale = Math.min(1, MAX_AUTO_EDGE / Math.max(natural.width, natural.height))
  const width = Math.max(1, Math.round(natural.width * scale))
  const height = Math.max(1, Math.round(natural.height * scale))

  const drawFrom = (
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
    reuse?: HTMLCanvasElement,
  ) => {
    const rect = coverRect(sourceWidth, sourceHeight, targetWidth / targetHeight)
    const canvas = reuse ?? document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = context2d(canvas)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, targetWidth, targetHeight)
    ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, targetWidth, targetHeight)
    return canvas
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap =
        scale < 1
          ? await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
          : await createImageBitmap(file)
      return {
        width: bitmap.width,
        height: bitmap.height,
        render: (w, h, reuse) => drawFrom(bitmap, bitmap.width, bitmap.height, w, h, reuse),
        close: () => bitmap.close(),
      }
    } catch {
      // Some engines refuse the resize options; the image element below works
      // everywhere, at the cost of holding the photo at full size.
    }
  }

  const img = await loadImage(file)
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    render: (w, h, reuse) => drawFrom(img, img.naturalWidth, img.naturalHeight, w, h, reuse),
    close: () => releaseImage(img),
  }
}

export interface SizeChoice {
  width: number
  height: number
  /** Measured bytes at these dimensions. */
  bytes: number
  /** The answer was capped by the photo itself, not by the size limit. */
  atSourceLimit: boolean
}

interface Measurement {
  width: number
  height: number
  pixels: number
  bytes: number
}

/**
 * The largest dimensions of a given shape whose encode lands under `maxBytes`.
 *
 * Three test encodes. JPEG bytes follow pixel count as a power law, and the
 * exponent is a property of the photo, not a constant — measured across this
 * repo's fixtures it runs from 0.57 for a plain portrait to 1.28 for dense
 * texture. Assuming any one value overshoots or undershoots by two to three
 * times, so the first two probes measure the exponent for this photo and the
 * third lands on the answer.
 */
export async function findLargestFit(
  photo: PreparedPhoto,
  maxBytes: number,
  opts: {
    /** Output shape. Defaults to the photo's own. */
    aspect?: number
    quality?: number
    onProgress?: (fraction: number) => void
  } = {},
): Promise<SizeChoice> {
  const aspect = opts.aspect ?? photo.width / photo.height
  const quality = opts.quality ?? SIZING_QUALITY
  const aim = maxBytes * AIM_FRACTION

  // Never larger than the photo actually is: past that we would be inventing
  // detail, which costs bytes and adds nothing.
  const source = coverRect(photo.width, photo.height, aspect)
  const maxPixels = Math.max(MIN_EDGE * MIN_EDGE, source.sw * source.sh)
  const minPixels = MIN_EDGE * MIN_EDGE * Math.max(aspect, 1 / aspect)

  function dimsFor(pixels: number): { width: number; height: number } {
    const clamped = Math.min(maxPixels, Math.max(minPixels, pixels))
    const height = Math.max(MIN_EDGE, Math.round(Math.sqrt(clamped / aspect)))
    const width = Math.max(MIN_EDGE, Math.round(height * aspect))
    return { width, height }
  }

  // One canvas for all three probes, resized between them.
  const scratch = document.createElement('canvas')
  let done = 0
  async function measure(pixels: number): Promise<Measurement> {
    const { width, height } = dimsFor(pixels)
    photo.render(width, height, scratch)
    const blob = await canvasToBlob(scratch, 'image/jpeg', quality)
    opts.onProgress?.(Math.min(0.99, ++done / 3))
    return { width, height, pixels: width * height, bytes: blob.size }
  }

  const solve = (m: Measurement, exponent: number) => m.pixels * Math.pow(aim / m.bytes, 1 / exponent)

  try {
    const first = await measure(Math.min(maxPixels, PROBE_PIXELS))
    const second = await measure(solve(first, DEFAULT_EXPONENT))

    // Two points on the curve give its local slope, which is the exponent.
    let exponent = DEFAULT_EXPONENT
    const pixelRatio = Math.log(second.pixels / first.pixels)
    if (Math.abs(pixelRatio) > 0.05) {
      const measured = Math.log(second.bytes / first.bytes) / pixelRatio
      if (measured >= MIN_EXPONENT && measured <= MAX_EXPONENT) exponent = measured
    }
    const third = await measure(solve(second, exponent))

    const fitting = [third, second, first].filter((m) => m.bytes <= maxBytes)
    const best = fitting.length
      ? fitting.reduce((a, b) => (b.pixels > a.pixels ? b : a))
      : [first, second, third].reduce((a, b) => (b.bytes < a.bytes ? b : a))

    opts.onProgress?.(1)
    return {
      width: best.width,
      height: best.height,
      bytes: best.bytes,
      atSourceLimit: best.pixels >= maxPixels * 0.995,
    }
  } finally {
    releaseCanvas(scratch)
  }
}

export type FitVerdict =
  /** Nothing worth saying. */
  | 'good'
  /** The dimensions are too small to spend the limit, so quality is wasted. */
  | 'roomToGrow'
  /** The dimensions are too large for the limit, so quality will suffer. */
  | 'tight'

export interface FitAssessment {
  verdict: FitVerdict
  /** What the run will actually produce. */
  width: number
  height: number
  /** Roughly what it will weigh. Always quote as "about". */
  expectedBytes: number
  /** The measured ceiling at those dimensions, at maximum quality. */
  bestBytes: number
  /** Smallest limit that keeps the requested dimensions clean. Set for 'tight'. */
  clearBytes?: number
  /** Largest dimensions of the requested shape that fit the limit. */
  largest: SizeChoice
  /** The app chose the dimensions because none were given. */
  chosen: boolean
}

/**
 * Decides what to make, and whether the user should hear about it first.
 *
 * With no dimensions given there is nothing to warn about — the app simply
 * picks the largest that fits. With dimensions given there are two ways for the
 * pairing to be poor, and they are opposites: too few pixels to spend the limit
 * on, or too many to fit inside it.
 */
export async function assessPhoto(
  photo: PreparedPhoto,
  maxBytes: number,
  requested: { width: number; height: number } | null,
  onProgress?: (fraction: number) => void,
): Promise<FitAssessment> {
  if (!requested) {
    const largest = await findLargestFit(photo, maxBytes, { onProgress })
    return {
      verdict: largest.bytes <= maxBytes ? 'good' : 'tight',
      width: largest.width,
      height: largest.height,
      expectedBytes: largest.bytes,
      bestBytes: largest.bytes,
      largest,
      chosen: true,
    }
  }

  const aspect = requested.width / requested.height
  // The suggestion has to be the shape the user asked for, not the photo's.
  const largest = await findLargestFit(photo, maxBytes, {
    aspect,
    onProgress: (f) => onProgress?.(f * 0.7),
  })

  // The exact ceiling at the requested size: the most those pixels can hold.
  const canvas = photo.render(requested.width, requested.height)
  try {
    const best = await canvasToBlob(canvas, 'image/jpeg', 1)
    onProgress?.(0.85)

    const requestedPixels = requested.width * requested.height
    const largestPixels = largest.width * largest.height

    if (best.size <= maxBytes) {
      onProgress?.(1)
      const wasteful =
        best.size < maxBytes * WASTE_THRESHOLD && largestPixels > requestedPixels * GROWTH_THRESHOLD
      return {
        verdict: wasteful ? 'roomToGrow' : 'good',
        width: requested.width,
        height: requested.height,
        expectedBytes: best.size,
        bestBytes: best.size,
        largest,
        chosen: false,
      }
    }

    // Too heavy at maximum. Does it stay clean at the sizing quality?
    const clear = await canvasToBlob(canvas, 'image/jpeg', SIZING_QUALITY)
    onProgress?.(1)
    return {
      verdict: clear.size <= maxBytes ? 'good' : 'tight',
      width: requested.width,
      height: requested.height,
      expectedBytes: Math.min(maxBytes, clear.size),
      bestBytes: best.size,
      clearBytes: clear.size,
      largest,
      chosen: false,
    }
  } finally {
    releaseCanvas(canvas)
  }
}
