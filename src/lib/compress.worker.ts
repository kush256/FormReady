/// <reference lib="webworker" />
import {
  compressPdf,
  isCancellation,
  PdfNeedsDomError,
  type CompressPdfResult,
  type CompressProgress,
} from './pdf'

/**
 * Compression, off the main thread.
 *
 * It lives here for two reasons, and the first is the bug it fixes: on the main
 * thread the job yielded with a timer once a page, and Chromium throttles a
 * hidden page's timers to one a second and then one a minute, so leaving the
 * app all but stopped the work. A worker needs no yields at all — it has no
 * interface to keep painting — so the loop runs at full speed whether or not
 * anyone is looking at it. The second reason is that the phone is then free to
 * draw the interface while this works.
 *
 * It cannot outlive the process, though. Android freezes a backgrounded app
 * within seconds unless something holds it open, which is what the foreground
 * service behind `background.ts` is for.
 */

/** Everything the screen needs except the bytes, which travel separately. */
export type CompressSummary = Omit<CompressPdfResult, 'bytes'>

export type ToWorker = { kind: 'start'; bytes: ArrayBuffer; maxBytes: number } | { kind: 'cancel' }

export type FromWorker =
  | { kind: 'progress'; progress: CompressProgress }
  | { kind: 'done'; bytes: ArrayBuffer; summary: CompressSummary }
  | { kind: 'cancelled' }
  // This document uses a transfer function or a soft mask, which needs a
  // document to render faithfully and so cannot be finished here. The input is
  // handed back with it so the client can start again on the main thread
  // without having kept a second copy of the file alive throughout.
  | { kind: 'needsDom'; bytes: ArrayBuffer }
  // The name of whichever error class pdf.ts raised — PdfTooLargeError,
  // PdfPasswordError, PdfDamagedError, or the generic PdfCompressionError —
  // so the screen can rebuild the right one instead of collapsing every
  // failure into a single flag.
  | { kind: 'failed'; message: string; name: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

let controller: AbortController | null = null

scope.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data
  if (message.kind === 'cancel') {
    controller?.abort()
    return
  }

  controller = new AbortController()
  // Kept, rather than passed straight in: `compressPdf` copies before pdf.js
  // detaches anything, so this stays valid and can be handed back if the job
  // turns out to need the main thread.
  const input = new Uint8Array(message.bytes)
  try {
    const { bytes, ...summary } = await compressPdf(
      input,
      message.maxBytes,
      {
        signal: controller.signal,
        onProgress: (progress: CompressProgress) =>
          scope.postMessage({ kind: 'progress', progress } satisfies FromWorker),
      },
    )
    // Handed over rather than copied: a compressed textbook is still tens of
    // megabytes, and copying it back would undo the point.
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    scope.postMessage({ kind: 'done', bytes: buffer, summary } satisfies FromWorker, [buffer])
  } catch (e) {
    if (isCancellation(e)) {
      scope.postMessage({ kind: 'cancelled' } satisfies FromWorker)
      return
    }
    if (e instanceof PdfNeedsDomError) {
      const back = input.buffer as ArrayBuffer
      scope.postMessage({ kind: 'needsDom', bytes: back } satisfies FromWorker, [back])
      return
    }
    scope.postMessage({
      kind: 'failed',
      message: e instanceof Error ? e.message : 'Compression failed.',
      name: e instanceof Error ? e.name : 'Error',
    } satisfies FromWorker)
  } finally {
    controller = null
  }
}
