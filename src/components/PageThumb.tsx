import { useEffect, useRef, useState } from 'react'
import type { PageThumbnails } from '../lib/pdf'

interface Props {
  index: number
  source: PageThumbnails
  selected: boolean
  onToggle: () => void
}

/**
 * One page in the picker grid. It shows its number and shape straight away and
 * asks for its picture only once it has scrolled into view, so opening a long
 * document costs nothing.
 */
export function PageThumb({ index, source, selected, onToggle }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const ref = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || url) return

    let cancelled = false
    const request = () => {
      source
        .get(index)
        .then((value) => {
          if (!cancelled) setUrl(value)
        })
        .catch(() => {
          // A page that won't render still stays selectable by its number.
        })
    }

    if (typeof IntersectionObserver !== 'function') {
      request()
      return () => {
        cancelled = true
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect()
          request()
        }
      },
      // Start a screenful early so pages are usually drawn before they arrive.
      { rootMargin: '400px 0px' },
    )
    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [index, source, url])

  return (
    <button
      ref={ref}
      onClick={onToggle}
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
      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {index + 1}
      </span>
      {selected && (
        <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] text-white">
          ✓
        </span>
      )}
    </button>
  )
}
