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
}

export interface CompressProgress {
  phase: 'lossless' | 'analysing' | 'compressing'
  fraction: number
  page: number
  pageCount: number
  /** Running output size, so the UI can count down towards the target. */
  bytesSoFar: number
}

export interface CompressOptions {
  onProgress?: (progress: CompressProgress) => void
  signal?: AbortSignal
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
const MIN_SCALE = 0.5
const MAX_SCALE = 1.6

type PagePlan = { index: number; rasterise: boolean }

/**
 * Compresses a PDF to fit under maxBytes, in a single render pass.
 *
 * Tries a lossless re-save first, then rasterises only the pages that
 * actually carry images — text-only pages are copied across untouched, so
 * they stay sharp and selectable. Quality is calibrated on one sample page
 * rather than by re-rendering the whole document at eight different settings.
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

  // 1. Lossless: re-save with object streams. Costs milliseconds and often
  //    reclaims enough on its own, with no quality loss at all.
  onProgress?.({ phase: 'lossless', fraction: 0.05, page: 0, pageCount: 0, bytesSoFar: originalBytes })
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const pageCount = srcDoc.getPageCount()
  const lossless = await srcDoc.save({ useObjectStreams: true })
  throwIfAborted(signal)

  if (lossless.byteLength <= maxBytes) {
    return {
      bytes: lossless,
      metTarget: true,
      originalBytes,
      finalBytes: lossless.byteLength,
      method: 'lossless',
      rasterisedPages: 0,
      copiedPages: pageCount,
    }
  }

  // 2. Work out which pages actually need rasterising.
  onProgress?.({ phase: 'analysing', fraction: 0.1, page: 0, pageCount, bytesSoFar: lossless.byteLength })
  const renderDoc = await loadPdfJsDoc(bytes)
  const plan = await buildPagePlan(renderDoc, pageCount, signal)
  const rasterCount = plan.filter((p) => p.rasterise).length

  // 3. Calibrate quality and scale on one representative page.
  const budgetPerPage = Math.max(4096, (maxBytes * STRUCTURE_HEADROOM) / Math.max(1, rasterCount))
  const samplePage = plan.find((p) => p.rasterise)!.index
  const settings = await calibrate(renderDoc, samplePage, budgetPerPage, signal)
  throwIfAborted(signal)

  // 4. Single render pass. One corrective pass only if we overshoot.
  let best = await assemble(renderDoc, srcDoc, plan, settings, {
    onProgress,
    signal,
    pageCount,
    baseFraction: 0.15,
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
      baseFraction: 0.55,
    })
    if (retry.byteLength < best.byteLength) best = retry
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * A page with no image operators is text and vector art. Rasterising it would
 * make it blurry and usually larger, so it gets copied across as-is.
 */
async function buildPagePlan(
  doc: pdfjsLib.PDFDocumentProxy,
  pageCount: number,
  signal?: AbortSignal,
): Promise<PagePlan[]> {
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
    throwIfAborted(signal)
    let hasImage = false
    try {
      const page = await doc.getPage(i)
      const ops = await page.getOperatorList()
      hasImage = ops.fnArray.some((fn) => imageOps.has(fn))
    } catch {
      // If a page won't parse, rasterising is the safer choice.
      hasImage = true
    }
    plan.push({ index: i, rasterise: hasImage })
  }

  // A text-only document that is still over target means the weight is in
  // fonts or metadata, so rasterising everything is the only lever left.
  if (!plan.some((p) => p.rasterise)) {
    return plan.map((p) => ({ ...p, rasterise: true }))
  }
  return plan
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
  const scale = 1.4
  const page = await doc.getPage(pageNumber)
  const canvas = await renderPageToCanvas(page, scale)
  throwIfAborted(signal)

  const high = (await canvasToBlob(canvas, 'image/jpeg', 0.75)).size
  const low = (await canvasToBlob(canvas, 'image/jpeg', 0.4)).size
  releaseCanvas(canvas)

  if (high <= budgetPerPage) {
    return { scale, quality: MAX_QUALITY }
  }

  if (low > budgetPerPage) {
    // Even low quality is too heavy at this resolution, so shed pixels.
    // JPEG size tracks pixel count, which scales with the square of `scale`.
    const shrunk = clamp(scale * Math.sqrt(budgetPerPage / low), MIN_SCALE, MAX_SCALE)
    return { scale: shrunk, quality: 0.45 }
  }

  // Interpolate between the two measured points.
  const t = (budgetPerPage - low) / (high - low)
  return { scale, quality: clamp(0.4 + t * (0.75 - 0.4), MIN_QUALITY, MAX_QUALITY) }
}

async function assemble(
  renderDoc: pdfjsLib.PDFDocumentProxy,
  srcDoc: PDFDocument,
  plan: PagePlan[],
  settings: { scale: number; quality: number },
  ctx: {
    onProgress?: (p: CompressProgress) => void
    signal?: AbortSignal
    pageCount: number
    baseFraction: number
  },
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  let bytesSoFar = 0
  const span = 0.4

  for (let i = 0; i < plan.length; i++) {
    throwIfAborted(ctx.signal)
    const entry = plan[i]

    if (entry.rasterise) {
      const page = await renderDoc.getPage(entry.index)
      const canvas = await renderPageToCanvas(page, settings.scale)
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', settings.quality)
      releaseCanvas(canvas)

      const jpegBytes = new Uint8Array(await jpeg.arrayBuffer())
      bytesSoFar += jpegBytes.byteLength
      const embedded = await out.embedJpg(jpegBytes)
      const viewport = page.getViewport({ scale: 1 })
      const outPage = out.addPage([viewport.width, viewport.height])
      outPage.drawImage(embedded, { x: 0, y: 0, width: viewport.width, height: viewport.height })
    } else {
      const [copied] = await out.copyPages(srcDoc, [entry.index - 1])
      out.addPage(copied)
    }

    ctx.onProgress?.({
      phase: 'compressing',
      fraction: ctx.baseFraction + span * ((i + 1) / plan.length),
      page: i + 1,
      pageCount: ctx.pageCount,
      bytesSoFar,
    })
    await yieldToUi()
  }

  return out.save({ useObjectStreams: true })
}

/** Frees the backing bitmap immediately rather than waiting for GC. */
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}
