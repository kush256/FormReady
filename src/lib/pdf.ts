import { PDFDocument, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { canvasToBlob, decodeToCanvas, releaseCanvas } from './image'
import {
  createSurface,
  encodeSurface,
  offscreenOnly,
  releaseSurface,
  sizeSurface,
  surfaceContext,
  type Surface,
} from './surface'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const PAGE_MARGIN = 24

/**
 * Counts the pages in a document.
 *
 * Uses pdf.js rather than pdf-lib because it only needs to read the catalogue,
 * not build an object model of every page. On a large file that is the
 * difference between a moment and several seconds, paid once per file the
 * moment it is added to a list.
 */
export async function getPageCount(file: Blob): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data }).promise
  const count = doc.numPages
  await doc.destroy()
  return count
}

/**
 * pdf.js's own scratch canvases, made where there is no document.
 *
 * pdf.js reaches for `document.createElement('canvas')` on its own account —
 * scaling an image, painting a pattern — and inside a worker that is simply
 * undefined, which failed the whole job. It takes the class, not an instance,
 * and builds it itself.
 */
class OffscreenCanvasFactory {
  create(width: number, height: number) {
    const canvas = createSurface(width, height)
    return { canvas, context: surfaceContext(canvas, true) }
  }

  reset(owned: { canvas: Surface }, width: number, height: number) {
    sizeSurface(owned.canvas, width, height)
  }

  destroy(owned: { canvas: Surface | null; context: unknown }) {
    if (owned.canvas) releaseSurface(owned.canvas)
    owned.canvas = null
    owned.context = null
  }
}

/**
 * Whether the filters this render asked for could not be honoured here.
 *
 * One pipeline runs per thread, so this is reset at every load rather than
 * threaded through calibration, projection, assembly and refinement. Only the
 * worker ever sets it: on the main thread pdf.js keeps its own factory, which
 * has a document and builds the filters properly.
 */
const filters = { degraded: false }

/**
 * pdf.js builds a transfer map as `fn(i / 255) * 255 | 0`, so a function that
 * does nothing lands back on `i`, give or take the truncation.
 */
function isIdentityMap(map: Uint8Array | null | undefined): boolean {
  if (!map) return true
  for (let i = 0; i < map.length; i++) {
    if (Math.abs(map[i] - i) > 1) return false
  }
  return true
}

/**
 * pdf.js's SVG filters, asked for where there is no document to build them in.
 *
 * Transfer functions and soft masks are applied by pointing `ctx.filter` at an
 * SVG filter appended to the page. That needs a document, and in a worker
 * pdf.js's own factory reaches for `document.URL` and throws — which is the
 * "Cannot read properties of undefined (reading 'URL')" that stopped a 224-page
 * scan on page 156, three-quarters of the way through a long job.
 *
 * This cannot build those filters either; `url(...)` does not resolve from a
 * worker at all. What it can do is tell a filter that changes nothing from one
 * that does. A transfer map that maps every value back to itself is what
 * scanners leave behind routinely, and dropping it is exactly right. Anything
 * with real effect sets `degraded`, and the job restarts on the main thread
 * instead of quietly returning a page that renders wrong.
 */
class WorkerFilterFactory {
  addFilter(maps?: (Uint8Array | null)[] | null) {
    if (maps?.some((map) => !isIdentityMap(map))) filters.degraded = true
    return 'none'
  }

  addAlphaFilter(map?: Uint8Array | null) {
    if (!isIdentityMap(map)) filters.degraded = true
    return 'none'
  }

  addLuminosityFilter() {
    // No map to inspect our way out of: luminosity means "take the mask's
    // brightness as its opacity", and without the filter the mask is applied by
    // its alpha instead. A gradient becomes a hard edge.
    filters.degraded = true
    return 'none'
  }

  // Only ever asked for when page colours are forced, which this app does not do.
  addHCMFilter() {
    return 'none'
  }

  addHighlightHCMFilter() {
    return 'none'
  }

  destroy() {}
}

/**
 * Always copies, on purpose: pdf.js detaches whatever buffer it is handed —
 * confirmed by testing, not assumed — and `bytes` here is `fallback`
 * throughout `compressPdf`, needed live for the whole run so a worse result
 * is never handed back. The copy is what keeps that buffer intact.
 */
async function loadPdfJsDoc(bytes: Uint8Array) {
  filters.degraded = false
  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(),
    ...(offscreenOnly
      ? { CanvasFactory: OffscreenCanvasFactory, FilterFactory: WorkerFilterFactory }
      : {}),
  })
  return loadingTask.promise
}

export interface PageThumbnails {
  /** Known the moment the file opens, without rendering anything. */
  pageCount: number
  /** Aspect ratio of the first page, for correctly shaped placeholders. */
  aspectRatio: number
  /** Renders one 0-based page, or returns the cached image. */
  get(index: number): Promise<string>
  close(): void
}

/**
 * Opens a PDF for previewing and renders pages only when they are asked for.
 *
 * Rendering every page up front is what made Split PDF sit on a spinner for a
 * minute: a 345-page document meant 345 renders before the user saw anything,
 * and they usually only wanted page 4. Opening the document is nearly free, so
 * the grid can appear immediately and fill itself in as the user scrolls.
 */
