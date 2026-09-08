import { useNavigate } from 'react-router-dom'

export function ScreenHeader({ title }: { title: string }) {
  const navigate = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-3 backdrop-blur">
      <button
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink)] active:bg-black/5"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 className="truncate text-base font-semibold text-[var(--color-ink)]">{title}</h1>
    </header>
  )
}
