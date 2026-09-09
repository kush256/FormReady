import { useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { pickImages } from '../lib/picker'
import { readPhotoPreview, decodeToCanvas, encodeJpegNearTarget, releaseCanvas } from '../lib/image'
import { imagesToPdf, type ImagePageInput } from '../lib/pdf'
import { bytesToBlob } from '../lib/bytes'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { EmptyState } from '../components/EmptyState'
import { PhotoStackIllustration } from '../components/Illustrations'
import { PlusIcon, TrashIcon } from '../components/Icons'

interface PickedImage {
  id: string
  file: File
  thumbnail: string
  width: number
  height: number
}

type Step = 'pick' | 'processing' | 'result'

type Phase = 'reading' | 'building'

/**
 * A JPEG this small is already a sensible PDF page, so it goes in untouched:
 * no decode, no re-encode, no quality lost. Most gallery photos land here,
 * which is why adding them now feels instant.
 */
const DIRECT_EMBED_MAX_BYTES = 1_500 * 1024

/** Longest edge kept for a page. A4 at 300 dpi is about 2480 pixels tall. */
const PAGE_MAX_EDGE = 2200

/** Byte budget for a page we have to re-encode. */
const PAGE_TARGET_BYTES = 700 * 1024

export function ImageToPdf() {
  const [images, setImages] = useState<PickedImage[]>([])
  const [step, setStep] = useState<Step>('pick')
  const [error, setError] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [phase, setPhase] = useState<Phase>('reading')
  const [adding, setAdding] = useState(false)

  async function addPhotos() {
    const files = await pickImages(true)
    if (!files.length) return
    setError(null)
    setAdding(true)
    try {
      const loaded: PickedImage[] = []
      const unreadable: string[] = []
      for (const file of files) {
        try {
          const preview = await readPhotoPreview(file)
          loaded.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            file,
            thumbnail: preview.thumbnail,
            width: preview.width,
            height: preview.height,
          })
        } catch {
          unreadable.push(file.name)
        }
      }
      setImages((prev) => [...prev, ...loaded])
      if (unreadable.length) {
        setError(
          unreadable.length === files.length
            ? 'None of those files could be opened as images.'
            : `Skipped ${unreadable.length} file${unreadable.length > 1 ? 's' : ''} that could not be opened.`,
        )
      }
    } finally {
      setAdding(false)
    }
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

  /** Gets one photo ready for the page, doing as little work as it can. */
  async function preparePage(item: PickedImage): Promise<ImagePageInput> {
    const alreadyFine =
      (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg') &&
      item.file.size <= DIRECT_EMBED_MAX_BYTES &&
      Math.max(item.width, item.height) <= PAGE_MAX_EDGE

    if (alreadyFine) {
      return { blob: item.file, width: item.width, height: item.height }
    }

    const canvas = await decodeToCanvas(item.file, item.width, item.height, PAGE_MAX_EDGE)
    const blob = await encodeJpegNearTarget(canvas, PAGE_TARGET_BYTES)
    const width = canvas.width
    const height = canvas.height
    releaseCanvas(canvas)
    return { blob, width, height }
  }

  async function generate() {
    if (images.length === 0) return
    setDone(0)
    setTotal(images.length)
    setSkipped([])
    setPhase('reading')
    setError(null)
    setStep('processing')

    try {
      const pages: ImagePageInput[] = []
      const failed: string[] = []

      for (const [index, item] of images.entries()) {
        setDone(index)
        try {
          pages.push(await preparePage(item))
        } catch {
          // One unreadable photo shouldn't cost the user the whole document.
          failed.push(item.file.name)
        }
      }

      if (pages.length === 0) {
        setError('None of these photos could be read. Try picking them again.')
        setStep('pick')
        return
      }

      setPhase('building')
      setTotal(pages.length)
      setDone(0)
      const bytes = await imagesToPdf(pages, setDone)
      setSkipped(failed)
      setResultBlob(bytesToBlob(bytes, 'application/pdf'))
      setStep('result')
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
      setError(`Could not create the PDF${detail}.`)
      setStep('pick')
    }
  }

  function reset() {
    setImages([])
    setResultBlob(null)
    setError(null)
    setSkipped([])
    setStep('pick')
  }

  const included = images.length - skipped.length

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
                  <Button fullWidth onClick={addPhotos} disabled={adding}>
                    {adding ? 'Reading photos…' : 'Select photos'}
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
                    <img src={im.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-[var(--line)] object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink-2)]">{im.file.name}</span>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button onClick={() => move(im.id, -1)} disabled={idx === 0} className="text-xs text-[var(--accent)] disabled:text-[var(--line)]">▲</button>
                      <button onClick={() => move(im.id, 1)} disabled={idx === images.length - 1} className="text-xs text-[var(--accent)] disabled:text-[var(--line)]">▼</button>
                    </div>
                    <button onClick={() => remove(im.id)} className="shrink-0 text-[var(--danger)]" aria-label={`Remove ${im.file.name}`}>
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
                  disabled={adding}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line-strong)] py-6 text-sm font-bold text-[var(--accent)] active:bg-[var(--surface-sunk)] disabled:opacity-60"
                >
                  <PlusIcon width={18} height={18} />
                  {adding ? 'Reading photos…' : 'Add more photos'}
                </button>

                <Button fullWidth onClick={generate} disabled={adding}>
                  Create PDF ({images.length} page{images.length > 1 ? 's' : ''})
                </Button>
              </>
            )}
          </>
        )}

        {step === 'processing' && (
          <ProgressPanel
            label={phase === 'reading' ? 'Preparing photos' : 'Building your PDF'}
            fraction={total ? done / total : undefined}
            detail={
              phase === 'reading'
                ? `Photo ${Math.min(done + 1, total)} of ${total}`
                : `Page ${Math.min(done + 1, total)} of ${total}`
            }
          />
        )}

        {step === 'result' && resultBlob && (
          <ResultView
            heading="Your PDF is ready"
            blob={resultBlob}
            filename="formready-photos.pdf"
            summary={`${included} page${included !== 1 ? 's' : ''}`}
            checks={[{ label: `${included} pages`, ok: true }, { label: 'PDF', ok: true }]}
            warning={
              skipped.length
                ? `${skipped.length} photo${skipped.length > 1 ? 's' : ''} could not be read and ${skipped.length > 1 ? 'were' : 'was'} left out: ${skipped.join(', ')}.`
                : undefined
            }
            onStartOver={reset}
          />
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
