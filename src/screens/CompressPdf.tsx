import { useRef, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { SpecChip } from '../components/SpecChip'
import { pickPdfs } from '../lib/picker'
import { compressPdf, isCancellation, type CompressProgress, type CompressPdfResult } from '../lib/pdf'
import { formatBytes, kbToBytes } from '../lib/format'
import { bytesToBlob } from '../lib/bytes'

type Step = 'pick' | 'setup' | 'working' | 'result'

const PHASE_LABEL: Record<CompressProgress['phase'], string> = {
  lossless: 'Trying lossless first',
  analysing: 'Checking pages',
  compressing: 'Compressing',
}

export function CompressPdf() {
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [maxKb, setMaxKb] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<CompressProgress | null>(null)
  const [result, setResult] = useState<CompressPdfResult | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function pick() {
    const files = await pickPdfs(false)
    if (!files.length) return
    setError(null)
    setFile(files[0])
    setStep('setup')
  }

  async function process() {
    if (!file) return
    const controller = new AbortController()
    abortRef.current = controller
    setProgress(null)
    setStep('working')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const outcome = await compressPdf(bytes, kbToBytes(maxKb), {
        signal: controller.signal,
        onProgress: setProgress,
      })
      setResult(outcome)
      setResultBlob(bytesToBlob(outcome.bytes, 'application/pdf'))
      setStep('result')
    } catch (e) {
      if (isCancellation(e)) {
        setStep('setup')
      } else {
        setError('Could not compress this PDF. It may be encrypted or damaged.')
        setStep('setup')
      }
    } finally {
      abortRef.current = null
    }
  }

  function reset() {
    setFile(null)
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

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Compress PDF" subtitle={file ? file.name : undefined} />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        {step === 'pick' && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Reduce PDF size</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">Choose a PDF and the limit it has to fit under.</p>
            </div>
            <button
              onClick={pick}
              className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-[var(--line-strong)] py-12 text-[var(--accent)] active:bg-[var(--surface-sunk)]"
            >
              <span className="text-sm font-bold">Select PDF</span>
              <span className="text-xs text-[var(--ink-2)]">Stays on your device</span>
            </button>
          </>
        )}

        {step === 'setup' && file && (
          <>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="truncate text-sm font-bold text-[var(--ink)]">{file.name}</p>
              <div className="mt-2">
                <SpecChip>{formatBytes(file.size)}</SpecChip>
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Maximum size (KB)
              </span>
              <input
                type="number"
                value={maxKb}
                min={10}
                onChange={(e) => setMaxKb(Math.max(10, Number(e.target.value) || 0))}
                className="fr-field mt-1.5"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {[100, 200, 500, 1024].map((kb) => (
                <button key={kb} onClick={() => setMaxKb(kb)}>
                  <SpecChip state={maxKb === kb ? 'ok' : 'neutral'} icon={false}>
                    {kb >= 1024 ? '1 MB' : `${kb} KB`}
                  </SpecChip>
                </button>
              ))}
            </div>

            <p className="text-xs leading-relaxed text-[var(--ink-2)]">
              Pages carrying photos are re-encoded to hit the target. Text-only pages are left untouched, so they stay
              sharp and selectable.
            </p>

            <Button fullWidth onClick={process}>
              Compress PDF
            </Button>
          </>
        )}

        {step === 'working' && (
          <ProgressPanel
            label={progress ? PHASE_LABEL[progress.phase] : 'Starting'}
            fraction={progress?.fraction}
            currentBytes={progress?.bytesSoFar || undefined}
            targetBytes={kbToBytes(maxKb)}
            detail={
              progress && progress.pageCount > 0 && progress.page > 0
                ? `Page ${progress.page} of ${progress.pageCount}`
                : undefined
            }
            onCancel={() => abortRef.current?.abort()}
          />
        )}

        {step === 'result' && result && resultBlob && (
          <ResultView
            heading={result.metTarget ? 'Your PDF is ready' : 'Made as small as possible'}
            blob={resultBlob}
            filename={`compressed-${file?.name ?? 'document.pdf'}`}
            originalBytes={result.originalBytes}
            summary={savedPercent > 0 ? `${savedPercent}% smaller` : 'Compressed'}
            checks={[
              {
                label: result.metTarget ? `Under ${maxKb} KB` : `Target ${maxKb} KB`,
                ok: result.metTarget,
              },
              ...(result.copiedPages > 0
                ? [{ label: `${result.copiedPages} text pages kept sharp`, ok: true }]
                : []),
            ]}
            warning={
              result.metTarget
                ? undefined
                : `This PDF couldn't go under ${maxKb} KB without becoming unreadable. Try a higher limit, or split it into fewer pages first.`
            }
            onStartOver={reset}
            startOverLabel="Another PDF"
          />
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
