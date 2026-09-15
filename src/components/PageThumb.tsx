import { useEffect, useRef, useState } from 'react'
import type { PageThumbnails } from '../lib/pdf'

interface Props {
  index: number
  source: PageThumbnails
  selected: boolean
  onToggle: () => void
}

/** Start drawing a screenful early, so pages are usually ready on arrival. */
const DRAW_MARGIN = '400px 0px'
/**
 * Hold the picture until it is this far behind, then let it go.
 *
 * Every thumbnail this component had ever drawn used to stay in its state for
 * the life of the screen. Measured at 15.3 KB apiece, a 615-page book scrolled
 * through end to end was holding around 9 MB of pictures it was no longer
 * showing — the same shape as the memory exhaustion that forced a restart in
 * Smart Photo. Six screenfuls of slack means scrolling back rarely shows the
 * number again, and `openPageThumbnails` caches the redraw anyway.
 */
const KEEP_MARGIN = '2000px 0px'

/**
 * One page in the picker grid. It shows its number and shape straight away and
 * asks for its picture only once it has scrolled into view, so opening a long
 * document costs nothing.
 */
export function PageThumb({ index, source, selected, onToggle }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const ref = useRef<HTMLButtonElement | null>(null)
  // Read inside the observers, which outlive any one render.
  const drawn = useRef(false)
  const asking = useRef(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let cancelled = false
    const request = () => {
      if (cancelled || drawn.current || asking.current) return
      asking.current = true
      source
        .get(index)
        .then((value) => {
          asking.current = false
          if (cancelled) return
          drawn.current = true
          setUrl(value)
        })
        .catch(() => {
          // A page that won't render still stays selectable by its number.
          asking.current = false
        })
    }

    if (typeof IntersectionObserver !== 'function') {
      request()
      return () => {
        cancelled = true
      }
    }

    const draw = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) request()
      },
      { rootMargin: DRAW_MARGIN },
    )
    const keep = new IntersectionObserver(
      (entries) => {
        if (drawn.current && entries.every((e) => !e.isIntersecting)) {
          drawn.current = false
          setUrl(null)
        }
      },
      { rootMargin: KEEP_MARGIN },
    )
    draw.observe(element)
    keep.observe(element)
    return () => {
      cancelled = true
      draw.disconnect()
      keep.disconnect()
    }
  }, [index, source])

  return (
    <button
      ref={ref}
      onClick={onToggle}
      data-page={index}
      aria-pressed={selected}
      aria-label={`Page ${index + 1}`}
      className={`relative block overflow-hidden rounded-lg border-2 bg-[var(--surface-sunk)] ${
        selected ? 'border-[var(--accent)]' : 'border-[var(--line)]'
      }`}
      style={{ aspectRatio: String(source.aspectRatio) }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-[var(--ink-3)]">
          {index + 1}
        </span>
      )}
      {/* A page is mostly white whatever is printed on it, so a 2px border on
          its own reads slowly in a grid of forty. The wash carries the state
          across the whole tile, which is what makes it legible while
          scrolling rather than only on close inspection. */}
      {selected && <span className="pointer-events-none absolute inset-0 bg-[var(--accent)]/20" />}
      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {index + 1}
      </span>
      {selected && (
        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-white shadow-sm">
          ✓
        </span>
      )}
    </button>
  )
}
