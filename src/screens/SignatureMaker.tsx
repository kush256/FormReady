import { useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SourceButtons } from '../components/SourceButtons'
import { ImageCropper } from '../components/ImageCropper'
import { StatusChip } from '../components/StatusChip'
import { captureFromCamera, pickImages } from '../lib/picker'
import { loadImage, renderCrop, compressToTarget, whitenBackground, type CropRect } from '../lib/image'
import { saveAndShare } from '../lib/file'
import { formatBytes, kbToBytes } from '../lib/format'
import { DownloadIcon } from '../components/Icons'

type Step = 'source' | 'crop' | 'processing' | 'result'

const DEFAULT_WIDTH = 140
const DEFAULT_HEIGHT = 60
const MIN_KB = 10
const MAX_KB = 20

export function SignatureMaker() {
  const [step, setStep] = useState<Step>('source')
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [cleanBackground, setCleanBackground] = useState(true)

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
      setError('Could not open that image. Try a different file.')
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
      if (cleanBackground) whitenBackground(canvas)
      const result = await compressToTarget(canvas, { maxBytes: kbToBytes(MAX_KB), minQuality: 0.3 })
      setResultBlob(result.blob)
      setResultUrl(URL.createObjectURL(result.blob))
      setMetSize(result.metTarget)
      setStep('result')
    } catch {
      setError('Something went wrong while processing the signature.')
      setStep('crop')
    }
  }

  function reset() {
    setImg(null)
    setCrop(null)
    setResultBlob(null)
    setResultUrl(null)
    setError(null)
    setStep('source')
  }

  async function onSave() {
    if (!resultBlob) return
    await saveAndShare(resultBlob, `signature-${width}x${height}.jpg`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Signature Maker" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {step === 'source' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Add your signature</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Sign on plain white paper, then photograph or upload it.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Width (px)
                  <input
                    type="number"
                    value={width}
                    min={40}
                    onChange={(e) => setWidth(Math.max(40, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Height (px)
                  <input
                    type="number"
                    value={height}
                    min={20}
                    onChange={(e) => setHeight(Math.max(20, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                <input type="checkbox" checked={cleanBackground} onChange={(e) => setCleanBackground(e.target.checked)} />
                Clean background to plain white
              </label>
              <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Target size: {MIN_KB}–{MAX_KB} KB</p>
            </div>

            <SourceButtons onCamera={onCamera} onGallery={onGallery} />
          </>
        )}

        {step === 'crop' && img && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Frame your signature</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Fits {width} × {height} px
              </p>
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />
            <Button fullWidth onClick={process}>
              Prepare Signature
            </Button>
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-ink-muted)]">Preparing your signature…</p>
          </div>
        )}

        {step === 'result' && resultUrl && resultBlob && (
          <>
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Your signature is ready</h2>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <img
                src={resultUrl}
                alt="Prepared signature"
                className="mx-auto block rounded-md border border-[var(--color-border)] bg-white"
                style={{ width, maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip ok label={`${width} × ${height} px`} />
              <StatusChip
                ok={metSize && resultBlob.size >= kbToBytes(MIN_KB) * 0.5}
                label={formatBytes(resultBlob.size)}
              />
            </div>
            {!metSize && (
              <p className="rounded-xl bg-[var(--color-warning-soft)] px-4 py-3 text-xs text-[var(--color-warning)]">
                Couldn't fit under {MAX_KB} KB at good quality. This is the smallest we could make it.
              </p>
            )}
            <Button fullWidth onClick={onSave} icon={<DownloadIcon width={18} height={18} />}>
              Save / Share
            </Button>
            <Button fullWidth variant="secondary" onClick={reset}>
              Make Another Signature
            </Button>
          </>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
