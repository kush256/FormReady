import { useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { StatusChip } from '../components/StatusChip'
import { pickPdfs } from '../lib/picker'
import { compressPdf } from '../lib/pdf'
import { saveAndShare } from '../lib/file'
import { formatBytes, kbToBytes } from '../lib/format'
import { bytesToBlob } from '../lib/bytes'
import { DownloadIcon } from '../components/Icons'

type Step = 'pick' | 'setup' | 'processing' | 'result'

export function CompressPdf() {
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [maxKb, setMaxKb] = useState(500)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [metTarget, setMetTarget] = useState(true)
  const [originalSize, setOriginalSize] = useState(0)

  async function pick() {
    const files = await pickPdfs(false)
    if (!files.length) return
    setError(null)
    setFile(files[0])
    setStep('setup')
  }

  async function process() {
    if (!file) return
    setStep('processing')
    setProgress(0)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await compressPdf(bytes, kbToBytes(maxKb), setProgress)
      const blob = bytesToBlob(result.bytes, 'application/pdf')
      setResultBlob(blob)
      setMetTarget(result.metTarget)
      setOriginalSize(result.originalBytes)
      setStep('result')
    } catch {
      setError('Could not compress this PDF. It may be encrypted or corrupted.')
      setStep('setup')
    }
  }

  function reset() {
    setFile(null)
    setResultBlob(null)
    setError(null)
    setStep('pick')
  }

  async function onSave() {
    if (!resultBlob) return
    await saveAndShare(resultBlob, `compressed-${file?.name ?? 'document.pdf'}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Compress PDF" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {step === 'pick' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Reduce PDF size</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">Choose a PDF to shrink it under a size limit.</p>
            </div>
            <button
              onClick={pick}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] py-10 text-[var(--color-primary)]"
            >
              <span className="text-sm font-medium">Select PDF</span>
            </button>
          </>
        )}

        {step === 'setup' && file && (
          <>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{file.name}</p>
              <p className="text-xs text-[var(--color-ink-muted)]">{formatBytes(file.size)}</p>
            </div>
            <label className="block text-xs text-[var(--color-ink-muted)]">
              Target maximum size (KB)
              <input
                type="number"
                value={maxKb}
                min={10}
                onChange={(e) => setMaxKb(Math.max(10, Number(e.target.value) || 0))}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Pages are re-rendered at reduced quality to hit the target. Text may no longer be selectable in the
              compressed file.
            </p>
            <Button fullWidth onClick={process}>
              Compress PDF
            </Button>
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-ink-muted)]">Compressing… {Math.round(progress * 100)}%</p>
          </div>
        )}

        {step === 'result' && resultBlob && (
          <>
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Your PDF is ready</h2>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
              <p className="text-sm text-[var(--color-ink-muted)] line-through">{formatBytes(originalSize)}</p>
              <p className="text-xl font-bold text-[var(--color-ink)]">{formatBytes(resultBlob.size)}</p>
            </div>
            <StatusChip ok={metTarget} label={metTarget ? `Under ${maxKb} KB` : `Smallest possible: ${formatBytes(resultBlob.size)}`} />
            <Button fullWidth onClick={onSave} icon={<DownloadIcon width={18} height={18} />}>
              Save / Share
            </Button>
            <Button fullWidth variant="secondary" onClick={reset}>
              Compress Another PDF
            </Button>
          </>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
