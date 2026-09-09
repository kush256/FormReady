import { useMemo, useState } from 'react'
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
import { captureFromCamera, pickImages } from '../lib/picker'
import { loadCappedImage, renderCrop, compressToTarget, type CropRect } from '../lib/image'
import { validateRequirement, type ImageRequirement } from '../lib/requirements'
import { kbToBytes } from '../lib/format'

interface Preset extends ImageRequirement {
  label: string
  note: string
}

// Common starting points. Always confirm against the live notification for
// the exam being applied to — portals do change these between cycles.
const PRESETS: Preset[] = [
  { label: 'SSC / IBPS photo', note: 'Most recruitment portals', width: 200, height: 230, maxKb: 50 },
  { label: 'UPSC photo', note: 'Square crop', width: 350, height: 350, maxKb: 50 },
  { label: 'Passport size', note: 'Larger print-quality photo', width: 413, height: 531, maxKb: 100 },
  { label: 'Admit card photo', note: 'Smaller exam portals', width: 150, height: 200, maxKb: 30 },
]

type Step = 'requirement' | 'source' | 'crop' | 'working' | 'result'

/** Set when arriving from a Government Exams document. */
interface Prefill {
  requirement?: ImageRequirement
  label?: string
  context?: string
}

export function SmartPhoto() {
  const prefill = (useLocation().state ?? null) as Prefill | null
  const preset = prefill?.requirement

  // Arriving from an exam means the requirement is already known, so skip
  // straight to picking the photo.
  const [step, setStep] = useState<Step>(preset ? 'source' : 'requirement')
  const [presetIndex, setPresetIndex] = useState(0)
  const [useCustom, setUseCustom] = useState(Boolean(preset))
  const [custom, setCustom] = useState<ImageRequirement>(preset ?? { width: 200, height: 230, maxKb: 50 })

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceBytes, setSourceBytes] = useState(0)

  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [metSize, setMetSize] = useState(true)

  const target: ImageRequirement = useCustom ? custom : PRESETS[presetIndex]
  const aspect = useMemo(() => target.width / target.height, [target.width, target.height])
  const issue = useMemo(() => (useCustom ? validateRequirement(custom) : null), [useCustom, custom])

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
      const canvas = renderCrop(img, crop, target.width, target.height, '#ffffff')
      const result = await compressToTarget(canvas, { maxBytes: kbToBytes(target.maxKb) })
      setResultBlob(result.blob)
      setResultUrl(URL.createObjectURL(result.blob))
      setMetSize(result.metTarget)
      setStep('result')
    } catch {
      setError('Something went wrong while preparing the photo.')
      setStep('crop')
    }
  }

  function reset() {
    setImg(null)
    setCrop(null)
    setResultBlob(null)
    setResultUrl(null)
    setError(null)
    setStep(preset ? 'source' : 'requirement')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader
        title={prefill?.label ?? 'Smart Photo'}
        subtitle={
          prefill?.context
            ? `${prefill.context} · ${target.width}×${target.height} px · ≤ ${target.maxKb} KB`
            : step === 'requirement'
              ? undefined
              : `${target.width}×${target.height} px · ≤ ${target.maxKb} KB`
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
            </div>

            <div className="space-y-2">
              {PRESETS.map((preset, i) => {
                const active = !useCustom && presetIndex === i
                return (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setUseCustom(false)
                      setPresetIndex(i)
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
                      {preset.width}×{preset.height} · {preset.maxKb}KB
                    </SpecChip>
                  </button>
                )
              })}

              <button
                onClick={() => setUseCustom(true)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  useCustom
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--line)] bg-[var(--surface)]'
                }`}
              >
                <span className="block text-sm font-bold text-[var(--ink)]">Custom requirement</span>
                <span className="block text-xs text-[var(--ink-2)]">Type the exact numbers from the form</span>
              </button>
            </div>

            {useCustom && (
              <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                {(
                  [
                    ['Width', 'width'],
                    ['Height', 'height'],
                    ['Max KB', 'maxKb'],
                  ] as const
                ).map(([label, key]) => (
                  <label key={key}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                      {label}
                    </span>
                    <div className="mt-1">
                      <NumberField
                        value={custom[key]}
                        min={key === 'maxKb' ? 1 : 20}
                        invalid={!!issue}
                        ariaLabel={label}
                        onChange={(v) => setCustom({ ...custom, [key]: v })}
                        className="px-2 text-sm"
                      />
                    </div>
                  </label>
                ))}
              </div>
            )}

            {issue && (
              <Notice
                title={issue.title}
                actions={issue.fixes.map((fix) => ({
                  label: fix.label,
                  onClick: () => setCustom(fix.requirement),
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
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Add your photo</h2>
              <p className="mt-1 text-sm text-[var(--ink-2)]">Plain background, face centred and clearly visible.</p>
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
            </div>
            <ImageCropper img={img} aspect={aspect} onCropChange={setCrop} />
            <Button fullWidth onClick={process}>
              Prepare photo
            </Button>
          </>
        )}

        {step === 'working' && <ProgressPanel label="Preparing your photo" detail="Cropping and compressing" />}

        {step === 'result' && resultUrl && resultBlob && (
          <ResultView
            heading="Your photo is ready"
            blob={resultBlob}
            filename={`photo-${target.width}x${target.height}.jpg`}
            previewUrl={resultUrl}
            previewWidth={target.width}
            originalBytes={sourceBytes || undefined}
            checks={[
              { label: `${target.width}×${target.height} px`, ok: true },
              { label: `≤ ${target.maxKb} KB`, ok: metSize },
              { label: 'JPG', ok: true },
            ]}
            warning={
              metSize
                ? undefined
                : `This photo couldn't go under ${target.maxKb} KB at usable quality. A plainer background usually compresses further.`
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
