import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CropRect } from '../lib/image'

interface Props {
  img: HTMLImageElement
  /** target width / target height */
  aspect: number
  background?: string
  onCropChange: (crop: CropRect) => void
}

/** Pan-and-zoom cropper. Always covers the frame (no gaps), like a passport-photo crop tool. */
export function ImageCropper({ img, aspect, background = '#e5e7eb', onCropChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 320, h: 320 / aspect })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      setSize({ w, h: w / aspect })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  const baseScale = useMemo(
    () => Math.max(size.w / img.naturalWidth, size.h / img.naturalHeight),
    [size, img],
  )

  const clampPan = (x: number, y: number, z: number) => {
    const dw = img.naturalWidth * baseScale * z
    const dh = img.naturalHeight * baseScale * z
    const minX = size.w - dw
    const minY = size.h - dh
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) }
  }

  // Recenter whenever the image or frame size changes.
  useEffect(() => {
    const dw = img.naturalWidth * baseScale
    const dh = img.naturalHeight * baseScale
    setZoom(1)
    setPan({ x: (size.w - dw) / 2, y: (size.h - dh) / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, baseScale, size.w, size.h])

  useEffect(() => {
    const scale = baseScale * zoom
    if (scale <= 0) return
    const sx = -pan.x / scale / img.naturalWidth
    const sy = -pan.y / scale / img.naturalHeight
    const sWidth = size.w / scale / img.naturalWidth
    const sHeight = size.h / scale / img.naturalHeight
    onCropChange({
      sx: Math.max(0, Math.min(1 - sWidth, sx)),
      sy: Math.max(0, Math.min(1 - sHeight, sy)),
      sWidth: Math.min(1, sWidth),
      sHeight: Math.min(1, sHeight),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, zoom, baseScale])

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    setPan(clampPan(drag.current.panX + dx, drag.current.panY + dy, zoom))
  }
  function onPointerUp() {
    drag.current = null
  }

  function applyZoom(newZoom: number, focal?: { x: number; y: number }) {
    const clampedZoom = Math.max(1, Math.min(4, newZoom))
    const fx = focal?.x ?? size.w / 2
    const fy = focal?.y ?? size.h / 2
    // Keep the point under the focal position fixed while scaling.
    const ratio = clampedZoom / zoom
    const newX = fx - (fx - pan.x) * ratio
    const newY = fy - (fy - pan.y) * ratio
    setZoom(clampedZoom)
    setPan(clampPan(newX, newY, clampedZoom))
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    applyZoom(zoom - e.deltaY * 0.0015, { x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      pinch.current = { dist, zoom }
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinch.current) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const scale = dist / pinch.current.dist
      applyZoom(pinch.current.zoom * scale)
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null
  }

  const dw = img.naturalWidth * baseScale * zoom
  const dh = img.naturalHeight * baseScale * zoom

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative w-full touch-none overflow-hidden rounded-xl border border-[var(--line)] select-none"
        style={{ height: size.h, background }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={img.src}
          draggable={false}
          alt="Crop preview"
          style={{
            position: 'absolute',
            left: pan.x,
            top: pan.y,
            width: dw,
            height: dh,
            maxWidth: 'none',
            cursor: 'grab',
          }}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-[var(--ink-2)]">Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => applyZoom(parseFloat(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>
      <p className="mt-1 text-center text-xs text-[var(--ink-2)]">Drag to reposition, pinch or use the slider to zoom</p>
    </div>
  )
}
