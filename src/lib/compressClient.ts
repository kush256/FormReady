import { compressPdf, type CompressPdfResult, type CompressProgress } from './pdf'
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
}

function cancelled(): Error {
  const aborted = new Error('Compression was cancelled.')
  aborted.name = 'AbortError'
  return aborted
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
      cancel: () => controller.abort(),
      result: compressPdf(bytes, maxBytes, { signal: controller.signal, onProgress }),
    }
  }

  const worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' })

  // Set only if the job comes back for the main thread, which is where cancel
  // has to point from then on.
  let onMainThread: AbortController | null = null
  let stopped = false

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
        case 'cancelled':
          reject(cancelled())
          worker.terminate()
          return
        case 'needsDom': {
          // A transfer function or a soft mask the worker cannot apply. Rather
          // than hand back a page that renders wrong, start again here, where
          // pdf.js has a document and builds its filters properly. It costs the
          // work done so far and the job now stalls if the app is backgrounded
          // — but it is the only way this document comes out right, and almost
          // none of them need it.
          worker.terminate()
          if (stopped) {
            reject(cancelled())
            return
          }
          onMainThread = new AbortController()
          compressPdf(new Uint8Array(message.bytes), maxBytes, {
            signal: onMainThread.signal,
            onProgress,
          }).then(resolve, reject)
          return
        }
        case 'failed': {
          // The screen reads `.message`, whichever of PdfTooLargeError,
          // PdfPasswordError, PdfDamagedError or the generic case this was —
          // only the text has to survive the crossing, not the class.
          const failure = new Error(message.message)
          failure.name = message.name
          reject(failure)
          worker.terminate()
          return
        }
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
    cancel: () => {
      stopped = true
      if (onMainThread) onMainThread.abort()
      else worker.postMessage({ kind: 'cancel' } satisfies ToWorker)
    },
    result,
  }
}
