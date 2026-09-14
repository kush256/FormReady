import { estimateLargestJpegBytes, estimateSmallestJpegBytes, estimateSmallestPngBytes } from './image'
import { formatBytes } from './format'

export interface ImageRequirement {
  width: number
  height: number
  maxKb: number
  /**
   * Smallest the form will accept, where it says so.
   *
   * Most exam boards state a band rather than a ceiling — SSC asks for a
   * photograph between 20 and 50 KB. A file under the floor is rejected just as
   * firmly as one over the ceiling, and a rejected form is worse than a soft
   * photo, so the floor is worth carrying even though most tools ignore it.
   */
  minKb?: number
}

export interface RequirementFix {
  label: string
  requirement: ImageRequirement
}

export interface RequirementIssue {
  title: string
  detail: string
  fixes: RequirementFix[]
}

const MIN_EDGE = 20
const MAX_EDGE = 10000

/**
 * Catches a requirement that cannot be satisfied before the user picks a
 * photo, rather than after grinding through the work and failing. Always
 * returns a way forward, because "that won't work" on its own is useless.
 */
export function validateRequirement(
  req: ImageRequirement,
  format: 'jpeg' | 'png' = 'jpeg',
): RequirementIssue | null {
  if (!Number.isFinite(req.width) || !Number.isFinite(req.height) || req.width < MIN_EDGE || req.height < MIN_EDGE) {
    return {
      title: 'Dimensions are too small',
      detail: `Width and height need to be at least ${MIN_EDGE} px each.`,
      fixes: [],
    }
  }

  if (req.width > MAX_EDGE || req.height > MAX_EDGE) {
    return {
      title: 'Dimensions are too large',
      detail: `Keep width and height under ${MAX_EDGE} px.`,
      fixes: [],
    }
  }

  if (!Number.isFinite(req.maxKb) || req.maxKb < 1) {
    return {
      title: 'Size limit is too small',
      detail: 'Set a maximum size of at least 1 KB.',
      fixes: [],
    }
  }

  if (req.minKb !== undefined && Number.isFinite(req.minKb) && req.minKb >= req.maxKb) {
    const raisedKb = req.minKb + 1
    return {
      title: 'Those two limits contradict each other',
      detail: `The smallest allowed size (${req.minKb} KB) is not below the largest (${req.maxKb} KB), so no file could satisfy both.`,
      fixes: [{ label: `Allow up to ${raisedKb} KB`, requirement: { ...req, maxKb: raisedKb } }],
    }
  }

  // A minimum the dimensions cannot reach. At a fixed pixel size there is a
  // ceiling on what a JPEG can weigh even at maximum quality, and past that the
  // only honest answer is more pixels — no amount of re-encoding adds bytes.
  if (req.minKb !== undefined && Number.isFinite(req.minKb) && format === 'jpeg') {
    const ceilingBytes = estimateLargestJpegBytes(req.width, req.height)
    const neededBytes = req.minKb * 1024
    if (ceilingBytes < neededBytes) {
      const grow = Math.sqrt(neededBytes / ceilingBytes)
      const fitWidth = Math.min(MAX_EDGE, Math.round(req.width * grow))
      const fitHeight = Math.min(MAX_EDGE, Math.round(req.height * grow))
      return {
        title: "That minimum can't be reached",
        detail: `A ${req.width}×${req.height} px photo tops out around ${formatBytes(ceilingBytes)} even at full quality, which is under the ${req.minKb} KB this form wants. Either the dimensions or the minimum has to give.`,
        fixes: [
          { label: `Ask for ${Math.floor(ceilingBytes / 1024)} KB`, requirement: { ...req, minKb: Math.floor(ceilingBytes / 1024) } },
          {
            label: `Enlarge to ${fitWidth}×${fitHeight}`,
            requirement: { ...req, width: fitWidth, height: fitHeight },
          },
        ],
      }
    }
  }

  const floorBytes =
    format === 'png'
      ? estimateSmallestPngBytes(req.width, req.height)
      : estimateSmallestJpegBytes(req.width, req.height)
  const budgetBytes = req.maxKb * 1024

  if (floorBytes > budgetBytes) {
    const achievableKb = Math.ceil(floorBytes / 1024)
    const shrink = Math.sqrt(budgetBytes / floorBytes)
    const fitWidth = Math.max(MIN_EDGE, Math.round(req.width * shrink))
    const fitHeight = Math.max(MIN_EDGE, Math.round(req.height * shrink))

    return {
      title: "That combination isn't possible",
      detail:
        format === 'png'
          ? `A ${req.width}×${req.height} px PNG can't get under ${req.maxKb} KB. PNG keeps every pixel, so the only way down is fewer colours, and even that bottoms out around ${formatBytes(floorBytes)} at these dimensions. JPEG goes far smaller.`
          : `A ${req.width}×${req.height} px photo can't be squeezed under ${req.maxKb} KB without becoming unreadable. The smallest realistic size at these dimensions is about ${formatBytes(floorBytes)}.`,
      fixes: [
        { label: `Use ${achievableKb} KB`, requirement: { ...req, maxKb: achievableKb } },
        {
          label: `Shrink to ${fitWidth}×${fitHeight}`,
          requirement: { ...req, width: fitWidth, height: fitHeight },
        },
      ],
    }
  }

  return null
}

/**
 * Explains a result that lands far under its limit at fixed dimensions.
 *
 * A 200×230 px photo allowed 100 KB can come back at 9 KB with nothing at all
 * wrong with it: 46,000 pixels do not hold more detail than that. The signal is
 * exact and free — `compressToTarget` reports the quality it settled on, and
 * quality 1 means the encoder was already at its best, so the unused allowance
 * genuinely cannot be spent without more pixels. Said plainly it is reassuring;
 * left unsaid, a result nine tenths under its limit reads as a failure, which
 * is exactly how it was read.
 */
export function explainMaxQuality(
  result: { quality: number; bytes: number },
  req: ImageRequirement,
): string | null {
  if (result.quality < 1) return null
  const budgetBytes = req.maxKb * 1024
  if (result.bytes > budgetBytes * 0.6) return null
  // Under a stated minimum is a real problem, and has its own warning.
  if (req.minKb !== undefined && result.bytes < req.minKb * 1024) return null
  return `That is all the detail ${req.width}×${req.height} px can hold. It came to ${formatBytes(result.bytes)} of the ${req.maxKb} KB allowed, at the highest quality there is — the rest of the allowance cannot be spent at these dimensions. Anything under the limit is accepted.`
}

export function describeRequirement(req: ImageRequirement): string {
  const size = req.minKb ? `${req.minKb}–${req.maxKb} KB` : `≤ ${req.maxKb} KB`
  return `${req.width}×${req.height} px · ${size}`
}