/**
 * How many drawn pages to keep.
 *
 * At a measured 15.3 KB each, this is about 4 MB however long the document is.
 * Past this the oldest go: redrawing one costs a few milliseconds, where an
 * uncapped map on a 615-page book grew until the WebView ran out of room.
 */
const THUMBNAIL_CACHE = 240

export async function openPageThumbnails(
  bytes: Uint8Array,
  maxWidth = 220,
): Promise<PageThumbnails> {
  const doc = await loadPdfJsDoc(bytes)
  const cache = new Map<number, string>()
  const inFlight = new Map<number, Promise<string>>()
  let closed = false

  const first = await doc.getPage(1)
  const firstViewport = first.getViewport({ scale: 1 })
  const aspectRatio = firstViewport.width / firstViewport.height
  first.cleanup()

  // Renders run one at a time. Firing off thirty at once on a phone competes
  // for the same decoder and makes every one of them land later.
  let chain: Promise<unknown> = Promise.resolve()

  async function render(index: number): Promise<string> {
    const page = await doc.getPage(index + 1)
    try {
      const viewport = page.getViewport({ scale: 1 })
      const scale = maxWidth / viewport.width
      const scaled = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(scaled.width))
      canvas.height = Math.max(1, Math.ceil(scaled.height))
      const ctx = canvas.getContext('2d', { alpha: false })!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: scaled }).promise
      const url = canvas.toDataURL('image/jpeg', 0.7)
      releaseCanvas(canvas)
      return url
    } finally {
      page.cleanup()
    }
  }

  return {
    pageCount: doc.numPages,
    aspectRatio,
    get(index: number): Promise<string> {
      const cached = cache.get(index)
      if (cached) {
        // Re-insert so the pages being looked at are the last to be dropped.
        cache.delete(index)
        cache.set(index, cached)
        return Promise.resolve(cached)
      }
      const running = inFlight.get(index)
      if (running) return running

      const task = chain.then(async () => {
        if (closed) throw new Error('This document is closed.')
        const url = await render(index)
        cache.set(index, url)
        while (cache.size > THUMBNAIL_CACHE) {
          const oldest = cache.keys().next().value
          if (oldest === undefined) break
          cache.delete(oldest)
        }
        inFlight.delete(index)
        return url
      })
      inFlight.set(index, task)
      chain = task.catch(() => {})
      return task
    },
    close() {
      closed = true
      cache.clear()
      inFlight.clear()
      doc.destroy().catch(() => {})
    },
  }
}

/**
 * Renders a page, reusing the caller's canvas when one is offered.
 *
 * A long document otherwise allocates and frees one canvas per page. Resizing
 * a single canvas hands the same job to the allocator once instead of three
 * hundred times, which on a phone is the difference between smooth progress
 * and periodic stalls.
 */
async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  scale: number,
  reuse?: Surface,
): Promise<Surface> {
  const viewport = page.getViewport({ scale })
  const canvas = reuse ?? createSurface(viewport.width, viewport.height)
  if (reuse) sizeSurface(canvas, viewport.width, viewport.height)
  const ctx = surfaceContext(canvas)
  // A page is white before anything is painted on it, and pdf.js will not fill
  // that itself on an opaque context.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({
    canvasContext: ctx as CanvasRenderingContext2D,
    viewport,
  }).promise
  // Checked here because every render in this file goes through this function,
  // and the page is worth abandoning the moment it is known to be wrong rather
  // than at the end of a document that may still have hundreds of pages left.
  if (filters.degraded) throw new PdfNeedsDomError()
  return canvas
}

export interface ImagePageInput {
  blob: Blob
  width: number
  height: number
}

/**
 * Turns one image into something pdf-lib will accept.
 *
 * pdf-lib only understands baseline JPEG and PNG. A progressive JPEG, a
 * CMYK one out of a scanner, or a WEBP straight from a phone gallery all throw
 * here, and that used to abort the whole document. Anything it refuses gets
 * decoded and written back out as a plain JPEG instead.
 */
async function embedImage(pdfDoc: PDFDocument, blob: Blob, width: number, height: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  try {
    return blob.type === 'image/png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
  } catch {
    // Not a format pdf-lib reads directly; normalise it below.
  }

  const canvas = await decodeToCanvas(blob, width, height, 2200)
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.82)
  releaseCanvas(canvas)
  return pdfDoc.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))
}

/** Builds a single PDF with one image per page, fit to A4 with a margin, centered. */
export async function imagesToPdf(
  images: ImagePageInput[],
  onPage?: (done: number) => void,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  for (const [index, image] of images.entries()) {
    const embedded = await embedImage(pdfDoc, image.blob, image.width, image.height)

    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
    const maxW = A4_WIDTH - PAGE_MARGIN * 2
    const maxH = A4_HEIGHT - PAGE_MARGIN * 2
    const ratio = Math.min(maxW / image.width, maxH / image.height, 1)
    const drawW = image.width * ratio
    const drawH = image.height * ratio
    page.drawRectangle({ x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT, color: rgb(1, 1, 1) })
    page.drawImage(embedded, {
      x: (A4_WIDTH - drawW) / 2,
      y: (A4_HEIGHT - drawH) / 2,
      width: drawW,
      height: drawH,
    })

    onPage?.(index + 1)
    // Let the progress counter actually paint between pages.
    await yieldToUi(true)
  }
  return pdfDoc.save({ useObjectStreams: true })
}

