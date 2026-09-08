import { useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { pickPdfs } from '../lib/picker'
import { mergePdfs, getPageCount } from '../lib/pdf'
import { formatBytes } from '../lib/format'
import { bytesToBlob } from '../lib/bytes'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { PlusIcon, TrashIcon } from '../components/Icons'

interface PickedPdf {
  id: string
  file: File
  pages: number
}

type Step = 'pick' | 'processing' | 'result'

export function MergePdf() {
  const [pdfs, setPdfs] = useState<PickedPdf[]>([])
  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)

  async function addPdfs() {
    const files = await pickPdfs(true)
    if (!files.length) return
    setError(null)
    const loaded: PickedPdf[] = []
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const pages = await getPageCount(bytes)
        loaded.push({ id: `${file.name}-${Date.now()}-${Math.random()}`, file, pages })
      } catch {
        setError(`Could not read "${file.name}" — it may be encrypted or corrupted.`)
      }
    }
    setPdfs((prev) => [...prev, ...loaded])
  }

  function remove(id: string) {
    setPdfs((prev) => prev.filter((p) => p.id !== id))
  }
  function move(id: string, dir: -1 | 1) {
    setPdfs((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      const next = idx + dir
      if (idx < 0 || next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }

  async function generate() {
    if (pdfs.length < 2) return
    setStep('processing')
    try {
      const byteArrays = await Promise.all(pdfs.map(async (p) => new Uint8Array(await p.file.arrayBuffer())))
      const bytes = await mergePdfs(byteArrays)
      const blob = bytesToBlob(bytes, 'application/pdf')
      setResultBlob(blob)
      setStep('result')
    } catch {
      setError('Could not merge these PDFs. Please try again.')
      setStep('pick')
    }
  }

  function reset() {
    setPdfs([])
    setResultBlob(null)
    setError(null)
    setStep('pick')
  }


  const totalPages = pdfs.reduce((sum, p) => sum + p.pages, 0)

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Merge PDF" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        {step === 'pick' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--ink)]">Combine PDFs</h2>
              <p className="text-sm text-[var(--ink-2)]">Add two or more PDFs. They'll be combined in this order.</p>
            </div>

            {pdfs.length > 0 && (
              <ul className="space-y-2">
                {pdfs.map((p, idx) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{p.file.name}</p>
                      <p className="text-xs text-[var(--ink-2)]">
                        {p.pages} page{p.pages > 1 ? 's' : ''} · {formatBytes(p.file.size)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button onClick={() => move(p.id, -1)} disabled={idx === 0} className="text-xs text-[var(--accent)] disabled:text-[var(--line)]">▲</button>
                      <button onClick={() => move(p.id, 1)} disabled={idx === pdfs.length - 1} className="text-xs text-[var(--accent)] disabled:text-[var(--line)]">▼</button>
                    </div>
                    <button onClick={() => remove(p.id)} className="shrink-0 text-[var(--danger)]">
                      <TrashIcon width={18} height={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={addPdfs}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line)] py-6 text-sm font-medium text-[var(--accent)]"
            >
              <PlusIcon width={18} height={18} />
              {pdfs.length ? 'Add more PDFs' : 'Select PDFs'}
            </button>

            <Button fullWidth disabled={pdfs.length < 2} onClick={generate}>
              Merge {pdfs.length >= 2 ? `(${totalPages} pages total)` : ''}
            </Button>
            {pdfs.length === 1 && (
              <p className="text-center text-xs text-[var(--ink-2)]">Add at least one more PDF to merge.</p>
            )}
          </>
        )}

        {step === 'processing' && (
          <ProgressPanel label="Merging PDFs" detail={`${pdfs.length} files, ${totalPages} pages`} />
        )}

        {step === 'result' && resultBlob && (
          <ResultView
            heading="Your merged PDF is ready"
            blob={resultBlob}
            filename="formready-merged.pdf"
            summary={`${totalPages} pages`}
            checks={[
              { label: `${totalPages} pages`, ok: true },
              { label: `${pdfs.length} files combined`, ok: true },
            ]}
            onStartOver={reset}
          />
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
