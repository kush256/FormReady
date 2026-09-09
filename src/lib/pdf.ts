import { PDFDocument, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { canvasToBlob } from './image'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const PAGE_MARGIN = 24

export async function getPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

async function loadPdfJsDoc(bytes: Uint8Array) {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() })
  return loadingTask.promise
}

/** Renders every page of a PDF to a JPEG data URL thumbnail, for pickers/previews. */
export async function renderPageThumbnails(
  bytes: Uint8Array,
  maxWidth = 240,
): Promise<string[]> {
  const doc = await loadPdfJsDoc(bytes)
  const thumbs: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const scale = maxWidth / viewport.width
    const scaledViewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(scaledViewport.width)
    canvas.height = Math.ceil(scaledViewport.height)
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise
    thumbs.push(canvas.toDataURL('image/jpeg', 0.7))
  }
  return thumbs
}

async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  scale: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

export interface ImagePageInput {
  blob: Blob
  width: number
  height: number
}

/** Builds a single PDF with one image per page, fit to A4 with a margin, centered. */
export async function imagesToPdf(images: ImagePageInput[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  for (const image of images) {
    const bytes = new Uint8Array(await image.blob.arrayBuffer())
    const isPng = image.blob.type === 'image/png'
    const embedded = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)

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
  }
  return pdfDoc.save()
}

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const fileBytes of files) {
    const src = await PDFDocument.load(fileBytes, { ignoreEncryption: true })
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  return merged.save()
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
}

export interface CompressProgress {
  phase: 'lossless' | 'analysing' | 'compressing'
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

export class PdfTooLargeError extends Error {
  constructor() {
    super('This PDF is too large to compress on this device.')
    this.name = 'PdfTooLargeError'
  }
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
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Leaves headroom for the PDF's own structure on top of the page images. */
const STRUCTURE_HEADROOM = 0.92
const MIN_QUALITY = 0.3
const MAX_QUALITY = 0.82
const MIN_SCALE = 0.45
const MAX_SCALE = 1.6

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

/** Caps one rendered page, so an oversized page can't allocate a huge canvas. */
const MAX_PAGE_PIXELS = 1_600_000

/** Pages measured before deciding whether rasterising the rest is worth it. */
const SAMPLE_PAGES = 3

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
  const { onProgress, signal } = options
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
  let renderDoc: pdfjsLib.PDFDocumentProxy
  try {
    renderDoc = await loadPdfJsDoc(srcDoc ? bytes.slice() : bytes)
  } catch (e) {
    if (isCancellation(e)) throw e
    throw new PdfTooLargeError()
  }
  const pageCount = renderDoc.numPages

  onProgress?.({ phase: 'analysing', fraction: 0.06, page: 0, pageCount, bytesSoFar: originalBytes })
  const plan = await buildPagePlan(renderDoc, pageCount, Boolean(srcDoc), {
    onProgress,
    signal,
    originalBytes,
  })
  const rasterCount = plan.filter((p) => p.rasterise).length

  const budgetPerPage = Math.max(2048, (maxBytes * STRUCTURE_HEADROOM) / Math.max(1, rasterCount))
  const samplePage = plan.find((p) => p.rasterise)!.index
  const settings = await calibrate(renderDoc, samplePage, budgetPerPage, signal)
  throwIfAborted(signal)

  // Measure a handful of pages before committing to hundreds of them. A long
  // document that is mostly text gains nothing from rasterisation and can even
  // grow, and finding that out after forty minutes of work is unforgivable.
  const projection = await project(renderDoc, plan, settings, signal)
  throwIfAborted(signal)

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

  try {
    let best = await assemble(renderDoc, srcDoc, plan, settings, {
      onProgress,
      signal,
      pageCount,
      baseFraction: 0.15,
      span: 0.45,
      priorMsPerPage: projection.msPerPage,
    })
    throwIfAborted(signal)

    if (best.byteLength > maxBytes) {
      const overshoot = best.byteLength / maxBytes
      const corrected = {
        scale: clamp(settings.scale / Math.sqrt(overshoot), MIN_SCALE, MAX_SCALE),
        quality: clamp(settings.quality / overshoot, MIN_QUALITY, MAX_QUALITY),
      }
      const retry = await assemble(renderDoc, srcDoc, plan, corrected, {
        onProgress,
        signal,
        pageCount,
        baseFraction: 0.6,
        span: 0.38,
        priorMsPerPage: projection.msPerPage,
      })
      if (retry.byteLength < best.byteLength) best = retry
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
    }
  } catch (e) {
    if (isCancellation(e)) throw e
    throw new PdfTooLargeError()
  } finally {
    await renderDoc.destroy().catch(() => {})
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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
      fraction: 0.06 + 0.09 * (i / pageCount),
      page: i,
      pageCount,
      bytesSoFar: ctx.originalBytes,
    })
    if (i % 5 === 0) await yieldToUi()
  }

  if (!plan.some((p) => p.rasterise)) return all
  return plan
}

