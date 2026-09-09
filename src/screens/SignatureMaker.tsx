import { useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SourceButtons } from '../components/SourceButtons'
import { ImageCropper } from '../components/ImageCropper'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { Notice } from '../components/Notice'
import { NumberField } from '../components/NumberField'
import { SignatureIllustration } from '../components/Illustrations'
import { captureFromCamera, pickImages } from '../lib/picker'
import {
  loadCappedImage,
  renderCrop,
  compressToTarget,
  whitenBackground,
  analyseInk,
  forceInkBlack,
  type CropRect,
} from '../lib/image'
import { kbToBytes } from '../lib/format'

type Step = 'setup' | 'crop' | 'working' | 'result'

const DEFAULT_WIDTH = 140
const DEFAULT_HEIGHT = 60
const DEFAULT_MAX_KB = 20

/** Set when arriving from a Government Exams document. */
interface Prefill {
  requirement?: { width: number; height: number; maxKb: number }
  label?: string
  context?: string
}

export function SignatureMaker() {
  const prefill = (useLocation().state ?? null) as Prefill | null
  const preset = prefill?.requirement

  const [step, setStep] = useState<Step>('setup')
  const [width, setWidth] = useState(preset?.width ?? DEFAULT_WIDTH)
  const [height, setHeight] = useState(preset?.height ?? DEFAULT_HEIGHT)
  const [maxKb, setMaxKb] = useState(preset?.maxKb ?? DEFAULT_MAX_KB)
  const [cleanBackground, setCleanBackground] = useState(true)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [metSize, setMetSize] = useState(true)
  const [blueInk, setBlueInk] = useState(false)
  const [convertedToBlack, setConvertedToBlack] = useState(false)
  const cropCanvas = useRef<HTMLCanvasElement | null>(null)

  const aspect = useMemo(() => width / height, [width, height])

  async function handlePicked(files: File[]) {
    const file = files[0]
    if (!file) return
    try {
      setError(null)
      const image = await loadCappedImage(file)
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

  async function encodeCurrentCanvas() {
    const canvas = cropCanvas.current!
    const result = await compressToTarget(canvas, { maxBytes: kbToBytes(maxKb), minQuality: 0.3 })
    setResultBlob(result.blob)
    setResultUrl(URL.createObjectURL(result.blob))
    setMetSize(result.metTarget)
  }

  async function process() {
    if (!img || !crop) return
    setStep('working')
    try {
      const canvas = renderCrop(img, crop, width, height, '#ffffff')
      if (cleanBackground) whitenBackground(canvas)
      cropCanvas.current = canvas

      const ink = analyseInk(canvas)
      setBlueInk(ink.isBlue)
      setConvertedToBlack(false)
      await encodeCurrentCanvas()
      setStep('result')
    } catch {
      setError('Something went wrong while preparing the signature.')
      setStep('crop')
    }
  }

  async function convertInk() {
    if (!cropCanvas.current) return
    forceInkBlack(cropCanvas.current)
    setConvertedToBlack(true)
    setBlueInk(false)
    await encodeCurrentCanvas()
  }

  function reset() {
    setImg(null)
    setCrop(null)
    setResultBlob(null)
    setResultUrl(null)
    setError(null)
    setBlueInk(false)
    setConvertedToBlack(false)
    cropCanvas.current = null
    setStep('setup')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title={prefill?.label ?? 'Signature Maker'} subtitle={prefill?.context ? `${prefill.context} · ${width}×${height} px · ≤ ${maxKb} KB` : `${width}×${height} px · ≤ ${maxKb} KB`} />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        {step === 'setup' && (
          <>
            <div className="flex flex-col items-center pt-1 text-center">
              <SignatureIllustration size={190} />
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--ink)]">Add your signature</h2>
              <p className="mx-auto mt-1.5 max-w-[32ch] text-sm leading-relaxed text-[var(--ink-2)]">
                Sign on plain white paper in black ink, then photograph it.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="grid grid-cols-3 gap-3">
                <label>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Width
                  </span>
                  <div className="mt-1">
                    <NumberField value={width} min={40} onChange={setWidth} ariaLabel="Width in pixels" className="px-2 text-sm" />
                  </div>
                </label>
                <label>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Height
                  </span>
                  <div className="mt-1">
                    <NumberField value={height} min={20} onChange={setHeight} ariaLabel="Height in pixels" className="px-2 text-sm" />
                  </div>
                </label>
                <label>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Max KB
                  </span>
                  <div className="mt-1">
                    <NumberField value={maxKb} min={1} onChange={setMaxKb} ariaLabel="Maximum size in KB" className="px-2 text-sm" />
                  </div>
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  checked={cleanBackground}
                  onChange={(e) => setCleanBackground(e.target.checked)}
                />
                Clean the paper to plain white
              </label>
            </div>

            <SourceButtons onCamera={onCamera} onGallery={onGallery} />
          </>
        )}

        {step === 'crop' && img && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Frame your signature</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">
                Crop tight to the signature. Leave out any printed name.
              </p>
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />
            <Button fullWidth onClick={process}>
              Prepare signature
            </Button>
          </>
        )}

        {step === 'working' && <ProgressPanel label="Preparing your signature" detail="Cropping and checking ink" />}

        {step === 'result' && resultUrl && resultBlob && (
          <div className="space-y-4">
            {blueInk && (
              <Notice
                tone="danger"
                title="Blue ink detected"
                actions={[{ label: 'Convert to black ink', onClick: convertInk }]}
              >
                SSC, UPSC and IBPS ask for signatures in black ink. Blue is one of the most common reasons a signature
                is rejected as unclear.
              </Notice>
            )}
            <ResultView
              heading="Your signature is ready"
              blob={resultBlob}
              filename={`signature-${width}x${height}.jpg`}
              previewUrl={resultUrl}
              previewWidth={width}
              checks={[
                { label: `${width}×${height} px`, ok: true },
                { label: `≤ ${maxKb} KB`, ok: metSize },
                { label: blueInk ? 'Blue ink' : 'Black ink', ok: !blueInk },
              ]}
              warning={
                convertedToBlack
                  ? 'Ink converted to black and the paper cleaned to white.'
                  : metSize
                    ? undefined
                    : `Couldn't fit under ${maxKb} KB at usable quality.`
              }
              onStartOver={reset}
              startOverLabel="Another signature"
            />
          </div>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
