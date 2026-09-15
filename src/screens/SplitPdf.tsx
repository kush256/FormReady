import { useEffect, useRef, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { pickPdfs } from '../lib/picker'
import { openPageThumbnails, extractPages, type PageThumbnails } from '../lib/pdf'
import { PageThumb } from '../components/PageThumb'
import { bytesToBlob } from '../lib/bytes'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { EmptyState } from '../components/EmptyState'
import { SplitIllustration } from '../components/Illustrations'

type Step = 'pick' | 'loading' | 'select' | 'processing' | 'result'

interface ParsedRange {
  pages: Set<number>
  /** Anything typed that named no page in this document, kept for the message. */
  bad: string[]
}

function parseRange(input: string, pageCount: number): ParsedRange {
  const pages = new Set<number>()
  const bad: string[] = []
  for (const part of input.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10))
      const end = Math.min(pageCount, parseInt(rangeMatch[2], 10))
      // A range wholly outside the document selects nothing, and silently
      // selecting nothing is what made a typo impossible to notice.
      if (start > end) bad.push(trimmed)
      for (let i = start; i <= end; i++) pages.add(i - 1)
    } else {
      const n = parseInt(trimmed, 10)
      if (n >= 1 && n <= pageCount) pages.add(n - 1)
      else bad.push(trimmed)
    }
  }
  return { pages, bad }
}

export function SplitPdf() {
  const [step, setStep] = useState<Step>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pages, setPages] = useState<PageThumbnails | null>(null)
  const pageCount = pages?.pageCount ?? 0
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [rangeInput, setRangeInput] = useState('')
  /** Sits under the field itself: a typo needs answering where it was typed. */
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)

  // The open document holds a pdf.js worker; drop it when the screen goes.
  const openDoc = useRef<PageThumbnails | null>(null)
  useEffect(() => () => openDoc.current?.close(), [])

  async function pick() {
    const files = await pickPdfs(false)
    if (!files.length) return
    setError(null)
    setStep('loading')
    try {
      const f = files[0]
      const buf = new Uint8Array(await f.arrayBuffer())
      const thumbnails = await openPageThumbnails(buf)
      openDoc.current?.close()
      openDoc.current = thumbnails
      setFile(f)
      setBytes(buf)
      setPages(thumbnails)
      setSelected(new Set(Array.from({ length: thumbnails.pageCount }, (_, i) => i)))
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
    if (!rangeInput.trim()) {
      setRangeError(`Type the pages you want, like 1-3, 5.`)
      return
    }
    const { pages, bad } = parseRange(rangeInput, pageCount)
    if (pages.size === 0) {
      setRangeError(
        `Couldn't find ${bad.length === 1 ? `page ${bad[0]}` : 'those pages'} in a ${pageCount}-page document.`,
      )
      return
    }
    // Some of it worked: apply that much, and name what was dropped rather
    // than letting the count quietly disagree with what was typed.
    setRangeError(bad.length ? `Selected ${pages.size}. Ignored ${bad.join(', ')}.` : null)
    setSelected(pages)
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
    openDoc.current?.close()
    openDoc.current = null
    setFile(null)
    setBytes(null)
    setPages(null)
    setSelected(new Set())
    setRangeInput('')
    setRangeError(null)
    setResultBlob(null)
    setError(null)
    setStep('pick')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Split PDF">
        {step === 'select' && (
          // Everything needed to drive the list is pinned: on a 615-page book
          // the count, the reset, and the field that selects without scrolling
          // are the whole interface. The uppercase caption the app's other
          // fields carry is dropped here on purpose — sticky chrome costs list
          // space on every screenful, and the placeholder says the same thing.
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-[var(--ink)]">
                {selected.size} of {pageCount} selected
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(new Set(Array.from({ length: pageCount }, (_, i) => i)))}
                  className="rounded-full border border-[var(--line-strong)] bg-[var(--surface-sunk)] px-3 py-1 text-xs font-semibold text-[var(--accent)] active:bg-[var(--accent-soft)]"
                >
                  All
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="rounded-full border border-[var(--line-strong)] bg-[var(--surface-sunk)] px-3 py-1 text-xs font-semibold text-[var(--accent)] active:bg-[var(--accent-soft)]"
                >
                  None
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 1-3, 5"
                value={rangeInput}
                aria-label="Pages to select, by number"
                aria-invalid={rangeError ? 'true' : 'false'}
                onChange={(e) => {
                  setRangeInput(e.target.value)
                  setRangeError(null)
                }}
                // The keyboard's own Go key did nothing, so every range meant
                // typing, dismissing the keyboard, then finding Apply.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyRange()
                }}
                className="fr-field flex-1 py-1.5 text-sm"
              />
              <Button variant="secondary" onClick={applyRange}>
                Apply
              </Button>
            </div>

            {rangeError && (
              <p className="text-xs leading-relaxed text-[var(--danger)]">{rangeError}</p>
            )}
          </div>
        )}
      </ScreenHeader>

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        {step === 'pick' && (
          <EmptyState
            illustration={<SplitIllustration size={200} />}
            title="Extract PDF pages"
            description="Choose a PDF and pick only the pages you need, by tapping them or typing a range."
            action={
              <Button fullWidth onClick={pick}>
                Select PDF
              </Button>
            }
          />
        )}

        {step === 'loading' && (
          <ProgressPanel label="Opening your PDF" detail="Reading the page list" />
        )}

        {step === 'select' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {pages &&
                Array.from({ length: pageCount }, (_, i) => (
                  <PageThumb key={i} index={i} source={pages} selected={selected.has(i)} onToggle={() => toggle(i)} />
                ))}
            </div>

            {/* Sticky, so finishing never means scrolling back past every
                page already dealt with. */}
            <div className="safe-bottom sticky bottom-0 -mx-5 border-t border-[var(--line)] bg-[var(--bg)]/92 px-5 pb-3 pt-3 backdrop-blur">
              <Button fullWidth disabled={selected.size === 0} onClick={generate}>
                {selected.size === 0
                  ? 'Select pages to extract'
                  : `Extract ${selected.size} page${selected.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </>
        )}

        {step === 'processing' && (
          <ProgressPanel label="Extracting pages" detail={`${selected.size} of ${pageCount}`} />
        )}

        {step === 'result' && resultBlob && (
          <ResultView
            heading="Your PDF is ready"
            blob={resultBlob}
            filename={`split-${file?.name ?? 'document.pdf'}`}
            summary={`${selected.size} page${selected.size !== 1 ? 's' : ''}`}
            checks={[
              { label: `${selected.size} of ${pageCount} pages`, ok: true },
              { label: 'PDF', ok: true },
            ]}
            onStartOver={reset}
          />
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