/**
 * Joins documents in order.
 *
 * Files are read one at a time rather than all up front, so only the document
 * being copied and the one being built are ever in memory. Reading them all
 * first meant a 171 MB merge held its own size twice over before any work
 * started.
 */
export async function mergePdfs(
  files: Blob[],
  onFile?: (done: number, pagesSoFar: number) => void,
): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  let pagesSoFar = 0
  for (const [index, file] of files.entries()) {
    const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
      ignoreEncryption: true,
    })
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
    pagesSoFar += pages.length
    onFile?.(index + 1, pagesSoFar)
    await yieldToUi(true)
  }
  return merged.save({ useObjectStreams: true })
}

/** Extracts the given 0-based page indices, in the order supplied, into a new PDF. */
export async function extractPages(bytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, pageIndices)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

export type CompressMethod = 'already-small' | 'lossless' | 'rasterised'

export interface CompressPdfResult {
  bytes: Uint8Array
  metTarget: boolean
  originalBytes: number
  finalBytes: number
  method: CompressMethod
  /** Pages re-encoded as images. Text-only pages are copied instead, staying sharp. */
  rasterisedPages: number
  copiedPages: number
  /** Re-encoding the pages was measured to be pointless, so it was skipped. */
  notWorthRasterising?: boolean
  /** The pages are scanned text and going smaller would have blurred the words. */
  stoppedForLegibility?: boolean
  /** The work was measured to cost far more time than the saving was worth. */
  notWorthTheTime?: { minutes: number; savingPercent: number }
}

export interface CompressProgress {
  phase: 'lossless' | 'analysing' | 'compressing' | 'refining'
  fraction: number
  page: number
  pageCount: number
  /** Running output size, so the UI can count down towards the target. */
  bytesSoFar: number
  /** Seconds left, once enough pages are done to estimate honestly. */
  etaSeconds?: number
}

export interface CompressOptions {
  onProgress?: (progress: CompressProgress) => void
  signal?: AbortSignal
}

/**
 * No number is claimed here on purpose.
 *
 * A round figure was drafted and then disproved by testing: after the
 * redundant copy was removed, a 44 MB file — the reported case — compressed
 * in under 8 seconds, and 117, 243 and 389 MB files all compressed
 * successfully too, in a browser tab with far more memory available to it
 * than an Android WebView actually gets. The honest ceiling depends on the
 * phone, not on this file, and this codebase cannot measure that from here —
 * only a real device can. So this error names the true cause without
 * pretending to know a limit nobody has actually hit on a phone yet.
 */
export class PdfTooLargeError extends Error {
  constructor() {
    super(
      'This PDF ran out of memory to compress on this device. Try splitting it into smaller parts first, then compressing each part.',
    )
    this.name = 'PdfTooLargeError'
  }
}

/** The file needs a password pdf.js was never given one to try. */
export class PdfPasswordError extends Error {
  constructor() {
    super('This PDF is password protected. Remove the password and try again.')
    this.name = 'PdfPasswordError'
  }
}

/** pdf.js could not make sense of the file at all — not a size problem. */
export class PdfDamagedError extends Error {
  constructor() {
    super('This file could not be read as a PDF. It may be damaged, or not actually a PDF.')
    this.name = 'PdfDamagedError'
  }
}

/**
 * Not a failure: this document needs a document to render faithfully.
 *
 * Raised inside the worker when a page turns out to use a transfer function or
 * a soft mask with real effect, which a worker cannot apply. The client catches
 * it and runs the whole job again on the main thread, so the user never sees
 * this text — they get the right file, more slowly, and only for the few
 * documents that actually need it.
 */
export class PdfNeedsDomError extends Error {
  constructor() {
    super('This PDF needs to be rendered on the main thread.')
    this.name = 'PdfNeedsDomError'
  }
}

const OUT_OF_MEMORY = /out of memory|allocation failed|array buffer allocation/i

/**
 * Turns whatever pdf.js or pdf-lib threw into one of the errors above, rather
 * than flattening every failure into "too large" the way both catch sites
 * used to. A page that will not render and a phone that has run out of RAM
 * are different bugs, and telling them apart is the only way either one ever
 * gets fixed.
 */
function classifyFailure(e: unknown, context?: string): Error {
  if (isCancellation(e)) return e as Error
  // A routing decision, not a diagnosis: it must reach the client intact.
  if (e instanceof PdfNeedsDomError) return e
  // PasswordException is not part of pdfjs-dist's public d.ts, unlike
  // InvalidPDFException, so it is told apart by the name pdf.js itself gives
  // it rather than by instanceof.
  if (e instanceof Error && e.name === 'PasswordException') return new PdfPasswordError()
  if (e instanceof pdfjsLib.InvalidPDFException) return new PdfDamagedError()
  if (e instanceof RangeError || (e instanceof Error && OUT_OF_MEMORY.test(e.message))) {
    return new PdfTooLargeError()
  }
  const detail = e instanceof Error ? e.message : String(e)
  const error = new Error(context ? `${context}: ${detail}` : detail)
  error.name = 'PdfCompressionError'
  return error
}