/** Keeps a single page's canvas within a sane allocation. */
function cappedScale(page: pdfjsLib.PDFPageProxy, desired: number): number {
  const viewport = page.getViewport({ scale: desired })
  const pixels = viewport.width * viewport.height
  if (pixels <= MAX_PAGE_PIXELS) return desired
  return Math.max(MIN_SCALE, desired * Math.sqrt(MAX_PAGE_PIXELS / pixels))
}

/**
 * Renders one page and encodes it at two qualities, then interpolates the
 * quality that lands on the per-page budget. Two encodes instead of eight
 * full-document rebuilds.
 */
async function calibrate(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  budgetPerPage: number,
  signal?: AbortSignal,
): Promise<{ scale: number; quality: number }> {
  const page = await doc.getPage(pageNumber)
  // Start from the resolution the per-page budget can actually afford, rather
  // than a fixed high scale that a long document can never sustain.
  const viewport = page.getViewport({ scale: 1 })
  const affordablePixels = Math.min(MAX_PAGE_PIXELS, budgetPerPage / BYTES_PER_PIXEL_GUESS)
  const wanted = clamp(Math.sqrt(affordablePixels / (viewport.width * viewport.height)), MIN_SCALE, MAX_SCALE)
  const scale = cappedScale(page, wanted)
  const canvas = await renderPageToCanvas(page, scale)
  page.cleanup()
  throwIfAborted(signal)

  const high = (await canvasToBlob(canvas, 'image/jpeg', 0.75)).size
  const low = (await canvasToBlob(canvas, 'image/jpeg', 0.4)).size
  releaseCanvas(canvas)

  if (high <= budgetPerPage) return { scale, quality: MAX_QUALITY }

  if (low > budgetPerPage) {
    // Even low quality is too heavy at this resolution, so shed pixels.
    // JPEG size tracks pixel count, which scales with the square of `scale`.
    const shrunk = clamp(scale * Math.sqrt(budgetPerPage / low), MIN_SCALE, MAX_SCALE)
    return { scale: shrunk, quality: 0.45 }
  }

  const t = (budgetPerPage - low) / (high - low)
  return { scale, quality: clamp(0.4 + t * (0.75 - 0.4), MIN_QUALITY, MAX_QUALITY) }
}

async function assemble(
  renderDoc: pdfjsLib.PDFDocumentProxy,
  srcDoc: PDFDocument | null,
  plan: PagePlan[],
  settings: { scale: number; quality: number },
  ctx: {
    onProgress?: (p: CompressProgress) => void
    signal?: AbortSignal
    pageCount: number
    baseFraction: number
    span: number
    priorMsPerPage?: number
  },
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  let bytesSoFar = 0
  const startedAt = performance.now()

  for (let i = 0; i < plan.length; i++) {
    throwIfAborted(ctx.signal)
    const entry = plan[i]

    if (entry.rasterise || !srcDoc) {
      const page = await renderDoc.getPage(entry.index)
      const canvas = await renderPageToCanvas(page, cappedScale(page, settings.scale))
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', settings.quality)
      releaseCanvas(canvas)

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
      phase: 'compressing',
      fraction: ctx.baseFraction + ctx.span * (done / plan.length),
      page: done,
      pageCount: ctx.pageCount,
      bytesSoFar,
      etaSeconds,
    })
    await yieldToUi()
  }

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
  signal?: AbortSignal,
): Promise<{ bytes: number; msPerPage: number }> {
  const rasterPages = plan.filter((p) => p.rasterise)
  const step = Math.max(1, Math.floor(rasterPages.length / SAMPLE_PAGES))
  const samples = rasterPages.filter((_, i) => i % step === 0).slice(0, SAMPLE_PAGES)

  let totalBytes = 0
  const startedAt = performance.now()
  for (const entry of samples) {
    throwIfAborted(signal)
    const page = await doc.getPage(entry.index)
    const canvas = await renderPageToCanvas(page, cappedScale(page, settings.scale))
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', settings.quality)
    releaseCanvas(canvas)
    page.cleanup()
    totalBytes += jpeg.size
    await yieldToUi()
  }
  const elapsed = performance.now() - startedAt

  const perPage = totalBytes / Math.max(1, samples.length)
  // Copied pages keep their original weight, which we cannot see from here, so
  // this projection deliberately covers the rasterised pages plus overhead.
  const projectedBytes = Math.round(perPage * rasterPages.length * 1.04)
  return { bytes: projectedBytes, msPerPage: elapsed / Math.max(1, samples.length) }
}

/** Frees the backing bitmap immediately rather than waiting for GC. */
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}
