import { useState } from 'react'
import { Button } from './Button'
import { SpecChip } from './SpecChip'
import { CheckCircleIcon, DownloadIcon, ShareIcon, WarningIcon } from './Icons'
import { saveToDevice, shareFile } from '../lib/file'
import { formatBytes } from '../lib/format'

export interface ResultCheck {
  label: string
  ok: boolean
}

interface Props {
  heading: string
  blob: Blob
  filename: string
  /** Object URL for image results; PDFs show a summary block instead. */
  previewUrl?: string
  /** Natural width of an image result, so it previews at true size. */
  previewWidth?: number
  /** Size before processing, to show the transformation. */
  originalBytes?: number
  /** One line describing the output, e.g. "5 pages". */
  summary?: string
  checks?: ResultCheck[]
  warning?: string
  onStartOver: () => void
  startOverLabel?: string
}

/**
 * The end of every flow. Save and Share are deliberately separate actions:
 * Save writes a permanent file and says where it went, Share opens the system
 * sheet. Before this they were one button that only ever wrote to cache.
 */
export function ResultView({
  heading,
  blob,
  filename,
  previewUrl,
  previewWidth,
  originalBytes,
  summary,
  checks = [],
  warning,
  onStartOver,
  startOverLabel = 'Start over',
}: Props) {
  const [savedTo, setSavedTo] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'share' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const allPassed = checks.length > 0 && checks.every((c) => c.ok)

  async function onSave() {
    setBusy('save')
    setError(null)
    try {
      const result = await saveToDevice(blob, filename)
      setSavedTo(result.location)
    } catch {
      setError('Could not save the file. Try sharing it instead.')
    } finally {
      setBusy(null)
    }
  }

  async function onShare() {
    setBusy('share')
    setError(null)
    try {
      await shareFile(blob, filename)
    } catch {
      setError('Could not open the share sheet.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">{heading}</h2>

      {originalBytes !== undefined && (
        <div className="flex items-center gap-3">
          <div className="flex-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Before</p>
            <p className="mt-1 font-mono text-sm text-[var(--ink-2)] tabular-nums line-through">
              {formatBytes(originalBytes)}
            </p>
          </div>
          <span className="text-[var(--ink-3)]">&rarr;</span>
          <div className="flex-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">After</p>
            <p className="mt-1 font-mono text-sm font-semibold text-[var(--ok)] tabular-nums">
              {formatBytes(blob.size)}
            </p>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <img
            src={previewUrl}
            alt="Prepared result"
            className="mx-auto block rounded-lg border border-[var(--line)] bg-white"
            style={{ width: previewWidth, maxWidth: '100%', height: 'auto' }}
          />
        </div>
      )}

      {!previewUrl && summary && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-center">
          <p className="text-base font-bold text-[var(--ink)]">{summary}</p>
          <p className="mt-1 font-mono text-sm text-[var(--ink-2)] tabular-nums">{formatBytes(blob.size)}</p>
        </div>
      )}

      {checks.length > 0 && (
        <div
          className={`rounded-2xl border p-4 ${
            allPassed
              ? 'border-[var(--ok)]/35 bg-[var(--ok-soft)]'
              : 'border-[var(--warn)]/35 bg-[var(--warn-soft)]'
          }`}
        >
          <p
            className={`flex items-center gap-2 text-sm font-bold ${
              allPassed ? 'text-[var(--ok)]' : 'text-[var(--warn)]'
            }`}
          >
            {allPassed ? <CheckCircleIcon width={16} height={16} /> : <WarningIcon width={16} height={16} />}
            {allPassed ? 'Meets every requirement' : 'Check before you upload'}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {checks.map((check) => (
              <SpecChip key={check.label} state={check.ok ? 'ok' : 'warn'}>
                {check.label}
              </SpecChip>
            ))}
          </div>
        </div>
      )}

      {warning && (
        <p className="rounded-xl bg-[var(--warn-soft)] px-4 py-3 text-xs leading-relaxed text-[var(--warn)]">
          {warning}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
      )}

      <div className="space-y-2.5">
        {savedTo ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-[var(--ok-soft)] px-4 py-3.5 text-sm font-semibold text-[var(--ok)]">
            <CheckCircleIcon width={17} height={17} />
            Saved to {savedTo}
          </div>
        ) : (
          <Button fullWidth onClick={onSave} disabled={busy !== null} icon={<DownloadIcon width={18} height={18} />}>
            {busy === 'save' ? 'Saving…' : 'Save to device'}
          </Button>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={onShare} disabled={busy !== null} icon={<ShareIcon width={17} height={17} />}>
            Share
          </Button>
          <Button variant="secondary" onClick={onStartOver}>
            {startOverLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