export function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('Compression cancelled')
    error.name = 'AbortError'
    throw error
  }
}

/** Lets the browser paint progress and process a cancel tap between pages. */
let lastYield = 0

/**
 * Hands the main thread back, but only when it has actually been held.
 *
 * Yielding after every page sounds harmless until the browser's four
 * millisecond timer floor is multiplied by three hundred pages. This yields on
 * a frame budget instead, so progress still paints about sixty times a second
 * and nothing is spent on pages that were quick.
 */
function yieldToUi(force = false): Promise<void> {
  // In a worker there is no interface to keep painting, and this is the whole
  // reason compression stalled when the app was not on screen: Chromium
  // throttles a hidden page's timers to one a second, then one a minute, so a
  // yield per page turned a three-minute job into hours. Nothing here waits on
  // a timer any more — the awaits on rendering and encoding turn the message
  // queue by themselves, which is what lets a cancel still arrive.
  if (offscreenOnly) return Promise.resolve()
  const now = performance.now()
  if (!force && now - lastYield < 16) return Promise.resolve()
  lastYield = now
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Leaves headroom for the PDF's own structure on top of the page images. */
const STRUCTURE_HEADROOM = 0.92
const MAX_QUALITY = 0.82

/**
 * How far the renderer may move, and in which direction it gives ground.
 *
 * pdf.js scale 1 is 72 DPI, so these are resolutions in disguise. Which limits
 * apply depends entirely on what the page holds, because the two kinds of page
 * fail in opposite directions:
 *
 * A photograph tolerates a startling amount of JPEG damage but looks obviously
 * wrong once it loses pixels, so it may be shrunk a long way and kept at decent
 * quality. A scan of text is the reverse. Letter strokes are one or two pixels
 * wide; drop below about 120 DPI and they stop being letters no matter how high
 * the quality, while at a sane resolution text survives quality levels that
 * would ruin a photograph. Resolution is therefore defended for text and
 * quality is spent instead — and when even that is not enough, the compressor
 * stops rather than handing back a page nobody can read.
 */
interface RenderLimits {
  minScale: number
  maxScale: number
  minQuality: number
  maxPixels: number
  /** The pages are scans of text, so legibility sets the floor. */
  text: boolean
}

const PHOTO_LIMITS: RenderLimits = {
  minScale: 0.45,
  maxScale: 1.6,
  minQuality: 0.3,
  maxPixels: 1_600_000,
  text: false,
}

/** 120 DPI at the floor, 150 at the ceiling: the readable band for scanned text. */
const TEXT_LIMITS: RenderLimits = {
  minScale: 120 / 72,
  maxScale: 150 / 72,
  minQuality: 0.4,
  maxPixels: 2_300_000,
  text: true,
}

/**
 * pdf-lib parses a whole document into JavaScript objects, costing several
 * times the file size in memory. Past this we still attempt the cheap lossless
 * pass but release the parsed document immediately rather than holding it
 * through rasterisation.
 */
const PDF_LIB_SAFE_BYTES = 24 * 1024 * 1024

/** Holding a parsed document for page copying is only safe on smaller files. */
const PDF_LIB_HOLD_BYTES = 8 * 1024 * 1024

/** Reading the operator list of every page is only worth it on shorter documents. */
const PLAN_MAX_PAGES = 60

/** Pages measured before deciding whether rasterising the rest is worth it. */
const SAMPLE_PAGES = 3

/**
 * A long run has to be worth the wait.
 *
 * A already-efficient scan of a few hundred pages can be re-encoded for a few
 * percent, and on a phone that costs the better part of an hour. Nobody wants
 * that trade, and the person waiting cannot see it coming. Both sides of it are
 * measurable from the sampling pass, before a single page is committed to.
 */
const WORTHWHILE_SAVING = 0.15
const LONG_RUN_MS = 45_000

/**
 * How many times the sampled measurement is fed back into the settings before
 * committing to the full pass.
 *
 * Each round costs three page renders. Getting the first pass right is worth
 * far more than that: the alternative is discovering the overshoot only after
 * every page has been rendered, and rendering them all over again.
 */
const PROJECTION_ROUNDS = 2

/**
 * How far over the limit the first pass has to land before a second one is
 * worth rendering the whole document again. A result a whisker over is not
 * worth doubling the wait for.
 */
const REFINE_THRESHOLD = 1.02

/** Progress is divided up front so the bar never jumps backwards. */
const PLAN_BASE = 0.06
const PLAN_SPAN = 0.08
const SAMPLE_BASE = 0.14
const SAMPLE_SPAN = 0.06
const ASSEMBLE_BASE = 0.2
const ASSEMBLE_SPAN = 0.6
const REFINE_BASE = 0.8
const REFINE_SPAN = 0.19

/** Rough JPEG cost per pixel, used only to pick a starting resolution. */
const BYTES_PER_PIXEL_GUESS = 0.2

type PagePlan = { index: number; rasterise: boolean }

/**
 * Compresses a PDF to fit under maxBytes, in a single render pass.
 *
 * Small documents get a lossless re-save first, and keep their text-only pages
 * untouched so they stay sharp and selectable. Large ones skip straight to
 * streaming rasterisation, holding one page in memory at a time.
 */
export async function compressPdf(
  bytes: Uint8Array,
  maxBytes: number,
  options: CompressOptions = {},
): Promise<CompressPdfResult> {
  const { signal } = options
  // Tracked so a failure deep in the render pass can say which page it was
  // on — the difference between "page 4 of 600 will not render" and "this
  // whole file is too big" is exactly the distinction this function used to
  // erase.
  let lastPage = 0
  const onProgress: CompressOptions['onProgress'] = options.onProgress
    ? (p) => {
        if (p.page) lastPage = p.page
        options.onProgress!(p)
      }
    : undefined
  const originalBytes = bytes.byteLength

  if (originalBytes <= maxBytes) {
    return {
      bytes,
      metTarget: true,
      originalBytes,
      finalBytes: originalBytes,
      method: 'already-small',
      rasterisedPages: 0,
      copiedPages: 0,
    }
  }

  // Report something before the first parse, which on a large file is a few
  // seconds of silence the user would otherwise read as a freeze.
  onProgress?.({ phase: 'analysing', fraction: 0.02, page: 0, pageCount: 0, bytesSoFar: originalBytes })
  // Hand the frame back so that message is actually on screen before the
  // parse starts, rather than queued behind it.
  await yieldToUi(true)

  const canParse = originalBytes <= PDF_LIB_SAFE_BYTES
  const canHold = originalBytes <= PDF_LIB_HOLD_BYTES

  // Rasterising can make a text-heavy document bigger than it started. Keep
  // the smallest thing we have seen so we never hand back a worse file.
  let fallback = bytes
  let fallbackMethod: CompressMethod = 'already-small'

  // The lossless pass costs seconds even on a big file and often achieves a
  // modest reduction on its own, which is exactly what a large document
  // usually needs. Worth trying before considering hundreds of renders.
  let srcDoc: PDFDocument | null = null
  if (canParse) {
    onProgress?.({ phase: 'lossless', fraction: 0.04, page: 0, pageCount: 0, bytesSoFar: originalBytes })
    try {
      srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
      // ignoreEncryption means pdf-lib will parse an encrypted file rather
      // than throwing, but it does not decrypt anything — a resave copies the
      // ciphertext through verbatim, with no /Encrypt entry to say so, and
      // hands back a file that looks valid and is not. Confirmed by testing:
      // a genuinely encrypted PDF "compressed" successfully and silently.
      // pdf.js is what correctly demands the password, so a file this pass
      // cannot actually read honestly is left for that path instead.
      if (srcDoc.isEncrypted) throw new PdfPasswordError()
      const lossless = await srcDoc.save({ useObjectStreams: true })
      throwIfAborted(signal)
      if (lossless.byteLength < fallback.byteLength) {
        fallback = lossless
        fallbackMethod = 'lossless'
      }
      if (lossless.byteLength <= maxBytes) {
        return {
          bytes: lossless,
          metTarget: true,
          originalBytes,
          finalBytes: lossless.byteLength,
          method: 'lossless',
          rasterisedPages: 0,
          copiedPages: srcDoc.getPageCount(),
        }
      }
      // On a large file, release the parsed document now. Holding it through
      // rasterisation is what runs the WebView out of memory.
      if (!canHold) srcDoc = null
    } catch (e) {
      if (isCancellation(e)) throw e
      srcDoc = null
    }
  }

  // pdfjs takes ownership of the buffer it is handed. Copy only when we still
  // need the original around; on a large file that copy is memory we can't spare.
  // No outer slice: loadPdfJsDoc already makes its own copy, and a second
  // one here was pure waste — the exact redundancy that held a 42 MB file
  // three times over before a single page had rendered.
  let renderDoc: pdfjsLib.PDFDocumentProxy
  try {
    renderDoc = await loadPdfJsDoc(bytes)
  } catch (e) {
    throw classifyFailure(e, 'Could not open this PDF')
  }
  const pageCount = renderDoc.numPages

  onProgress?.({ phase: 'analysing', fraction: PLAN_BASE, page: 0, pageCount, bytesSoFar: originalBytes })
  const plan = await buildPagePlan(renderDoc, pageCount, Boolean(srcDoc), {
    onProgress,
    signal,
    originalBytes,
  })
  const rasterCount = plan.filter((p) => p.rasterise).length

  const budgetPerPage = Math.max(2048, (maxBytes * STRUCTURE_HEADROOM) / Math.max(1, rasterCount))
  const samplePage = plan.find((p) => p.rasterise)!.index
  const { limits, ...calibrated } = await calibrate(renderDoc, samplePage, budgetPerPage, signal)
  let settings = calibrated
  throwIfAborted(signal)

  // Measure a handful of pages before committing to hundreds of them. A long
  // document that is mostly text gains nothing from rasterisation and can even
  // grow, and finding that out after forty minutes of work is unforgivable.
  const sampleSpan = SAMPLE_SPAN / (PROJECTION_ROUNDS + 1)
  let projection = await project(renderDoc, plan, settings, limits, {
    signal,
    onProgress,
    pageCount,
    bytesSoFar: originalBytes,
    baseFraction: SAMPLE_BASE,
    span: sampleSpan,
  })
  throwIfAborted(signal)

  // Correct the settings against what the samples actually weighed, before
  // rendering anything for real. Calibration works from one page and a guess at
  // bytes per pixel; the samples are measurement. Skipping this step is what
  // made the first pass overshoot and the whole document get rendered twice.
  const projectionTarget = maxBytes * STRUCTURE_HEADROOM
  for (let round = 1; round <= PROJECTION_ROUNDS && projection.bytes > projectionTarget; round++) {
    const overshoot = projection.bytes / projectionTarget
    const next = shrink(settings, overshoot, limits)
    // Both levers are already at their floor: no round will help.
    if (next.scale === settings.scale && next.quality === settings.quality) break
    settings = next
    projection = await project(renderDoc, plan, settings, limits, {
      signal,
      onProgress,
      pageCount,
      bytesSoFar: originalBytes,
      baseFraction: SAMPLE_BASE + sampleSpan * round,
      span: sampleSpan,
    })
    throwIfAborted(signal)
  }

  if (projection.bytes >= fallback.byteLength) {
    return {
      bytes: fallback,
      metTarget: fallback.byteLength <= maxBytes,
      originalBytes,
      finalBytes: fallback.byteLength,
      method: fallbackMethod,
      rasterisedPages: 0,
      copiedPages: pageCount,
      notWorthRasterising: true,
    }
  }

  // The saving is real but slight, and the work is long. Say so now rather than
  // discovering it together forty minutes from here.
  const projectedMs = projection.msPerPage * plan.length
  const saving = 1 - projection.bytes / fallback.byteLength
  if (saving < WORTHWHILE_SAVING && projectedMs > LONG_RUN_MS) {
    return {
      bytes: fallback,
      metTarget: fallback.byteLength <= maxBytes,
      originalBytes,
      finalBytes: fallback.byteLength,
      method: fallbackMethod,
      rasterisedPages: 0,
      copiedPages: pageCount,
      notWorthTheTime: {
        minutes: Math.max(1, Math.round(projectedMs / 60000)),
        savingPercent: Math.max(1, Math.round(saving * 100)),
      },
    }
  }

  try {
    let best = await assemble(renderDoc, srcDoc, plan, settings, limits, {
      onProgress,
      signal,
      pageCount,
      phase: 'compressing',
      baseFraction: ASSEMBLE_BASE,
      span: ASSEMBLE_SPAN,
      priorMsPerPage: projection.msPerPage,
    })
    throwIfAborted(signal)

    // A second pass means rendering every page again, so it has to earn its
    // place: only when the miss is big enough to matter and the settings still
    // have somewhere to go. And if it fails or is cancelled, the first pass is
    // still a real result — losing it to an error would be absurd.
    const overshoot = best.byteLength / maxBytes
    if (overshoot > REFINE_THRESHOLD) {
      const corrected = shrink(settings, overshoot, limits)
      if (corrected.scale !== settings.scale || corrected.quality !== settings.quality) {
        try {
          const retry = await assemble(renderDoc, srcDoc, plan, corrected, limits, {
            onProgress,
            signal,
            pageCount,
            phase: 'refining',
            baseFraction: REFINE_BASE,
            span: REFINE_SPAN,
            priorMsPerPage: projection.msPerPage,
          })
          if (retry.byteLength < best.byteLength) best = retry
        } catch (e) {
          if (isCancellation(e) || e instanceof PdfNeedsDomError) throw e
          // Keep the first pass rather than failing the whole job.
        }
      }
    }

    // Rasterising a mostly-textual document can inflate it. If that happened,
    // hand back whatever was actually smallest.
    if (best.byteLength >= fallback.byteLength) {
      return {
        bytes: fallback,
        metTarget: fallback.byteLength <= maxBytes,
        originalBytes,
        finalBytes: fallback.byteLength,
        method: fallbackMethod,
        rasterisedPages: 0,
        copiedPages: pageCount,
      }
    }

    return {
      bytes: best,
      metTarget: best.byteLength <= maxBytes,
      originalBytes,
      finalBytes: best.byteLength,
      method: 'rasterised',
      rasterisedPages: rasterCount,
      copiedPages: pageCount - rasterCount,
      stoppedForLegibility: limits.text && best.byteLength > maxBytes,
    }
  } catch (e) {
    throw classifyFailure(e, lastPage ? `Failed on page ${lastPage} of ${pageCount}` : 'Could not compress this PDF')
  } finally {
    await renderDoc.destroy().catch(() => {})
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Backs both levers off by the amount we are over budget.
 *
 * JPEG size tracks pixel count, which scales with the square of the render
 * scale, so the overshoot is split between resolution and quality rather than
 * spent entirely on either. Taking it all out of quality alone smears the text
 * on a scan; taking it all out of scale alone blurs it.
 */
function shrink(
  settings: { scale: number; quality: number },
  overshoot: number,
  limits: RenderLimits,
): { scale: number; quality: number } {
  const factor = Math.sqrt(overshoot)
  // On text, resolution does not move. Every correction comes out of quality,
  // and stops at the floor rather than dissolving the letters.
  const scale = limits.text
    ? settings.scale
    : clamp(settings.scale / Math.sqrt(factor), limits.minScale, limits.maxScale)
  return {
    scale,
    quality: clamp(settings.quality / factor, limits.minQuality, MAX_QUALITY),
  }
}

/**
 * A page with no image operators is text and vector art. Rasterising it would
 * make it blurry and usually larger, so it gets copied across as-is — but only
 * when we hold a pdf-lib document able to copy it.
 */
async function buildPagePlan(
  doc: pdfjsLib.PDFDocumentProxy,
  pageCount: number,
  canCopyPages: boolean,
  ctx: {
    onProgress?: (p: CompressProgress) => void
    signal?: AbortSignal
    originalBytes: number
  },
): Promise<PagePlan[]> {
  const all = Array.from({ length: pageCount }, (_, i) => ({ index: i + 1, rasterise: true }))
  if (!canCopyPages || pageCount > PLAN_MAX_PAGES) return all

  const imageOps = new Set<number>([
    pdfjsLib.OPS.paintImageXObject,
    pdfjsLib.OPS.paintImageXObjectRepeat,
    pdfjsLib.OPS.paintInlineImageXObject,
    pdfjsLib.OPS.paintInlineImageXObjectGroup,
    pdfjsLib.OPS.paintImageMaskXObject,
    pdfjsLib.OPS.paintImageMaskXObjectGroup,
    pdfjsLib.OPS.paintImageMaskXObjectRepeat,
  ])

  const plan: PagePlan[] = []
  for (let i = 1; i <= pageCount; i++) {
    throwIfAborted(ctx.signal)
    let hasImage = false
    try {
      const page = await doc.getPage(i)
      const ops = await page.getOperatorList()
      hasImage = ops.fnArray.some((fn) => imageOps.has(fn))
      page.cleanup()
    } catch {
      hasImage = true
    }
    plan.push({ index: i, rasterise: hasImage })
    ctx.onProgress?.({
      phase: 'analysing',
      fraction: PLAN_BASE + PLAN_SPAN * (i / pageCount),
      page: i,
      pageCount,
      bytesSoFar: ctx.originalBytes,
    })
    if (i % 5 === 0) await yieldToUi()
  }

  if (!plan.some((p) => p.rasterise)) return all
  return plan
}

/**
 * Keeps a single page's canvas within a sane allocation.
 *
 * The floor wins over the cap: on a text page an unreadable render is worth
 * nothing, so it is better to allocate the memory than to save it.
 */
function cappedScale(page: pdfjsLib.PDFPageProxy, desired: number, limits: RenderLimits): number {
  const viewport = page.getViewport({ scale: desired })
  const pixels = viewport.width * viewport.height
  if (pixels <= limits.maxPixels) return desired
  return Math.max(limits.minScale, desired * Math.sqrt(limits.maxPixels / pixels))
}

/**
 * Decides whether a rendered page is a scan of text rather than a photograph.
 *
 * Scanned text is bimodal: mostly paper, a little ink, and almost nothing in
 * between. A photograph fills that middle. Sampling every fourth pixel is more
 * than enough to tell them apart.
 */
function looksLikeText(canvas: Surface): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.width === 0 || canvas.height === 0) return false
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  let light = 0
  let dark = 0
  let mid = 0
  for (let i = 0; i < data.length; i += 16) {
    const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255
    if (luma > 0.82) light++
    else if (luma < 0.35) dark++
    else mid++
  }

  const total = light + dark + mid
  if (total === 0) return false
  // Mostly paper, some ink, little in between.
  return light / total > 0.55 && dark / total > 0.004 && mid / total < 0.22
}

/**
 * Works out how to render this document: first what kind of pages it has, then
 * the resolution and quality those pages can afford.
 *
 * The classification has to come first and has to be its own render. Deciding
 * the scale from a byte budget and only then looking at the result is how a
 * page of text ended up rendered at 32 DPI: the budget said it could afford
 * seventy thousand pixels for a whole A4 sheet, and nothing in the process ever
 * asked whether the words were still words.
 */
async function calibrate(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  budgetPerPage: number,
  signal?: AbortSignal,
): Promise<{ scale: number; quality: number; limits: RenderLimits }> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })

  // Classify at a fixed, readable resolution. Judging the page from a render
  // the budget already starved would tell us nothing.
  const probe = await renderPageToCanvas(page, cappedScale(page, 1, PHOTO_LIMITS))
  const limits = looksLikeText(probe) ? TEXT_LIMITS : PHOTO_LIMITS
  releaseSurface(probe)
  throwIfAborted(signal)

  // Start from the resolution the per-page budget can afford, but never below
  // the floor this kind of page needs to stay meaningful.
  const affordablePixels = Math.min(limits.maxPixels, budgetPerPage / BYTES_PER_PIXEL_GUESS)
  const wanted = clamp(
    Math.sqrt(affordablePixels / (viewport.width * viewport.height)),
    limits.minScale,
    limits.maxScale,
  )
  const scale = cappedScale(page, wanted, limits)
  const canvas = await renderPageToCanvas(page, scale)
  page.cleanup()
  throwIfAborted(signal)

  const high = (await encodeSurface(canvas, 'image/jpeg', 0.75)).size
  const low = (await encodeSurface(canvas, 'image/jpeg', 0.4)).size
  releaseSurface(canvas)

  if (high <= budgetPerPage) return { scale, quality: MAX_QUALITY, limits }

  if (low > budgetPerPage) {
    // Even low quality is too heavy here. On a photograph, shed pixels: JPEG
    // size tracks pixel count, which scales with the square of `scale`. On
    // text there are no pixels to spare, so hold the resolution, take the
    // lowest quality that still keeps strokes clean, and let the result come
    // out over the target — the caller says so plainly rather than pretending.
    if (limits.text) return { scale, quality: limits.minQuality, limits }
    const shrunk = clamp(scale * Math.sqrt(budgetPerPage / low), limits.minScale, limits.maxScale)
    return { scale: shrunk, quality: 0.45, limits }
  }

  const t = (budgetPerPage - low) / (high - low)
  return { scale, quality: clamp(0.4 + t * (0.75 - 0.4), limits.minQuality, MAX_QUALITY), limits }
}

