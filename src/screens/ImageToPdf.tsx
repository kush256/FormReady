import { useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { pickImages } from '../lib/picker'
import { loadCappedImage, compressToTarget } from '../lib/image'
import { imagesToPdf } from '../lib/pdf'
import { bytesToBlob } from '../lib/bytes'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { EmptyState } from '../components/EmptyState'
import { PhotoStackIllustration } from '../components/Illustrations'
import { PlusIcon, TrashIcon } from '../components/Icons'

interface PickedImage {
  id: string
  file: File
  url: string
  width: number
  height: number
}

type Step = 'pick' | 'processing' | 'result'

export function ImageToPdf() {
  const [images, setImages] = useState<PickedImage[]>([])
  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [done, setDone] = useState(0)

  async function addPhotos() {
    const files = await pickImages(true)
    if (!files.length) return
    setError(null)
    const loaded: PickedImage[] = []
    for (const file of files) {
      try {
        const img = await loadCappedImage(file)
        loaded.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          url: img.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
        })
      } catch {
        // skip unreadable file
      }
    }
    setImages((prev) => [...prev, ...loaded])
  }

  function remove(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id))
  }
  function move(id: string, dir: -1 | 1) {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.id === id)
      const next = idx + dir
      if (idx < 0 || next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }

  async function generate() {
    if (images.length === 0) return
    setDone(0)
    setStep('processing')
    try {
      const inputs = []
      for (const [index, im] of images.entries()) {
        setDone(index)
        const imgEl = await loadCappedImage(im.file)
        const canvas = document.createElement('canvas')
        canvas.width = imgEl.naturalWidth
        canvas.height = imgEl.naturalHeight
        canvas.getContext('2d')!.drawImage(imgEl, 0, 0)
        const compressed = await compressToTarget(canvas, { maxBytes: 900 * 1024 })
        inputs.push({ blob: compressed.blob, width: imgEl.naturalWidth, height: imgEl.naturalHeight })
      }
      setDone(images.length)
      const bytes = await imagesToPdf(inputs)
      const blob = bytesToBlob(bytes, 'application/pdf')
      setResultBlob(blob)
      setStep('result')
    } catch {
      setError('Could not create the PDF. Please try again.')
      setStep('pick')
    }
  }

  function reset() {
    setImages([])
    setResultBlob(null)
    setError(null)
    setStep('pick')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Image to PDF" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        {step === 'pick' && (
          <>
            {images.length === 0 && (
              <EmptyState
                illustration={<PhotoStackIllustration size={200} />}
                title="Photos into one PDF"
                description="Pick your photos and each becomes a page, in the order you arrange them."
                action={
                  <Button fullWidth onClick={addPhotos}>
                    Select photos
                  </Button>
                }
              />
            )}

            {images.length > 0 && (
              <div>
                <h2 className="mb-1 text-lg font-bold text-[var(--ink)]">Add photos</h2>
                <p className="text-sm text-[var(--ink-2)]">Each photo becomes one page, in this order.</p>
              </div>
            )}

            {images.length > 0 && (
              <ul className="space-y-2">
                {images.map((im, idx) => (
                  <li key={im.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                      {idx + 1}
                    </span>
                    <img src={im.url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-[var(--line)] object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)]">{im.file.name}</span>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button onClick={() => move(im.id, -1)} disabled={idx === 0} className="text-xs text-[var(--accent)] disabled:text-[var(--line)]">▲</button>
                      <button onClick={() => move(im.id, 1)} disabled={idx === images.length - 1} className="text-xs text-[var(--accent)] disabled:text-[var(--line)]">▼</button>
                    </div>
                    <button onClick={() => remove(im.id)} className="shrink-0 text-[var(--danger)]">
                      <TrashIcon width={18} height={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {images.length > 0 && (
              <>
                <button
                  onClick={addPhotos}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line-strong)] py-6 text-sm font-bold text-[var(--accent)] active:bg-[var(--surface-sunk)]"
                >
                  <PlusIcon width={18} height={18} />
                  Add more photos
                </button>

                <Button fullWidth onClick={generate}>
                  Create PDF ({images.length} page{images.length > 1 ? 's' : ''})
                </Button>
              </>
            )}
          </>
        )}

        {step === 'processing' && (
          <ProgressPanel
            label="Building your PDF"
            fraction={images.length ? done / images.length : undefined}
            detail={`Photo ${Math.min(done + 1, images.length)} of ${images.length}`}
          />
        )}

        {step === 'result' && resultBlob && (
          <ResultView
            heading="Your PDF is ready"
            blob={resultBlob}
            filename="formready-photos.pdf"
            summary={`${images.length} page${images.length > 1 ? 's' : ''}`}
            checks={[{ label: `${images.length} pages`, ok: true }, { label: 'PDF', ok: true }]}
            onStartOver={reset}
          />
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
