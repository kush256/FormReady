import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * The bar every screen sits under.
 *
 * `children` ride along inside the same sticky element rather than below it,
 * which is how a screen keeps its own controls on screen while a long list
 * scrolls: a second sticky bar would need to know this one's exact height,
 * and that height moves with the safe-area inset.
 */
export function ScreenHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)]/92 px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--ink)] active:bg-[var(--surface-sunk)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{title}</h1>
          {subtitle && <p className="truncate font-mono text-[11px] text-[var(--ink-2)]">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="mt-2.5 px-1">{children}</div>}
    </header>
  )
}
