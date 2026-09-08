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

export interface CompressPdfResult {
  bytes: Uint8Array
  metTarget: boolean
  originalBytes: number
  finalBytes: number
}

/**
 * Compresses a PDF to fit under maxBytes by rasterizing each page to a JPEG
 * at decreasing quality/resolution and rebuilding the document. This is the
 * standard on-device approach for guaranteed size targets without a server,
 * and works well for scanned/photo-heavy PDFs; text stops being selectable
 * on pages that get rasterized.
 */
export async function compressPdf(
  bytes: Uint8Array,
  maxBytes: number,
  onProgress?: (fraction: number) => void,
): Promise<CompressPdfResult> {
  const originalBytes = bytes.byteLength
  if (originalBytes <= maxBytes) {
    return { bytes, metTarget: true, originalBytes, finalBytes: originalBytes }
  }

  const attempts: Array<{ scale: number; quality: number }> = [
    { scale: 1.5, quality: 0.75 },
    { scale: 1.5, quality: 0.55 },
    { scale: 1.2, quality: 0.5 },
    { scale: 1.0, quality: 0.45 },
    { scale: 0.85, quality: 0.4 },
    { scale: 0.7, quality: 0.35 },
    { scale: 0.55, quality: 0.3 },
    { scale: 0.4, quality: 0.28 },
  ]

  let best: Uint8Array | null = null
  for (let i = 0; i < attempts.length; i++) {
    const { scale, quality } = attempts[i]
    const built = await buildRasterizedPdf(bytes, scale, quality)
    onProgress?.((i + 1) / attempts.length)
    if (!best || built.byteLength < best.byteLength) best = built
    if (built.byteLength <= maxBytes) {
      return { bytes: built, metTarget: true, originalBytes, finalBytes: built.byteLength }
    }
  }

  return { bytes: best!, metTarget: false, originalBytes, finalBytes: best!.byteLength }
}

async function buildRasterizedPdf(bytes: Uint8Array, scale: number, quality: number): Promise<Uint8Array> {
  const doc = await loadPdfJsDoc(bytes)
  const out = await PDFDocument.create()
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const canvas = await renderPageToCanvas(page, scale)
    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality)
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
    const embedded = await out.embedJpg(jpegBytes)
    const baseViewport = page.getViewport({ scale: 1 })
    const pdfPage = out.addPage([baseViewport.width, baseViewport.height])
    pdfPage.drawImage(embedded, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height })
  }
  return out.save()
}
