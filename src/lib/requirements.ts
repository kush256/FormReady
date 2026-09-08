import { estimateSmallestJpegBytes } from './image'
import { formatBytes } from './format'

export interface ImageRequirement {
  width: number
  height: number
  maxKb: number
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
export function validateRequirement(req: ImageRequirement): RequirementIssue | null {
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

  const floorBytes = estimateSmallestJpegBytes(req.width, req.height)
  const budgetBytes = req.maxKb * 1024

  if (floorBytes > budgetBytes) {
    const achievableKb = Math.ceil(floorBytes / 1024)
    const shrink = Math.sqrt(budgetBytes / floorBytes)
    const fitWidth = Math.max(MIN_EDGE, Math.round(req.width * shrink))
    const fitHeight = Math.max(MIN_EDGE, Math.round(req.height * shrink))

    return {
      title: "That combination isn't possible",
      detail: `A ${req.width}×${req.height} px photo can't be squeezed under ${req.maxKb} KB without becoming unreadable. The smallest realistic size at these dimensions is about ${formatBytes(floorBytes)}.`,
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

export function describeRequirement(req: ImageRequirement): string {
  return `${req.width}×${req.height} px · ≤ ${req.maxKb} KB`
}
