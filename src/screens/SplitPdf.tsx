import { useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { pickPdfs } from '../lib/picker'
import { renderPageThumbnails, extractPages } from '../lib/pdf'
import { saveAndShare } from '../lib/file'
import { formatBytes } from '../lib/format'
import { bytesToBlob } from '../lib/bytes'
import { DownloadIcon } from '../components/Icons'

type Step = 'pick' | 'loading' | 'select' | 'processing' | 'result'

function parseRange(input: string, pageCount: number): Set<number> {
  const result = new Set<number>()
  for (const part of input.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10))
      const end = Math.min(pageCount, parseInt(rangeMatch[2], 10))
      for (let i = start; i <= end; i++) result.add(i - 1)
    } else {
      const n = parseInt(trimmed, 10)
      if (n >= 1 && n <= pageCount) result.add(n - 1)
    }
  }
  return result
}

export function SplitPdf() {
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [rangeInput, setRangeInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)

  async function pick() {
    const files = await pickPdfs(false)
    if (!files.length) return
    setError(null)
    setStep('loading')
    try {
      const f = files[0]
      const buf = new Uint8Array(await f.arrayBuffer())
      const pageThumbs = await renderPageThumbnails(buf)
      setFile(f)
      setBytes(buf)
      setThumbs(pageThumbs)
      setSelected(new Set(pageThumbs.map((_, i) => i)))
      setStep('select')
    } catch {
      setError('Could not open this PDF. It may be encrypted or corrupted.')
      setStep('pick')
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function applyRange() {
    if (!rangeInput.trim()) return
    setSelected(parseRange(rangeInput, thumbs.length))
  }

  async function generate() {
    if (!bytes || selected.size === 0) return
    setStep('processing')
    try {
      const indices = Array.from(selected).sort((a, b) => a - b)
      const out = await extractPages(bytes, indices)
      const blob = bytesToBlob(out, 'application/pdf')
      setResultBlob(blob)
      setStep('result')
    } catch {
      setError('Could not extract those pages. Please try again.')
      setStep('select')
    }
  }

  function reset() {
    setFile(null)
    setBytes(null)
    setThumbs([])
    setSelected(new Set())
    setRangeInput('')
    setResultBlob(null)
    setError(null)
    setStep('pick')
  }

  async function onSave() {
    if (!resultBlob) return
    await saveAndShare(resultBlob, `split-${file?.name ?? 'document.pdf'}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Split PDF" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {step === 'pick' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Extract PDF pages</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">Choose a PDF, then pick the pages you need.</p>
            </div>
            <button
              onClick={pick}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] py-10 text-[var(--color-primary)]"
            >
              <span className="text-sm font-medium">Select PDF</span>
            </button>
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-ink-muted)]">Loading pages…</p>
          </div>
        )}

        {step === 'select' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--color-ink)]">{selected.size} of {thumbs.length} selected</h2>
              <div className="flex gap-3 text-xs font-medium text-[var(--color-primary)]">
                <button onClick={() => setSelected(new Set(thumbs.map((_, i) => i)))}>All</button>
                <button onClick={() => setSelected(new Set())}>None</button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 1-3, 5"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              />
              <Button variant="secondary" onClick={applyRange}>
                Apply
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {thumbs.map((src, i) => (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`relative overflow-hidden rounded-lg border-2 ${selected.has(i) ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}
                >
                  <img src={src} alt={`Page ${i + 1}`} className="w-full" />
                  <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{i + 1}</span>
                  {selected.has(i) && (
                    <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] text-white">✓</span>
                  )}
                </button>
              ))}
            </div>

            <Button fullWidth disabled={selected.size === 0} onClick={generate}>
              Extract {selected.size} page{selected.size !== 1 ? 's' : ''}
            </Button>
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-ink-muted)]">Extracting pages…</p>
          </div>
        )}

        {step === 'result' && resultBlob && (
          <>
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Your PDF is ready</h2>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
              <p className="text-sm text-[var(--color-ink)]">{selected.size} page{selected.size !== 1 ? 's' : ''}</p>
              <p className="text-xs text-[var(--color-ink-muted)]">{formatBytes(resultBlob.size)}</p>
            </div>
            <Button fullWidth onClick={onSave} icon={<DownloadIcon width={18} height={18} />}>
              Save / Share
            </Button>
            <Button fullWidth variant="secondary" onClick={reset}>
              Start Over
            </Button>
          </>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
