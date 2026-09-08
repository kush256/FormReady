import { useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { pickImages } from '../lib/picker'
import { loadImage, compressToTarget } from '../lib/image'
import { imagesToPdf } from '../lib/pdf'
import { saveAndShare } from '../lib/file'
import { formatBytes } from '../lib/format'
import { bytesToBlob } from '../lib/bytes'
import { PlusIcon, TrashIcon, DownloadIcon } from '../components/Icons'

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
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  async function addPhotos() {
    const files = await pickImages(true)
    if (!files.length) return
    setError(null)
    const loaded: PickedImage[] = []
    for (const file of files) {
      try {
        const img = await loadImage(file)
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
    setStep('processing')
    try {
      const inputs = []
      for (const im of images) {
        const imgEl = await loadImage(im.file)
        const canvas = document.createElement('canvas')
        canvas.width = imgEl.naturalWidth
        canvas.height = imgEl.naturalHeight
        canvas.getContext('2d')!.drawImage(imgEl, 0, 0)
        const compressed = await compressToTarget(canvas, { maxBytes: 900 * 1024 })
        inputs.push({ blob: compressed.blob, width: im.width, height: im.height })
      }
      const bytes = await imagesToPdf(inputs)
      const blob = bytesToBlob(bytes, 'application/pdf')
      setResultBlob(blob)
      setResultUrl(URL.createObjectURL(blob))
      setStep('result')
    } catch {
      setError('Could not create the PDF. Please try again.')
      setStep('pick')
    }
  }

  function reset() {
    setImages([])
    setResultBlob(null)
    setResultUrl(null)
    setError(null)
    setStep('pick')
  }

  async function onSave() {
    if (!resultBlob) return
    await saveAndShare(resultBlob, 'formready-photos.pdf')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Image to PDF" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {step === 'pick' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Add photos</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">Each photo becomes one page, in this order.</p>
            </div>

            {images.length > 0 && (
              <ul className="space-y-2">
                {images.map((im, idx) => (
                  <li key={im.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
                      {idx + 1}
                    </span>
                    <img src={im.url} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-[var(--color-border)] object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-ink-muted)]">{im.file.name}</span>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button onClick={() => move(im.id, -1)} disabled={idx === 0} className="text-xs text-[var(--color-primary)] disabled:text-[var(--color-border)]">▲</button>
                      <button onClick={() => move(im.id, 1)} disabled={idx === images.length - 1} className="text-xs text-[var(--color-primary)] disabled:text-[var(--color-border)]">▼</button>
                    </div>
                    <button onClick={() => remove(im.id)} className="shrink-0 text-[var(--color-danger)]">
                      <TrashIcon width={18} height={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={addPhotos}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] py-6 text-sm font-medium text-[var(--color-primary)]"
            >
              <PlusIcon width={18} height={18} />
              {images.length ? 'Add more photos' : 'Select photos'}
            </button>

            <Button fullWidth disabled={images.length === 0} onClick={generate}>
              Create PDF {images.length ? `(${images.length} page${images.length > 1 ? 's' : ''})` : ''}
            </Button>
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-ink-muted)]">Building your PDF…</p>
          </div>
        )}

        {step === 'result' && resultBlob && resultUrl && (
          <>
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Your PDF is ready</h2>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
              <p className="text-sm text-[var(--color-ink)]">{images.length} page{images.length > 1 ? 's' : ''}</p>
              <p className="text-xs text-[var(--color-ink-muted)]">{formatBytes(resultBlob.size)}</p>
              <a href={resultUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[var(--color-primary)] underline">
                Preview PDF
              </a>
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
