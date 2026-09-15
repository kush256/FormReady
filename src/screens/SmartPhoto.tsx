import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SourceButtons } from '../components/SourceButtons'
import { ImageCropper } from '../components/ImageCropper'
import { ProgressPanel } from '../components/ProgressPanel'
import { ResultView } from '../components/ResultView'
import { SpecChip } from '../components/SpecChip'
import { Notice } from '../components/Notice'
import { NumberField } from '../components/NumberField'
import { SizeField } from '../components/SizeField'
import { SpecEditor } from '../components/SpecEditor'
import { PhotoIllustration } from '../components/Illustrations'
import { ChevronRightIcon } from '../components/Icons'
import { captureFromCamera, pickImages } from '../lib/picker'
import {
  loadCappedImage,
  releaseImage,
  renderCrop,
  compressToTarget,
  releaseCanvas,
  type CropRect,
} from '../lib/image'
import { describeRequirement, explainMaxQuality, type ImageRequirement } from '../lib/requirements'
import { formatBytes, kbToBytes } from '../lib/format'
import { SPECS_CHECKED } from '../lib/exams'
import {
  assessPhoto,
  preparePhoto,
  readPhotoFacts,
  type FitAssessment,
  type PhotoFacts,
  type PreparedPhoto,
} from '../lib/fit'

interface Preset extends ImageRequirement {
  label: string
  note: string
}

// Common starting points. Always confirm against the live notification for
// the exam being applied to — portals do change these between cycles.
const PRESETS: Preset[] = [
  // SSC states a band, not a ceiling: a photo under 20 KB is rejected as surely
  // as one over 50.
  { label: 'SSC / IBPS photo', note: 'Most recruitment portals', width: 200, height: 230, minKb: 20, maxKb: 50 },
  // UPSC's own band is 20-300 KB. A 50 KB ceiling here was ours, not theirs,
  // and it threw away five sixths of what the portal accepts.
  { label: 'UPSC photo', note: 'Square crop, 20–300 KB', width: 350, height: 350, minKb: 20, maxKb: 300 },
  { label: 'Passport size', note: 'Larger print-quality photo', width: 413, height: 531, maxKb: 100 },
  { label: 'Admit card photo', note: 'Smaller exam portals', width: 150, height: 200, maxKb: 30 },
]

type Step =
  | 'requirement'
  | 'source'
  | 'crop'
  | 'working'
  | 'result'
  // The size-first arm. It takes the photo before asking anything, because
  // someone who does not know their dimensions cannot answer first.
  | 'sizeSource'
  | 'sizeTarget'
  | 'sizeChecking'
  | 'sizeVerdict'

/**
 * Which of the three ways in the user took.
 *
 * `preset` and `custom` both mean "the form told me exact numbers" and keep the
 * original order: requirement, then photo. `sizeFirst` means "I only know the
 * KB limit" and runs the other way round.
 */
type Mode = 'preset' | 'custom' | 'sizeFirst'

/** Set when arriving from a Government Exams document. */
interface Prefill {
  requirement?: ImageRequirement
  label?: string
  context?: string
}

