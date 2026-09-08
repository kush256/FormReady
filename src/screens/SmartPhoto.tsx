import { useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SourceButtons } from '../components/SourceButtons'
import { ImageCropper } from '../components/ImageCropper'
import { StatusChip } from '../components/StatusChip'
import { captureFromCamera, pickImages } from '../lib/picker'
import { loadImage, renderCrop, compressToTarget, type CropRect } from '../lib/image'
import { saveAndShare } from '../lib/file'
import { formatBytes, kbToBytes } from '../lib/format'
import { DownloadIcon } from '../components/Icons'

interface Preset {
  label: string
  width: number
  height: number
  maxKb: number
}

const PRESETS: Preset[] = [
  { label: 'Passport Photo', width: 200, height: 230, maxKb: 50 },
  { label: 'Passport Photo (large)', width: 413, height: 531, maxKb: 100 },
  { label: 'ID / Application Photo', width: 300, height: 300, maxKb: 100 },
  { label: 'Exam Admit Card Photo', width: 150, height: 200, maxKb: 30 },
]

type Step = 'requirement' | 'source' | 'crop' | 'processing' | 'result'

export function SmartPhoto() {
  const [step, setStep] = useState<Step>('requirement')
  const [presetIndex, setPresetIndex] = useState(0)
  const [customWidth, setCustomWidth] = useState(200)
  const [customHeight, setCustomHeight] = useState(230)
  const [customMaxKb, setCustomMaxKb] = useState(50)
  const [useCustom, setUseCustom] = useState(false)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [metSize, setMetSize] = useState(true)

  const target = useCustom
    ? { width: customWidth, height: customHeight, maxKb: customMaxKb }
    : PRESETS[presetIndex]

  const aspect = useMemo(() => target.width / target.height, [target.width, target.height])

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
      const canvas = renderCrop(img, crop, target.width, target.height, '#ffffff')
      const result = await compressToTarget(canvas, { maxBytes: kbToBytes(target.maxKb) })
      setResultBlob(result.blob)
      setResultUrl(URL.createObjectURL(result.blob))
      setMetSize(result.metTarget)
      setStep('result')
    } catch {
      setError('Something went wrong while processing the photo.')
      setStep('crop')
    }
  }

  function reset() {
    setImg(null)
    setCrop(null)
    setResultBlob(null)
    setResultUrl(null)
    setError(null)
    setStep('requirement')
  }

  async function onSave() {
    if (!resultBlob) return
    await saveAndShare(resultBlob, `smart-photo-${target.width}x${target.height}.jpg`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Smart Photo" />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {step === 'requirement' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">What does the form need?</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">Pick a common requirement, or enter your own.</p>
            </div>

            <div className="space-y-2">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setUseCustom(false)
                    setPresetIndex(i)
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    !useCustom && presetIndex === i
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--color-ink)]">{p.label}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {p.width} × {p.height} px · under {p.maxKb} KB
                  </p>
                </button>
              ))}
              <button
                onClick={() => setUseCustom(true)}
                className={`w-full rounded-xl border px-4 py-3 text-left ${
                  useCustom ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
              >
                <p className="text-sm font-semibold text-[var(--color-ink)]">Custom requirement</p>
                <p className="text-xs text-[var(--color-ink-muted)]">Enter exact dimensions and size</p>
              </button>
            </div>

            {useCustom && (
              <div className="grid grid-cols-3 gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Width (px)
                  <input
                    type="number"
                    value={customWidth}
                    min={20}
                    onChange={(e) => setCustomWidth(Math.max(20, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Height (px)
                  <input
                    type="number"
                    value={customHeight}
                    min={20}
                    onChange={(e) => setCustomHeight(Math.max(20, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-[var(--color-ink-muted)]">
                  Max size (KB)
                  <input
                    type="number"
                    value={customMaxKb}
                    min={5}
                    onChange={(e) => setCustomMaxKb(Math.max(5, Number(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            <Button fullWidth onClick={() => setStep('source')}>
              Continue
            </Button>
          </>
        )}

        {step === 'source' && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Add your photo</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Target: {target.width} × {target.height} px, under {target.maxKb} KB
              </p>
            </div>
            <SourceButtons onCamera={onCamera} onGallery={onGallery} />
          </>
        )}

        {step === 'crop' && img && (
          <>
            <div>
              <h2 className="mb-1 text-lg font-bold text-[var(--color-ink)]">Frame your photo</h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Fits {target.width} × {target.height} px
              </p>
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />
            <Button fullWidth onClick={process}>
              Prepare Photo
            </Button>
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="text-sm text-[var(--color-ink-muted)]">Preparing your photo…</p>
          </div>
        )}

        {step === 'result' && resultUrl && resultBlob && (
          <>
            <h2 className="text-lg font-bold text-[var(--color-ink)]">Your photo is ready</h2>
            <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <img
                src={resultUrl}
                alt="Prepared result"
                className="mx-auto block rounded-md border border-[var(--color-border)]"
                style={{ width: target.width, maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip ok label={`${target.width} × ${target.height} px`} />
              <StatusChip ok={metSize} label={`${formatBytes(resultBlob.size)} ${metSize ? '' : `(target ${target.maxKb} KB)`}`} />
            </div>
            {!metSize && (
              <p className="rounded-xl bg-[var(--color-warning-soft)] px-4 py-3 text-xs text-[var(--color-warning)]">
                This photo couldn't be compressed under {target.maxKb} KB without becoming too low quality. It's still the
                smallest we could make it — try a simpler background photo for a smaller file.
              </p>
            )}
            <Button fullWidth onClick={onSave} icon={<DownloadIcon width={18} height={18} />}>
              Save / Share
            </Button>
            <Button fullWidth variant="secondary" onClick={reset}>
              Prepare Another Photo
            </Button>
          </>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
