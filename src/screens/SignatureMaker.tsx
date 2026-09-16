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
import { SpecEditor } from '../components/SpecEditor'
import { SignatureIllustration } from '../components/Illustrations'
import { SignaturePad } from '../components/SignaturePad'
import { PenIcon } from '../components/Icons'
import { captureFromCamera, pickImages } from '../lib/picker'
import {
  loadCappedImage,
  releaseImage,
  renderCrop,
  compressToTarget,
  whitenBackground,
  analyseInk,
  forceInkBlack,
  renderTrimmedInk,
  releaseCanvas,
  type CropRect,
} from '../lib/image'
import { formatBytes, kbToBytes } from '../lib/format'
import { SPECS_CHECKED } from '../lib/exams'
import { describeRequirement, type ImageRequirement } from '../lib/requirements'

type Step = 'setup' | 'draw' | 'crop' | 'working' | 'result'

/** What the working screen is doing right now, so it isn't a blank spinner. */
const STAGES = ['Cropping to size', 'Cleaning the paper', 'Checking the ink', 'Fitting the file size'] as const

/** Lets the progress line actually paint between stages. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

const DEFAULT_WIDTH = 140
const DEFAULT_HEIGHT = 60
const DEFAULT_MAX_KB = 20

/** Set when arriving from a Government Exams document. */
interface Prefill {
  requirement?: ImageRequirement
  label?: string
  context?: string
}