/** Lets a progress update paint before the next blocking step takes the thread. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function SmartPhoto() {
  const prefill = (useLocation().state ?? null) as Prefill | null
  const preset = prefill?.requirement

  // Arriving from an exam means the requirement is already known, so skip
  // straight to picking the photo.
  const [step, setStep] = useState<Step>(preset ? 'source' : 'requirement')
  const [presetIndex, setPresetIndex] = useState(0)
  const [mode, setMode] = useState<Mode>(preset ? 'custom' : 'preset')
  /**
   * The spec the photo will actually be made to.
   *
   * It starts from the exam deep link or the chosen preset, and stays editable
   * right up to the moment the work runs: our numbers are a record of what a
   * commission published at some point, not of what the form in front of the
   * user says today.
   */
  // The floor starts off, whoever published it: a ceiling is the number every
  // form states, a floor the exception. What the board published is kept beside
  // the editor and restored the moment the user asks for it.
  const [spec, setSpec] = useState<ImageRequirement>(() => {
    const from = preset ?? PRESETS[0]
    return { width: from.width, height: from.height, maxKb: from.maxKb }
  })

  // Size-first state. This arm keeps the File rather than a decoded image:
  // nothing is decoded at full size, and every render goes straight from the
  // file to the size actually wanted.
  const [facts, setFacts] = useState<PhotoFacts | null>(null)
  /**
   * The photo decoded once, reused by every measurement and the final render.
   * Decoding per step is what ran the WebView out of memory on a real device,
   * after which nothing could draw again until the app was restarted.
   */
  const photoRef = useRef<PreparedPhoto | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [budgetBytes, setBudgetBytes] = useState(100 * 1024)
  const [useDims, setUseDims] = useState(false)
  const [dims, setDims] = useState({ width: 0, height: 0 })
  const [assessment, setAssessment] = useState<FitAssessment | null>(null)
  const [checkFraction, setCheckFraction] = useState(0)
  const [outDims, setOutDims] = useState({ width: 0, height: 0 })
  /** Drops the result of a check the user has already navigated away from. */
  const checkRun = useRef(0)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceBytes, setSourceBytes] = useState(0)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [stage, setStage] = useState({ label: 'Cropping to size', fraction: 0 })
  const [metSize, setMetSize] = useState(true)
  /** The quality the encoder settled on, which says whether headroom is spendable. */
  const [resultQuality, setResultQuality] = useState(1)

  // Leaving the screen must hand the decoded photo back, not wait for the
  // collector to notice. On a phone that wait is the difference between the
  // next photo working and the app having no memory left to draw with.
  useEffect(() => {
    return () => {
      photoRef.current?.close()
      photoRef.current = null
    }
  }, [])

  const target: ImageRequirement = spec
  /** The floor the form itself states, which is not the same as one in force. */
  const publishedMinKb = mode === 'preset' ? PRESETS[presetIndex].minKb : prefill?.requirement?.minKb
  const publishedBy = prefill?.context ?? (mode === 'preset' ? PRESETS[presetIndex].label : undefined)
  // A file under a stated floor is rejected as surely as one over the ceiling.
  const metMinimum = !target.minKb || !resultBlob || resultBlob.size >= kbToBytes(target.minKb)
  const aspect = useMemo(() => target.width / target.height, [target.width, target.height])

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

  /** Size-first: decode the photo once, read what it is, and ask for a size. */
  async function handleSizePicked(files: File[]) {
    const picked = files[0]
    if (!picked) return
    try {
      setError(null)
      const found = await readPhotoFacts(picked)
      const prepared = await preparePhoto(picked, found)
      photoRef.current?.close()
      photoRef.current = prepared
      setFacts(found)
      setSourceBytes(picked.size)
      setDims({ width: found.width, height: found.height })
      setSourceUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return URL.createObjectURL(picked)
      })
      setStep('sizeTarget')
    } catch {
      setError('Could not open that photo. Try a different file.')
    }
  }

  async function onSizeCamera() {
    const captured = await captureFromCamera()
    if (captured) handleSizePicked([captured])
  }
  async function onSizeGallery() {
    const picked = await pickImages(false)
    if (picked.length) handleSizePicked(picked)
  }

  /**
   * Measures the photo against the size asked for.
   *
   * Takes as long as it takes — three or four test encodes, typically under a
   * fifth of a second. Padding that out to feel considered would only be
   * pretending.
   */
  async function runCheck(nextBudget = budgetBytes, nextDims = dims, nextUseDims = useDims) {
    const photo = photoRef.current
    if (!photo) return
    const run = ++checkRun.current
    setCheckFraction(0)
    setStep('sizeChecking')
    try {
      await nextFrame()
      const requested = nextUseDims ? { width: nextDims.width, height: nextDims.height } : null
      const found = await assessPhoto(photo, nextBudget, requested, (fraction) => {
        if (run === checkRun.current) setCheckFraction(fraction)
      })
      // The user moved on while this was running; its answer is stale.
      if (run !== checkRun.current) return
      setAssessment(found)
      setStep('sizeVerdict')
    } catch (e) {
      if (run !== checkRun.current) return
      // Name the actual failure. A generic sentence taught us nothing the first
      // time this went wrong on a device we cannot reach.
      setError(`Could not check that photo. ${e instanceof Error ? e.message : ''}`.trim())
      setStep('sizeTarget')
    }
  }

  /** Size-first: render at the measured dimensions, then spend any headroom on quality. */
  async function processSizeFirst() {
    const photo = photoRef.current
    if (!photo || !assessment) return
    setStage({ label: 'Resizing your photo', fraction: 0.05 })
    setStep('working')
    try {
      await nextFrame()
      // The same photo and the same call the measurement used, so what was
      // promised on the verdict screen is what actually gets made.
      const canvas = photo.render(assessment.width, assessment.height)

      setStage({ label: 'Finding the best quality that fits', fraction: 0.2 })
      await nextFrame()
      const result = await compressToTarget(canvas, {
        maxBytes: budgetBytes,
        onProgress: (fraction) =>
          setStage({ label: 'Finding the best quality that fits', fraction: 0.2 + fraction * 0.75 }),
      })
      releaseCanvas(canvas)

      setStage({ label: 'Almost there', fraction: 1 })
      setOutDims({ width: assessment.width, height: assessment.height })
      setResultBlob(result.blob)
      setResultUrl(URL.createObjectURL(result.blob))
      setMetSize(result.metTarget)
      setResultQuality(result.quality)
      setStep('result')
    } catch (e) {
      setError(`Could not prepare that photo. ${e instanceof Error ? e.message : ''}`.trim())
      setStep('sizeVerdict')
    }
  }

  /** Wrong photo picked: back to the picker without losing the numbers. */
  function changePhoto() {
    setError(null)
    setCrop(null)
    setImg((previous) => {
      releaseImage(previous)
      return null
    })
    setStep('source')
  }

  /** The same, for the size-first arm, which holds a decoded photo to release. */
  function changeSizePhoto() {
    setError(null)
    setAssessment(null)
    photoRef.current?.close()
    photoRef.current = null
    setFacts(null)
    setSourceUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
    setStep('sizeSource')
  }

  async function process() {
    if (!img || !crop) return
    setStage({ label: 'Cropping to size', fraction: 0.05 })
    setStep('working')
    try {
      // Hand the frame back so the panel is on screen before the crop takes
      // the thread, rather than after.
      await nextFrame()
      const canvas = renderCrop(img, crop, target.width, target.height, '#ffffff')

      setStage({ label: 'Finding the best quality that fits', fraction: 0.15 })
      await nextFrame()
      const result = await compressToTarget(canvas, {
        maxBytes: kbToBytes(target.maxKb),
        onProgress: (fraction) =>
          setStage({ label: 'Finding the best quality that fits', fraction: 0.15 + fraction * 0.8 }),
      })
      releaseCanvas(canvas)

      setStage({ label: 'Almost there', fraction: 1 })
      setResultBlob(result.blob)
      setResultUrl(URL.createObjectURL(result.blob))
      setMetSize(result.metTarget)
      setResultQuality(result.quality)
      setStep('result')
    } catch {
      setError('Something went wrong while preparing the photo.')
      setStep('crop')
    }
  }

  function reset() {
    setImg((previous) => {
      releaseImage(previous)
      return null
    })
    setCrop(null)
    setResultBlob(null)
    setResultUrl(null)
    setError(null)
    setAssessment(null)
    photoRef.current?.close()
    photoRef.current = null
    setSourceUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
    // Another photo, same job: size-first goes back to the picker, not to a
    // question the user already answered.
    setStep(preset ? 'source' : mode === 'sizeFirst' ? 'sizeSource' : 'requirement')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader
        title={prefill?.label ?? 'Smart Photo'}
        subtitle={
          prefill?.context
            ? `${prefill.context} · ${describeRequirement(target)}`
            : mode === 'sizeFirst'
              ? step === 'result' && resultBlob
                ? `${outDims.width}×${outDims.height} px · ${formatBytes(resultBlob.size)}`
                : `≤ ${formatBytes(budgetBytes)}`
              : step === 'requirement'
                ? undefined
                : describeRequirement(target)
        }
      />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && (
          <p className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        {step === 'requirement' && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">What does the form need?</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">Pick a common requirement, or enter your own.</p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-3)]">
                These presets follow recent notifications, checked in {SPECS_CHECKED}. Confirm them against the form
                you are filling — every number stays editable before your photo is made.
              </p>
            </div>

            <div className="space-y-2">
              {PRESETS.map((preset, i) => {
                const active = mode === 'preset' && presetIndex === i
                return (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setMode('preset')
                      setPresetIndex(i)
                      setSpec({ width: preset.width, height: preset.height, maxKb: preset.maxKb })
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--line)] bg-[var(--surface)]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[var(--ink)]">{preset.label}</span>
                      <span className="block text-xs text-[var(--ink-2)]">{preset.note}</span>
                    </span>
                    <SpecChip state={active ? 'ok' : 'neutral'} icon={false}>
                      {preset.width}×{preset.height} · {preset.minKb ? `${preset.minKb}–${preset.maxKb}` : `≤ ${preset.maxKb}`}KB
                    </SpecChip>
                  </button>
                )
              })}

              {/* One card, not two. Typing width, height and a limit up front
                  was asking for numbers most people do not have, and the
                  measured flow below covers both cases: a size limit always,
                  exact pixels only when the form names them. */}
              <button
                onClick={() => {
                  setMode('sizeFirst')
                  setStep('sizeSource')
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--ink)]">Custom requirement</span>
                  <span className="block text-xs text-[var(--ink-2)]">
                    Just tell us the size limit — we work out the rest
                  </span>
                </span>
                <ChevronRightIcon width={18} height={18} className="shrink-0 text-[var(--ink-3)]" />
              </button>
            </div>

            <Button fullWidth onClick={() => setStep('source')}>
              Continue
            </Button>
          </>
        )}

        {step === 'source' && (
          <>
            <div className="flex flex-col items-center pt-1 text-center">
              <PhotoIllustration size={190} />
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--ink)]">Add your photo</h2>
              <p className="mx-auto mt-1.5 max-w-[30ch] text-sm leading-relaxed text-[var(--ink-2)]">
                Plain background, face centred and clearly visible.
              </p>
            </div>
            <SourceButtons onCamera={onCamera} onGallery={onGallery} />
          </>
        )}

        {step === 'crop' && img && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Frame your photo</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">
                Everything inside the frame becomes the {target.width}×{target.height} px photo.
              </p>
              {sourceBytes > 0 && (
                <p className="mt-1 text-xs text-[var(--ink-3)]">Original: {formatBytes(sourceBytes)}</p>
              )}
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />

            <SpecEditor
              value={spec}
              onChange={setSpec}
              checked={SPECS_CHECKED}
              publishedMinKb={publishedMinKb}
              publishedBy={publishedBy}
              source={
                prefill?.context
                  ? `the ${prefill.context} spec`
                  : mode === 'preset'
                    ? `the ${PRESETS[presetIndex].label} preset`
                    : undefined
              }
            />

            <Button fullWidth onClick={process}>
              Prepare photo
            </Button>
            <Button variant="ghost" fullWidth onClick={changePhoto}>
              Use a different photo
            </Button>
          </>
        )}

        {step === 'sizeSource' && (
          <>
            <div className="flex flex-col items-center pt-1 text-center">
              <PhotoIllustration size={190} />
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--ink)]">
                Start with your photo
              </h2>
              <p className="mx-auto mt-1.5 max-w-[32ch] text-sm leading-relaxed text-[var(--ink-2)]">
                We will read its size and work out what fits. No pixel numbers needed.
              </p>
            </div>
            <SourceButtons onCamera={onSizeCamera} onGallery={onSizeGallery} />
          </>
        )}

        {step === 'sizeTarget' && facts && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Here is your photo</h2>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              {sourceUrl && (
                <img
                  src={sourceUrl}
                  alt="The photo you chose"
                  className="mx-auto mb-3 block max-h-44 rounded-lg border border-[var(--line)] bg-white"
                />
              )}
              <div className="flex flex-wrap justify-center gap-1.5">
                <SpecChip icon={false}>
                  {facts.width}×{facts.height} px
                </SpecChip>
                <SpecChip icon={false}>{formatBytes(facts.bytes)}</SpecChip>
                <SpecChip icon={false}>{facts.format}</SpecChip>
              </div>
              {/* Picking the wrong photo used to mean leaving the screen
                  altogether and starting the tool again. */}
              <button
                onClick={changeSizePhoto}
                className="mx-auto mt-3 block rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--accent)] active:bg-[var(--surface-sunk)]"
              >
                Use a different photo
              </button>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                How small does it need to be?
              </span>
              <div className="mt-1.5">
                <SizeField bytes={budgetBytes} onChange={setBudgetBytes} />
              </div>
              <p className="mt-1.5 text-xs text-[var(--ink-2)]">
                The number the form asks for. Anything under it is accepted.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={useDims}
                  onChange={(e) => setUseDims(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="text-sm font-semibold text-[var(--ink)]">Set exact pixel dimensions</span>
              </label>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-2)]">
                Only if the form names exact pixels. Otherwise we pick the largest size that fits, which
                is what keeps a photo looking sharp.
              </p>

              {useDims && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(
                    [
                      ['Width', 'width'],
                      ['Height', 'height'],
                    ] as const
                  ).map(([label, key]) => (
                    <label key={key}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                        {label}
                      </span>
                      <div className="mt-1">
                        <NumberField
                          value={dims[key]}
                          min={20}
                          ariaLabel={label}
                          onChange={(v) => setDims({ ...dims, [key]: v })}
                          className="px-2 text-sm"
                        />
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Button fullWidth disabled={budgetBytes < 1024} onClick={() => runCheck()}>
              Check my photo
            </Button>
          </>
        )}

        {step === 'sizeChecking' && (
          <ProgressPanel
            label="Checking your photo"
            fraction={checkFraction}
            detail="Test-encoding it at a few sizes"
          />
        )}

        {step === 'sizeVerdict' && assessment && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">
                {assessment.verdict === 'good'
                  ? 'This will work'
                  : assessment.verdict === 'roomToGrow'
                    ? 'Your limit allows a bigger photo'
                    : `${formatBytes(budgetBytes)} is tight for ${assessment.width}×${assessment.height} px`}
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <SpecChip icon={false}>
                {assessment.width}×{assessment.height} px
              </SpecChip>
              <SpecChip icon={false}>about {formatBytes(assessment.expectedBytes)}</SpecChip>
              <SpecChip icon={false}>JPG</SpecChip>
            </div>

            {assessment.verdict === 'good' && (
              <div className="rounded-2xl border border-[var(--ok)]/35 bg-[var(--ok-soft)] p-4">
                <p className="text-sm leading-relaxed text-[var(--ink)]">
                  {assessment.chosen
                    ? assessment.largest.atSourceLimit
                      ? `Your photo will come out at ${assessment.width}×${assessment.height} px and about ${formatBytes(assessment.expectedBytes)}, inside your ${formatBytes(budgetBytes)} limit. That is the photo at its full size — making it larger would only invent detail that is not there.`
                      : `Your photo will come out at ${assessment.width}×${assessment.height} px and about ${formatBytes(assessment.expectedBytes)}, inside your ${formatBytes(budgetBytes)} limit. That is the largest it can be without the quality dropping.`
                    : `${assessment.width}×${assessment.height} px fits inside ${formatBytes(budgetBytes)} with room to spare. Nothing needs changing.`}
                </p>
              </div>
            )}

            {assessment.verdict === 'roomToGrow' && (
              <Notice
                title="Your limit allows a bigger photo"
                actions={[
                  {
                    label: `Use ${assessment.largest.width}×${assessment.largest.height}`,
                    onClick: () => {
                      const next = { width: assessment.largest.width, height: assessment.largest.height }
                      setDims(next)
                      runCheck(budgetBytes, next, true)
                    },
                  },
                  {
                    label: 'Let the app choose',
                    onClick: () => {
                      setUseDims(false)
                      runCheck(budgetBytes, dims, false)
                    },
                  },
                ]}
              >
                {`At ${assessment.width}×${assessment.height} px this photo only comes to ${formatBytes(assessment.bestBytes)} — that is all the detail those dimensions can hold, even at the highest quality, so ${formatBytes(budgetBytes - assessment.bestBytes)} of your ${formatBytes(budgetBytes)} limit cannot be used. At ${assessment.largest.width}×${assessment.largest.height} px it would use the limit properly and look noticeably sharper.`}
              </Notice>
            )}

            {assessment.verdict === 'tight' && (
              <Notice
                title="This size will cost some clarity"
                actions={[
                  ...(assessment.clearBytes
                    ? [
                        {
                          label: `Allow ${Math.ceil(assessment.clearBytes / 1024)} KB`,
                          onClick: () => {
                            const next = Math.ceil(assessment.clearBytes! / 1024) * 1024
                            setBudgetBytes(next)
                            runCheck(next, dims, useDims)
                          },
                        },
                      ]
                    : []),
                  ...(assessment.chosen
                    ? []
                    : [
                        {
                          label: `Use ${assessment.largest.width}×${assessment.largest.height}`,
                          onClick: () => {
                            const next = {
                              width: assessment.largest.width,
                              height: assessment.largest.height,
                            }
                            setDims(next)
                            runCheck(budgetBytes, next, true)
                          },
                        },
                      ]),
                ]}
              >
                {assessment.clearBytes
                  ? `Fitting ${assessment.width}×${assessment.height} px into ${formatBytes(budgetBytes)} means dropping the quality far enough to see. Keeping this photo clear at those dimensions needs about ${formatBytes(assessment.clearBytes)}. If ${formatBytes(budgetBytes)} is fixed, the largest size that stays clear inside it is ${assessment.largest.width}×${assessment.largest.height} px.`
                  : `Even at its smallest sensible size this photo does not fit inside ${formatBytes(budgetBytes)}. It will be made as small as it can go, which may look rough.`}
              </Notice>
            )}

            <Button fullWidth onClick={processSizeFirst}>
              {assessment.verdict === 'good'
                ? 'Make my photo'
                : assessment.verdict === 'roomToGrow'
                  ? `Keep ${assessment.width}×${assessment.height} anyway`
                  : 'Squeeze it anyway'}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setStep('sizeTarget')}>
              Change the numbers
            </Button>
            <Button variant="ghost" fullWidth onClick={changeSizePhoto}>
              Use a different photo
            </Button>
          </>
        )}

        {step === 'working' && (
          <ProgressPanel label="Preparing your photo" fraction={stage.fraction} detail={stage.label} />
        )}

        {step === 'result' && resultUrl && resultBlob && (
          <ResultView
            heading="Your photo is ready"
            blob={resultBlob}
            filename={
              mode === 'sizeFirst'
                ? `photo-${outDims.width}x${outDims.height}.jpg`
                : `photo-${target.width}x${target.height}.jpg`
            }
            previewUrl={resultUrl}
            previewWidth={mode === 'sizeFirst' ? Math.min(outDims.width, 320) : target.width}
            originalBytes={sourceBytes || undefined}
            checks={
              mode === 'sizeFirst'
                ? [
                    { label: `${outDims.width}×${outDims.height} px`, ok: true },
                    { label: `≤ ${formatBytes(budgetBytes)}`, ok: metSize },
                    { label: 'JPG', ok: true },
                  ]
                : [
                    { label: `${target.width}×${target.height} px`, ok: true },
                    { label: `≤ ${target.maxKb} KB`, ok: metSize },
                    ...(target.minKb ? [{ label: `≥ ${target.minKb} KB`, ok: metMinimum }] : []),
                    { label: 'JPG', ok: true },
                  ]
            }
            warning={
              !metSize
                ? mode === 'sizeFirst'
                  ? `This photo couldn't get under ${formatBytes(budgetBytes)} at usable quality.`
                  : `This photo couldn't go under ${target.maxKb} KB at usable quality. A plainer background usually compresses further.`
                : mode !== 'sizeFirst' && !metMinimum
                  ? `This form asks for at least ${target.minKb} KB and your photo came to ${formatBytes(resultBlob.size)}. At ${target.width}×${target.height} px it is already at the highest quality there is, so the file cannot be made larger without more pixels — which the form does not allow. A normal photograph of a person usually clears the minimum; a plain or very dark image often does not. Uploading this may be rejected.`
                  : undefined
            }
            note={
              mode === 'sizeFirst'
                ? assessment?.largest.atSourceLimit && assessment.chosen
                  ? `That is your photo at its full size — ${outDims.width}×${outDims.height} px. It came to ${formatBytes(resultBlob.size)} of the ${formatBytes(budgetBytes)} allowed, and enlarging it further would only invent detail that was never in the photo.`
                  : undefined
                : (explainMaxQuality({ quality: resultQuality, bytes: resultBlob.size }, target) ?? undefined)
            }
            onStartOver={reset}
            startOverLabel="Another photo"
          />
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
