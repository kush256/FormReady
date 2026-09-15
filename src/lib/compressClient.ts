import {
  compressPdf,
  PdfTooLargeError,
  type CompressPdfResult,
  type CompressProgress,
} from './pdf'
import { canUseOffscreen } from './surface'
import type { FromWorker, ToWorker } from './compress.worker'

/**
 * Runs a compression, in a worker where the device allows it.
 *
 * The worker is what keeps the job moving while the app is off screen, so it is
 * the path that matters; the direct call is kept for anything without
 * `OffscreenCanvas` or `Worker`, where the old behaviour is still better than
 * no behaviour. The screen sees the same result and the same progress either
 * way, and gets back a `cancel` it can call instead of an `AbortController`.
 */
export interface RunningCompression {
  result: Promise<CompressPdfResult>
  cancel: () => void
  /** False when this fell back to the main thread, where backgrounding stalls. */
  inWorker: boolean
}

function workerUsable(): boolean {
  return typeof Worker === 'function' && canUseOffscreen()
}

/**
 * @param bytes handed to the worker and not usable afterwards.
 */
export function runCompression(
  bytes: Uint8Array,
  maxBytes: number,
  onProgress: (progress: CompressProgress) => void,
): RunningCompression {
  if (!workerUsable()) {
    const controller = new AbortController()
    return {
      inWorker: false,
      cancel: () => controller.abort(),
      result: compressPdf(bytes, maxBytes, { signal: controller.signal, onProgress }),
    }
  }

  const worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' })

  const result = new Promise<CompressPdfResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data
      switch (message.kind) {
        case 'progress':
          onProgress(message.progress)
          return
        case 'done':
          resolve({ ...message.summary, bytes: new Uint8Array(message.bytes) })
          worker.terminate()
          return
        case 'cancelled': {
          const aborted = new Error('Compression was cancelled.')
          aborted.name = 'AbortError'
          reject(aborted)
          worker.terminate()
          return
        }
        case 'failed':
          reject(message.tooLarge ? new PdfTooLargeError() : new Error(message.message))
          worker.terminate()
      }
    }
    worker.onerror = (event) => {
      reject(new Error(event.message || 'Compression failed.'))
      worker.terminate()
    }
  })

  // Handed over, not copied. `bytes.slice()` here would have meant holding two
  // copies of a textbook at once, which is how this app ran a phone out of
  // memory before. The caller must not touch `bytes` afterwards — the buffer
  // belongs to the worker from this point.
  const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer)
  const start: ToWorker = { kind: 'start', bytes: buffer, maxBytes }
  worker.postMessage(start, [buffer])

  return {
    inWorker: true,
    cancel: () => worker.postMessage({ kind: 'cancel' } satisfies ToWorker),
    result,
  }
}