async function assemble(
  renderDoc: pdfjsLib.PDFDocumentProxy,
  srcDoc: PDFDocument | null,
  plan: PagePlan[],
  settings: { scale: number; quality: number },
  limits: RenderLimits,
  ctx: {
    onProgress?: (p: CompressProgress) => void
    signal?: AbortSignal
    pageCount: number
    phase: 'compressing' | 'refining'
    baseFraction: number
    span: number
    priorMsPerPage?: number
  },
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  let bytesSoFar = 0
  const startedAt = performance.now()
  // One canvas for the whole document, resized per page.
  const scratch = createSurface(1, 1)

  for (let i = 0; i < plan.length; i++) {
    throwIfAborted(ctx.signal)
    const entry = plan[i]

    if (entry.rasterise || !srcDoc) {
      const page = await renderDoc.getPage(entry.index)
      const canvas = await renderPageToCanvas(page, cappedScale(page, settings.scale, limits), scratch)
      const jpeg = await encodeSurface(canvas, 'image/jpeg', settings.quality)

      const jpegBytes = new Uint8Array(await jpeg.arrayBuffer())
      bytesSoFar += jpegBytes.byteLength
      const embedded = await out.embedJpg(jpegBytes)
      const viewport = page.getViewport({ scale: 1 })
      const outPage = out.addPage([viewport.width, viewport.height])
      outPage.drawImage(embedded, { x: 0, y: 0, width: viewport.width, height: viewport.height })
      // Release the parsed page before moving on; without this a long document
      // accumulates every page it has touched.
      page.cleanup()
    } else {
      const [copied] = await out.copyPages(srcDoc, [entry.index - 1])
      out.addPage(copied)
    }

    const done = i + 1
    const elapsed = (performance.now() - startedAt) / 1000
    // Use the measured rate once there is one, otherwise the rate from the
    // sampling pass, so the estimate is honest from the very first page.
    const msPerPage = done >= 2 ? (elapsed * 1000) / done : ctx.priorMsPerPage
    const etaSeconds = msPerPage ? Math.round((msPerPage * (plan.length - done)) / 1000) : undefined

    ctx.onProgress?.({
      phase: ctx.phase,
      fraction: ctx.baseFraction + ctx.span * (done / plan.length),
      page: done,
      pageCount: ctx.pageCount,
      bytesSoFar,
      etaSeconds,
    })
    await yieldToUi()
  }

  releaseSurface(scratch)
  return out.save({ useObjectStreams: true })
}

