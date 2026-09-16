import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { SpecChip } from '../components/SpecChip'
import { SizeField } from '../components/SizeField'
import { Notice } from '../components/Notice'
import { EmptyState } from '../components/EmptyState'
import { CompressIllustration } from '../components/Illustrations'
import { pickPdfs } from '../lib/picker'
import { getPageCount, isCancellation, type CompressProgress, type CompressPdfResult } from '../lib/pdf'
import { runCompression } from '../lib/compressClient'
import { askToNotify, keepWorking, notifyDone, stopKeepingWorking } from '../lib/background'
import { formatBytes } from '../lib/format'
import { bytesToBlob } from '../lib/bytes'

type Step = 'pick' | 'setup' | 'working' | 'result'

const PHASE_LABEL: Record<CompressProgress['phase'], string> = {
  lossless: 'Trying lossless first',
  analysing: 'Checking pages',
  compressing: 'Compressing',
  refining: 'Fine-tuning to hit your limit',
}

const MIN_TARGET_BYTES = 5 * 1024

/**
 * What a page of scanned text costs, and therefore when to say so.
 *
 * Measured on an A4 scan: 111 KB at the compressor's 120 DPI floor and lowest
 * usable quality, 203 KB at 120 DPI and full quality, 297 KB at 150 DPI.
 * Against that, a reported 224-page book squeezed to 98 KB a page came back
 * readable but visibly soft — which is the line these sit either side of.
 *
 * They describe scans, which is most of what this app is pointed at. A PDF of
 * photographs survives far less room, so the wording says so rather than
 * pretending one number fits both.
 */
const SOFT_PAGE_BYTES = 100 * 1024
const HARSH_PAGE_BYTES = 45 * 1024
const COMFORTABLE_PAGE_BYTES = 150 * 1024

function formatEta(seconds: number): string {
  if (seconds < 5) return 'almost done'
  if (seconds < 60) return `about ${seconds}s left`
  const minutes = Math.round(seconds / 60)
  return `about ${minutes} min left`
}

