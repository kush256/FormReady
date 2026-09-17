import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { UndoIcon } from './Icons'

interface Point {
  x: number
  y: number
  /** Half-width of the stroke here, so it thins as the hand moves faster. */
  w: number
}

interface Props {
  /** Width divided by height of the finished signature, so the pad matches it. */
  aspect: number
  /** Receives a canvas of black ink on white. The caller owns it from then on. */
  onDone: (canvas: HTMLCanvasElement) => void
  onCancel: () => void
}

/** Internal resolution. Well above any form requirement, so the shrink is clean. */
const PAD_WIDTH = 1400
const MIN_PAD_HEIGHT = 420
const MAX_PAD_HEIGHT = 1200

/**
 * A pad for signing with a finger or a stylus.
 *
 * Signing on paper and photographing it is the fiddly part of every form, and
 * it is the step people get wrong: bad light, a shadow, blue ink, a printed
 * name caught in the crop. Signing here removes all of that at once.
 *
 * The stroke thins as the hand moves faster, which is what makes a drawn line
 * read as handwriting rather than as a fixed-width trail.
 */
export function SignaturePad({ aspect, onDone, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokes = useRef<Point[][]>([])
  const current = useRef<Point[] | null>(null)
  const [strokeCount, setStrokeCount] = useState(0)

  const height = Math.round(
    Math.min(MAX_PAD_HEIGHT, Math.max(MIN_PAD_HEIGHT, PAD_WIDTH / Math.max(aspect, 0.2))),
  )
  const baseWidth = height * 0.026

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#000000'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokes.current) drawStroke(ctx, stroke)
  }, [])

  useEffect(() => {
    redraw()
  }, [redraw, height])

  function toPadPoint(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function widthFor(previous: Point | undefined, x: number, y: number): number {
    if (!previous) return baseWidth
    const distance = Math.hypot(x - previous.x, y - previous.y)
    // Fast strokes thin out; the previous width is mixed in so the taper is
    // gradual rather than flickering between samples.
    const target = baseWidth * Math.max(0.42, 1 - distance / (baseWidth * 14))
    return previous.w * 0.6 + target * 0.4
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault()
    canvasRef.current?.setPointerCapture(event.pointerId)
    const { x, y } = toPadPoint(event)
    current.current = [{ x, y, w: baseWidth }]
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = current.current
    if (!stroke) return
    event.preventDefault()
    const { x, y } = toPadPoint(event)
    const previous = stroke[stroke.length - 1]
    if (Math.hypot(x - previous.x, y - previous.y) < 0.8) return

    stroke.push({ x, y, w: widthFor(previous, x, y) })

    // Draw just the new piece. Redrawing every stroke on every sample is what
    // makes a pad feel like it is lagging behind the finger.
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.strokeStyle = '#000000'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    drawStroke(ctx, stroke.slice(-3))
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = current.current
    current.current = null
    if (!stroke) return
    event.preventDefault()
    if (stroke.length === 1) {
      // A tap is a dot.
      stroke.push({ x: stroke[0].x + 0.6, y: stroke[0].y, w: stroke[0].w })
    }
    strokes.current.push(stroke)
    setStrokeCount(strokes.current.length)
    redraw()
  }

  function undo() {
    strokes.current.pop()
    setStrokeCount(strokes.current.length)
    redraw()
  }

  function clear() {
    strokes.current = []
    setStrokeCount(0)
    redraw()
  }

  function done() {
    const canvas = canvasRef.current
    if (!canvas || strokeCount === 0) return
    // Hand over a copy: this pad's canvas is reused if the user comes back.
    const copy = document.createElement('canvas')
    copy.width = canvas.width
    copy.height = canvas.height
    copy.getContext('2d')!.drawImage(canvas, 0, 0)
    onDone(copy)
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
        <canvas
          ref={canvasRef}
          width={PAD_WIDTH}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${PAD_WIDTH} / ${height}` }}
          aria-label="Signature pad. Draw your signature here."
        />
        {strokeCount === 0 && (
          <div className="pointer-events-none absolute inset-x-6 bottom-[28%] border-b border-dashed border-neutral-300 text-center">
            <span className="relative top-3 bg-white px-3 text-xs font-medium text-neutral-400">
              Sign above the line
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" onClick={undo} disabled={strokeCount === 0} icon={<UndoIcon width={17} height={17} />}>
          Undo
        </Button>
        <Button variant="secondary" onClick={clear} disabled={strokeCount === 0}>
          Clear
        </Button>
      </div>

      <Button fullWidth onClick={done} disabled={strokeCount === 0}>
        Use this signature
      </Button>
      <button onClick={onCancel} className="w-full py-1 text-sm font-semibold text-[var(--ink-2)]">
        Cancel
      </button>
    </div>
  )
}

/** Draws a run of points as a smooth, tapering line. */
function drawStroke(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length < 2) return
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const to = points[i]
    ctx.beginPath()
    ctx.lineWidth = (from.w + to.w) / 2
    ctx.moveTo(from.x, from.y)
    if (i + 1 < points.length) {
      // Curve through this point towards the midpoint of the next segment, so
      // the join is round rather than a visible corner.
      const next = points[i + 1]
      ctx.quadraticCurveTo(to.x, to.y, (to.x + next.x) / 2, (to.y + next.y) / 2)
    } else {
      ctx.lineTo(to.x, to.y)
    }
    ctx.stroke()
  }
}