export function SignatureMaker() {
  const prefill = (useLocation().state ?? null) as Prefill | null
  const preset = prefill?.requirement

  const [step, setStep] = useState<Step>('setup')
  // One editable spec rather than three loose numbers, so the minimum an exam
  // states travels with the rest of it instead of being quietly dropped.
  const [spec, setSpec] = useState<ImageRequirement>(() => ({
    width: preset?.width ?? DEFAULT_WIDTH,
    height: preset?.height ?? DEFAULT_HEIGHT,
    maxKb: preset?.maxKb ?? DEFAULT_MAX_KB,
    // The floor a board publishes is shown beside the editor, not imposed.
  }))
  const { width, height, maxKb } = spec
  const [cleanBackground, setCleanBackground] = useState(true)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState(0)
  const [drawn, setDrawn] = useState(false)
  // Only meaningful for the photographed path — a signature drawn on screen
  // has no source file to report.
  const [sourceBytes, setSourceBytes] = useState(0)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [metSize, setMetSize] = useState(true)
  const [blueInk, setBlueInk] = useState(false)
  const [convertedToBlack, setConvertedToBlack] = useState(false)
  const [padded, setPadded] = useState(false)
  const cropCanvas = useRef<HTMLCanvasElement | null>(null)

  const aspect = useMemo(() => width / height, [width, height])
  // A file under a stated floor is rejected as surely as one over the ceiling.
  const metMinimum = !spec.minKb || !resultBlob || resultBlob.size >= kbToBytes(spec.minKb)

  async function handlePicked(files: File[]) {
    const file = files[0]
    if (!file) return
    try {
      setError(null)
      setSourceBytes(file.size)
      const image = await loadCappedImage(file)
      setImg((previous) => {
        releaseImage(previous)
        return image
      })
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
    const result = await compressToTarget(canvas, {
      maxBytes: kbToBytes(maxKb),
      // The floor the form states, so a signature that encodes below it is
      // brought up to size rather than handed back destined for rejection.
      minBytes: spec.minKb ? kbToBytes(spec.minKb) : undefined,
      minQuality: 0.3,
    })
    setPadded(result.padded)
    setResultBlob(result.blob)
    setResultUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return URL.createObjectURL(result.blob)
    })
    setMetSize(result.metTarget)
  }

  /** Takes the finished drawing straight to the result: nothing to crop. */
  async function useDrawnSignature(pad: HTMLCanvasElement) {
    setStage(0)
    setStep('working')
    try {
      await nextFrame()
      const canvas = renderTrimmedInk(pad, width, height)
      releaseCanvas(pad)
      cropCanvas.current = canvas
      setBlueInk(false)
      setConvertedToBlack(false)
      setDrawn(true)
      setStage(3)
      await nextFrame()
      await encodeCurrentCanvas()
      setStep('result')
    } catch {
      setError('Something went wrong while preparing the signature.')
      setStep('draw')
    }
  }

  async function process() {
    if (!img || !crop) return
    setStage(0)
    setStep('working')
    try {
      await nextFrame()
      const canvas = renderCrop(img, crop, width, height, '#ffffff')

      setStage(1)
      await nextFrame()
      if (cleanBackground) whitenBackground(canvas)
      cropCanvas.current = canvas

      setStage(2)
      await nextFrame()
      const ink = analyseInk(canvas)
      setBlueInk(ink.isBlue)
      setConvertedToBlack(false)
      setDrawn(false)

      setStage(3)
      await nextFrame()
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
    setResultUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
    setDrawn(false)
    setPadded(false)
    setSourceBytes(0)
    setImg((previous) => {
      releaseImage(previous)
      return null
    })
    setCrop(null)
    setResultBlob(null)
    setError(null)
    setBlueInk(false)
    setConvertedToBlack(false)
    cropCanvas.current = null
    setStep('setup')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader
        title={prefill?.label ?? 'Signature Maker'}
        subtitle={
          prefill?.context ? `${prefill.context} · ${describeRequirement(spec)}` : describeRequirement(spec)
        }
      />

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
                Sign on the screen with a finger or stylus, or photograph a signature on plain white paper.
              </p>
            </div>

            <SpecEditor
              value={spec}
              onChange={setSpec}
              checked={SPECS_CHECKED}
              publishedMinKb={preset?.minKb}
              publishedBy={prefill?.context}
              source={prefill?.context ? `the ${prefill.context} spec` : undefined}
            />

            <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <label className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  checked={cleanBackground}
                  onChange={(e) => setCleanBackground(e.target.checked)}
                />
                Clean the paper to plain white
              </label>
            </div>

            <button
              onClick={() => {
                setError(null)
                setStep('draw')
              }}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] py-5 active:bg-black/[0.03]"
            >
              <PenIcon width={22} height={22} className="text-[var(--accent)]" />
              <span className="text-[15px] font-bold text-[var(--accent-ink)]">Sign on this screen</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--line)]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">or</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>

            <SourceButtons onCamera={onCamera} onGallery={onGallery} />
          </>
        )}

        {step === 'draw' && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Sign here</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">
                Use a finger or a stylus. It is trimmed and fitted to {width}×{height} px for you.
              </p>
            </div>
            <SignaturePad aspect={aspect} onDone={useDrawnSignature} onCancel={() => setStep('setup')} />
          </>
        )}

        {step === 'crop' && img && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Frame your signature</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">
                Crop tight to the signature. Leave out any printed name.
              </p>
              {sourceBytes > 0 && (
                <p className="mt-1 text-xs text-[var(--ink-3)]">Original: {formatBytes(sourceBytes)}</p>
              )}
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />
            <Button fullWidth onClick={process}>
              Prepare signature
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                setError(null)
                setCrop(null)
                setImg((previous) => {
                  releaseImage(previous)
                  return null
                })
                setStep('setup')
              }}
            >
              Use a different image
            </Button>
          </>
        )}

        {step === 'working' && (
          <ProgressPanel
            label="Preparing your signature"
            fraction={(stage + 1) / STAGES.length}
            detail={STAGES[stage]}
          />
        )}

        {step === 'result' && resultUrl && resultBlob && (
          <div className="space-y-4">
            <ResultView
              heading="Your signature is ready"
              blob={resultBlob}
              filename={`signature-${width}x${height}.jpg`}
              previewUrl={resultUrl}
              previewWidth={width}
              // A drawn signature has no source file to compare against; a
              // photographed one does, and gets the real Before/After.
              originalBytes={drawn ? undefined : sourceBytes || undefined}
              checks={[
                { label: `${width}×${height} px`, ok: true },
                { label: `≤ ${maxKb} KB`, ok: metSize },
                ...(spec.minKb ? [{ label: `≥ ${spec.minKb} KB`, ok: metMinimum }] : []),
                { label: blueInk ? 'Blue ink' : 'Black ink', ok: !blueInk },
              ]}
              // Only things actually wrong. A confirmation that the ink was
              // converted used to head this chain, which hid the fact that the
              // file was still under the form's floor behind a cheerful note.
              warning={
                !metSize
                  ? `Couldn't fit under ${maxKb} KB at usable quality.`
                  : !metMinimum
                    ? `This form asks for at least ${spec.minKb} KB and your signature came to ${formatBytes(resultBlob.size)}. Ink on white paper compresses to very little, and at ${width}×${height} px there is no quality left to spend — larger dimensions are the only thing that would add real detail. Uploading this may be rejected.`
                    : undefined
              }
              // Everything that went right and is worth knowing, in one place.
              note={
                [
                  padded &&
                    `Padded up to ${spec.minKb} KB to clear this form's minimum — the signature itself is untouched, at full quality.`,
                  convertedToBlack && 'Ink converted to black and the paper cleaned to white.',
                  drawn && 'Drawn on screen, trimmed to the ink and fitted to size.',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onStartOver={reset}
              startOverLabel="Another signature"
            />

            {blueInk && (
              <Notice
                tone="warn"
                title="This looks like blue ink"
                actions={[{ label: 'Convert to black ink', onClick: convertInk }]}
              >
                SSC, IBPS and UPSC all ask for signatures in black ink on white paper, and a blue one is a common
                reason an application is sent back. Convert it here if your form says black.
              </Notice>
            )}
          </div>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