export function CompressPdf() {
  // Set when opened from an exam: the form's name, and the limit it states
  // where the user recorded one.
  const opened = (useLocation().state ?? null) as { context?: string; targetBytes?: number } | null
  const context = opened?.context
  const askedBytes = opened?.targetBytes
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState<File | null>(null)
  // Read as soon as a file is picked, because a limit only means anything
  // spread across the pages it has to cover: 5 MB is generous for four pages
  // and starvation for four hundred.
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [targetBytes, setTargetBytes] = useState(500 * 1024)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<CompressProgress | null>(null)
  const [result, setResult] = useState<CompressPdfResult | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  // Everything the user could get wrong, caught before any work happens.
  const issue = useMemo(() => {
    if (!file) return null
    if (targetBytes < MIN_TARGET_BYTES) {
      return {
        title: 'That target is too small',
        detail: `A PDF needs at least ${formatBytes(MIN_TARGET_BYTES)} to hold anything readable. Set a larger limit.`,
        fixes: [{ label: 'Use 100 KB', bytes: 100 * 1024 }],
      }
    }
    if (targetBytes >= file.size) {
      return {
        title: 'This PDF is already that small',
        detail: `${file.name} is ${formatBytes(file.size)}, which is under your ${formatBytes(targetBytes)} limit. Compressing it would only lose quality.`,
        fixes: [
          { label: `Use ${formatBytes(Math.round(file.size / 2))}`, bytes: Math.round(file.size / 2) },
        ],
      }
    }
    return null
  }, [file, targetBytes])

  // Not an error, so it never blocks the button: a squeezed document is still
  // often exactly what the user wants. It just should not be a surprise.
  const warning = useMemo(() => {
    if (!file || issue || !pageCount) return null
    const perPage = targetBytes / pageCount
    if (perPage >= SOFT_PAGE_BYTES) return null
    const roomy = Math.min(file.size, Math.round(COMFORTABLE_PAGE_BYTES * pageCount))
    return {
      perPage: Math.round(perPage),
      severe: perPage < HARSH_PAGE_BYTES,
      roomy: roomy > targetBytes ? roomy : null,
    }
  }, [file, issue, pageCount, targetBytes])

  // Held in a const so the button's handler can close over a plain number.
  const roomyTarget = warning?.roomy ?? null

  async function pick() {
    const files = await pickPdfs(false)
    if (!files.length) return
    setError(null)
    const picked = files[0]
    setFile(picked)
    // Not awaited: the size field should be usable straight away, and the
    // warning that needs this can appear a moment later.
    setPageCount(null)
    void getPageCount(picked)
      .then(setPageCount)
      .catch(() => setPageCount(null))
    // The limit the form states, when we were told one and the file is over
    // it. Otherwise half the original: a sane starting point that is never
    // immediately invalid.
    setTargetBytes(
      askedBytes && askedBytes < picked.size
        ? Math.max(MIN_TARGET_BYTES, askedBytes)
        : Math.max(MIN_TARGET_BYTES, Math.round(picked.size / 2)),
    )
    setStep('setup')
  }

  async function process() {
    if (!file || issue) return
    setProgress(null)
    setStep('working')
    // Asked here rather than on first launch, so the request arrives with an
    // obvious reason attached to it.
    void askToNotify()
    const name = file.name
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const run = runCompression(bytes, targetBytes, (update) => {
        setProgress(update)
        // The ongoing notification is the price of being allowed to keep
        // working off screen, so it carries the progress rather than nothing.
        void keepWorking('Compressing your PDF', name, Math.round(update.fraction * 100))
      })
      cancelRef.current = run.cancel
      void keepWorking('Compressing your PDF', name, 0)
      const outcome = await run.result
      setResult(outcome)
      setResultBlob(bytesToBlob(outcome.bytes, 'application/pdf'))
      setStep('result')
      void notifyDone('Your PDF is ready', `${name} is compressed and waiting in the app.`)
    } catch (e) {
      if (isCancellation(e)) {
        setStep('setup')
      } else {
        // The real cause, not a guess at one: PdfTooLargeError,
        // PdfPasswordError and PdfDamagedError all carry their own honest
        // message now, and anything else keeps whatever pdf.js or pdf-lib
        // actually said rather than being flattened into "too large".
        setError(e instanceof Error ? e.message : 'Could not compress this PDF.')
        setStep('setup')
      }
    } finally {
      cancelRef.current = null
      void stopKeepingWorking()
    }
  }

  function reset() {
    setFile(null)
    setPageCount(null)
    setResult(null)
    setResultBlob(null)
    setError(null)
    setProgress(null)
    setStep('pick')
  }

  const savedPercent =
    result && result.originalBytes > 0
      ? Math.max(0, Math.round((1 - result.finalBytes / result.originalBytes) * 100))
      : 0

  const progressDetail = (() => {
    if (!progress) return undefined
    const parts: string[] = []
    if (progress.pageCount > 0 && progress.page > 0) {
      parts.push(`Page ${progress.page} of ${progress.pageCount}`)
    }
    if (progress.etaSeconds !== undefined) parts.push(formatEta(progress.etaSeconds))
    return parts.join(' · ') || undefined
  })()

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader
        title="Compress PDF"
        subtitle={file ? (context ? `${context} · ${file.name}` : file.name) : context}
      />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm leading-relaxed text-[var(--danger)]">
            {error}
          </p>
        )}

        {step === 'pick' && (
          <EmptyState
            illustration={<CompressIllustration size={200} />}
            title="Reduce PDF size"
            description="Choose a PDF and the limit it has to fit under. Photo pages are re-encoded; text pages stay sharp."
            action={
              <Button fullWidth onClick={pick}>
                Select PDF
              </Button>
            }
          />
        )}

        {step === 'setup' && file && (
          <>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="truncate text-sm font-bold text-[var(--ink)]">{file.name}</p>
              <div className="mt-2">
                <SpecChip>{formatBytes(file.size)}</SpecChip>
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Maximum size
              </span>
              <div className="mt-1.5">
                <SizeField bytes={targetBytes} onChange={setTargetBytes} invalid={!!issue} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[100 * 1024, 500 * 1024, 1024 * 1024, 5 * 1024 * 1024].map((bytes) => (
                <button key={bytes} onClick={() => setTargetBytes(bytes)}>
                  <SpecChip state={targetBytes === bytes ? 'ok' : 'neutral'} icon={false}>
                    {formatBytes(bytes)}
                  </SpecChip>
                </button>
              ))}
            </div>

            {issue && (
              <Notice
                title={issue.title}
                actions={issue.fixes.map((fix) => ({
                  label: fix.label,
                  onClick: () => setTargetBytes(fix.bytes),
                }))}
              >
                {issue.detail}
              </Notice>
            )}

            {warning && (
              <Notice
                title={warning.severe ? 'Text will be hard to read' : 'Text will lose some sharpness'}
                actions={
                  roomyTarget === null
                    ? []
                    : [{ label: `Use ${formatBytes(roomyTarget)}`, onClick: () => setTargetBytes(roomyTarget) }]
                }
              >
                {formatBytes(warning.perPage)} a page across {pageCount} pages.{' '}
                {warning.severe
                  ? 'Scanned pages need more room than this to stay legible. Compress anyway if the limit is fixed.'
                  : 'Fine for photos, but letters on a scan will soften a little.'}
              </Notice>
            )}

            <p className="text-xs leading-relaxed text-[var(--ink-2)]">
              Pages carrying photos are re-encoded to hit the target. Text-only pages are left untouched, so they stay
              sharp and selectable.
            </p>

            <Button fullWidth disabled={!!issue} onClick={process}>
              Compress PDF
            </Button>
          </>
        )}

        {step === 'working' && (
          <ProgressPanel
            label={progress ? PHASE_LABEL[progress.phase] : 'Reading the file'}
            fraction={progress?.fraction}
            currentBytes={progress?.phase === 'compressing' ? progress.bytesSoFar : undefined}
            targetBytes={targetBytes}
            detail={progressDetail}
            onCancel={() => cancelRef.current?.()}
          />
        )}

        {step === 'result' && result && resultBlob && (
          <ResultView
            heading={
              result.metTarget
                ? 'Your PDF is ready'
                : result.notWorthTheTime
                  ? 'Not worth the wait'
                  : result.notWorthRasterising
                  ? "This PDF can't get smaller"
                  : 'Made as small as possible'
            }
            blob={resultBlob}
            filename={`compressed-${file?.name ?? 'document.pdf'}`}
            originalBytes={result.originalBytes}
            summary={savedPercent > 0 ? `${savedPercent}% smaller` : 'Compressed'}
            checks={[
              {
                label: result.metTarget ? `Under ${formatBytes(targetBytes)}` : `Target ${formatBytes(targetBytes)}`,
                ok: result.metTarget,
              },
              ...(result.copiedPages > 0
                ? [{ label: `${result.copiedPages} text pages kept sharp`, ok: true }]
                : []),
            ]}
            warning={
              result.metTarget
                ? undefined
                : result.notWorthTheTime
                  ? `Re-encoding these ${result.copiedPages} pages would have taken about ${result.notWorthTheTime.minutes} minutes on this phone and saved only ${result.notWorthTheTime.savingPercent}%, so it was left alone. This file is already stored efficiently. To get a real reduction, split it into fewer pages and compress those.`
                  : result.notWorthRasterising
                  ? `This PDF is mostly text and is already packed efficiently. Re-encoding its ${result.copiedPages} pages would have made it larger, not smaller, so it was left as it is. To get under ${formatBytes(targetBytes)}, split it into fewer pages instead.`
                  : result.stoppedForLegibility
                    ? `These pages are scans of text. Squeezing them under ${formatBytes(targetBytes)} would have meant dropping the resolution until the words blurred, so it stopped at ${formatBytes(result.finalBytes)} and kept them readable. To go smaller, split the document into fewer pages.`
                    : `This PDF couldn't go under ${formatBytes(targetBytes)} without becoming unreadable. Try a higher limit, or split it into fewer pages first.`
            }
            onStartOver={reset}
            startOverLabel="Another PDF"
          />
        )}

        {/*
          What the compressor actually chose. Four rounds of this went by with
          nothing on screen able to tell a document rendered at 120 DPI and
          quality 0.44 from one rendered at 175 and 0.82, so a result that came
          up short on someone's phone could only be guessed at.
        */}
        {step === 'result' && result && (
          <p className="text-center font-mono text-[10px] leading-relaxed text-[var(--ink-3)]">
            {result.method === 'rasterised' && result.dpi
              ? `${result.rasterisedPages} pages re-encoded at ${result.dpi} DPI, quality ${result.quality} · `
              : `${result.method} · `}
            {Math.round((result.finalBytes / targetBytes) * 100)}% of the {formatBytes(targetBytes)} limit
          </p>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
