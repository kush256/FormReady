import { useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SourceButtons } from '../components/SourceButtons'
import { ImageCropper } from '../components/ImageCropper'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { Notice } from '../components/Notice'
import { NumberField } from '../components/NumberField'
import { captureFromCamera, pickImages } from '../lib/picker'
import { loadCappedImage, renderCrop, compressToTarget, canvasToBlob, type CropRect } from '../lib/image'
import { validateRequirement } from '../lib/requirements'
import { kbToBytes } from '../lib/format'

type Step = 'setup' | 'source' | 'crop' | 'working' | 'result'

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
  const [sourceBytes, setSourceBytes] = useState(0)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [metSize, setMetSize] = useState(true)

  const aspect = useMemo(() => width / height, [width, height])
  const issue = useMemo(
    () => (limitSize && format === 'jpeg' ? validateRequirement({ width, height, maxKb }) : null),
    [limitSize, format, width, height, maxKb],
  )

  async function handlePicked(files: File[]) {
    const file = files[0]
    if (!file) return
    try {
      setError(null)
      setSourceBytes(file.size)
      const image = await loadCappedImage(file)
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
    setStep('working')
    try {
      const canvas = renderCrop(img, crop, width, height, '#ffffff')
      if (format === 'png') {
        const blob = await canvasToBlob(canvas, 'image/png')
        setResultBlob(blob)
        setResultUrl(URL.createObjectURL(blob))
        setMetSize(true)
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

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Resize Photo" subtitle={`${width}×${height} px`} />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        {step === 'setup' && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Set exact dimensions</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">Enter the width and height the form asks for.</p>
            </div>

            <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Width (px)
                  </span>
                  <div className="mt-1"><NumberField value={width} min={10} invalid={!!issue} onChange={setWidth} ariaLabel="Width in pixels" /></div>
                </label>
                <label>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Height (px)
                  </span>
                  <div className="mt-1"><NumberField value={height} min={10} invalid={!!issue} onChange={setHeight} ariaLabel="Height in pixels" /></div>
                </label>
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Format</span>
                <div className="mt-1.5 flex gap-2">
                  {(['jpeg', 'png'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setFormat(f)
                        // PNG has no quality dial, so a size limit it cannot
                        // honour must not be left sitting there ticked.
                        if (f === 'png') setLimitSize(false)
                      }}
                      className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                        format === f
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                          : 'border-[var(--line-strong)] text-[var(--ink-2)]'
                      }`}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  checked={limitSize && format === 'jpeg'}
                  onChange={(e) => setLimitSize(e.target.checked)}
                  disabled={format === 'png'}
                />
                Limit the file size {format === 'png' && '(JPEG only)'}
              </label>

              {limitSize && format === 'jpeg' && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Maximum size (KB)
                  </span>
                  <div className="mt-1"><NumberField value={maxKb} min={1} invalid={!!issue} onChange={setMaxKb} ariaLabel="Maximum size in KB" /></div>
                </label>
              )}
            </div>

            {issue && (
              <Notice
                title={issue.title}
                actions={issue.fixes.map((fix) => ({
                  label: fix.label,
                  onClick: () => {
                    setWidth(fix.requirement.width)
                    setHeight(fix.requirement.height)
                    setMaxKb(fix.requirement.maxKb)
                  },
                }))}
              >
                {issue.detail}
              </Notice>
            )}

            <Button fullWidth disabled={!!issue} onClick={() => setStep('source')}>
              Continue
            </Button>
          </>
        )}

        {step === 'source' && (
          <>
            <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Add your photo</h2>
            <SourceButtons onCamera={onCamera} onGallery={onGallery} />
          </>
        )}

        {step === 'crop' && img && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Frame your photo</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">
                Everything inside the frame becomes the {width}×{height} px image.
              </p>
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />
            <Button fullWidth onClick={process}>
              Resize photo
            </Button>
          </>
        )}

        {step === 'working' && <ProgressPanel label="Resizing your photo" detail="Cropping and encoding" />}

        {step === 'result' && resultUrl && resultBlob && (
          <ResultView
            heading="Your photo is ready"
            blob={resultBlob}
            filename={`resized-${width}x${height}.${format === 'png' ? 'png' : 'jpg'}`}
            previewUrl={resultUrl}
            previewWidth={width}
            originalBytes={sourceBytes || undefined}
            checks={[
              { label: `${width}×${height} px`, ok: true },
              { label: format.toUpperCase(), ok: true },
              ...(limitSize && format === 'jpeg' ? [{ label: `≤ ${maxKb} KB`, ok: metSize }] : []),
            ]}
            onStartOver={reset}
            startOverLabel="Another photo"
          />
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
