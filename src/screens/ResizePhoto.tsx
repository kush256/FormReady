import { useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SourceButtons } from '../components/SourceButtons'
import { ImageCropper } from '../components/ImageCropper'
import { StatusChip } from '../components/StatusChip'
import { captureFromCamera, pickImages } from '../lib/picker'
import { loadImage, renderCrop, compressToTarget, canvasToBlob, type CropRect } from '../lib/image'
import { saveAndShare } from '../lib/file'
import { formatBytes, kbToBytes } from '../lib/format'
import { DownloadIcon } from '../components/Icons'

type Step = 'setup' | 'source' | 'crop' | 'processing' | 'result'

export function ResizePhoto() {
  const [step, setStep] = useState<Step>('setup')
  const [width, setWidth] = useState(600)
  const [height, setHeight] = useState(600)
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg')
  const [limitSize, setLimitSize] = useState(false)
  const [maxKb, setMaxKb] = useState(200)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [metSize, setMetSize] = useState(true)

  const aspect = useMemo(() => width / height, [width, height])

  async function handlePicked(files: File[]) {
    const file = files[0]
    if (!file) return
    try {
      setError(null)
      const image = await loadImage(file)
      setImg(image)
      setStep('crop')
    } catch {
      setError('Could not open that photo. Try a different file.')
    }
  }

  async function onCamera() {
    const file = await captureFromCamera()
    if (file) handlePicked([file])
  }
  async function onGallery() {
    const files = await pickImages(false)
    if (files.length) handlePicked(files)
  }

  async function process() {
    if (!img || !crop) return
    setStep('processing')
    try {
      const canvas = renderCrop(img, crop, width, height, '#ffffff')
      if (format === 'png') {
        const blob = await canvasToBlob(canvas, 'image/png')
        setResultBlob(blob)
        setResultUrl(URL.createObjectURL(blob))
        setMetSize(limitSize ? blob.size <= kbToBytes(maxKb) : true)
      } else {
        const maxBytes = limitSize ? kbToBytes(maxKb) : 5 * 1024 * 1024
        const result = await compressToTarget(canvas, { maxBytes })
        setResultBlob(result.blob)
        setResultUrl(URL.createObjectURL(result.blob))
        setMetSize(limitSize ? result.metTarget : true)
      }
      setStep('result')
    } catch {
      setError('Something went wrong while resizing the photo.')
      setStep('crop')
    }
  }

  function reset() {
    setImg(null)
    setCrop(null)
    setResultBlob(null)
    setResultUrl(null)
    setError(null)
    setStep('setup')
  }

  async function onSave() {
    if (!resultBlob) return
    await saveAndShare(resultBlob, `resized-${width}x${height}.${format === 'png' ? 'png' : 'jpg'}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Resize Photo" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {step === 'setup' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Set exact dimensions</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">Enter the width and height your form requires.</p>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Width (px)
                  <input
                    type="number"
                    value={width}
                    min={10}
                    onChange={(e) => setWidth(Math.max(10, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Height (px)
                  <input
                    type="number"
                    value={height}
                    min={10}
                    onChange={(e) => setHeight(Math.max(10, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
              </div>

              <div>
                <p className="mb-1 text-xs text-[var(--color-ink-muted)]">Format</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormat('jpeg')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm ${format === 'jpeg' ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}
                  >
                    JPEG
                  </button>
                  <button
                    onClick={() => setFormat('png')}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm ${format === 'png' ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}
                  >
                    PNG
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                <input type="checkbox" checked={limitSize} onChange={(e) => setLimitSize(e.target.checked)} disabled={format === 'png'} />
                Limit file size {format === 'png' && '(JPEG only)'}
              </label>
              {limitSize && format === 'jpeg' && (
                <label className="block text-xs text-[var(--color-ink-muted)]">
                  Max size (KB)
                  <input
                    type="number"
                    value={maxKb}
                    min={5}
                    onChange={(e) => setMaxKb(Math.max(5, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
              )}
            </div>

            <Button fullWidth onClick={() => setStep('source')}>
              Continue
            </Button>
          </>
        )}

        {step === 'source' && (
          <>
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Add your photo</h2>
            <SourceButtons onCamera={onCamera} onGallery={onGallery} />
          </>
        )}

        {step === 'crop' && img && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Frame your photo</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Fits {width} × {height} px
              </p>
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />
            <Button fullWidth onClick={process}>
              Resize Photo
            </Button>
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-ink-muted)]">Resizing your photo…</p>
          </div>
        )}

        {step === 'result' && resultUrl && resultBlob && (
          <>
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Your photo is ready</h2>
            <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <img
                src={resultUrl}
                alt="Resized result"
                className="mx-auto block rounded-md border border-[var(--color-border)]"
                style={{ width, maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip ok label={`${width} × ${height} px`} />
              <StatusChip ok={metSize} label={formatBytes(resultBlob.size)} />
            </div>
            <Button fullWidth onClick={onSave} icon={<DownloadIcon width={18} height={18} />}>
              Save / Share
            </Button>
            <Button fullWidth variant="secondary" onClick={reset}>
              Resize Another Photo
            </Button>
          </>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