/**
 * Renders a few pages spread through the document to find out what
 * rasterisation would actually cost, in both bytes and time, before doing it
 * for real.
 */
async function project(
  doc: pdfjsLib.PDFDocumentProxy,
  plan: PagePlan[],
  settings: { scale: number; quality: number },
  limits: RenderLimits,
  ctx: {
    signal?: AbortSignal
    onProgress?: (p: CompressProgress) => void
    pageCount: number
    bytesSoFar: number
    baseFraction: number
    span: number
  },
): Promise<{ bytes: number; msPerPage: number }> {
  const rasterPages = plan.filter((p) => p.rasterise)
  const step = Math.max(1, Math.floor(rasterPages.length / SAMPLE_PAGES))
  const samples = rasterPages.filter((_, i) => i % step === 0).slice(0, SAMPLE_PAGES)

  let totalBytes = 0
  const startedAt = performance.now()
  const scratch = createSurface(1, 1)
  for (const [i, entry] of samples.entries()) {
    throwIfAborted(ctx.signal)
    const page = await doc.getPage(entry.index)
    const canvas = await renderPageToCanvas(page, cappedScale(page, settings.scale, limits), scratch)
    const jpeg = await encodeSurface(canvas, 'image/jpeg', settings.quality)
    page.cleanup()
    totalBytes += jpeg.size
    ctx.onProgress?.({
      phase: 'analysing',
      fraction: ctx.baseFraction + ctx.span * ((i + 1) / samples.length),
      page: 0,
      pageCount: ctx.pageCount,
      bytesSoFar: ctx.bytesSoFar,
    })
    await yieldToUi()
  }
  const elapsed = performance.now() - startedAt
  releaseSurface(scratch)

  const perPage = totalBytes / Math.max(1, samples.length)
  // Copied pages keep their original weight, which we cannot see from here, so
  // this projection deliberately covers the rasterised pages plus overhead.
  const projectedBytes = Math.round(perPage * rasterPages.length * 1.04)
  return { bytes: projectedBytes, msPerPage: elapsed / Math.max(1, samples.length) }
}

