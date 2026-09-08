import { useNavigate } from 'react-router-dom'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { ToolCard } from '../components/ToolCard'
import { QUICK_TOOLS } from '../lib/tools'
import { SmartPhotoIcon } from '../components/Icons'

export function Home() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-top px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-[var(--color-ink)]">FormReady</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Prepare photos, signatures and PDFs for online forms
        </p>
      </header>

      <main className="flex-1 space-y-6 px-5 py-4">
        <button
          onClick={() => navigate('/smart-photo')}
          className="block w-full rounded-2xl border border-[var(--color-primary)]/20 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] p-5 text-left text-white shadow-md active:opacity-95"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <SmartPhotoIcon width={26} height={26} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Smart Photo</p>
              <p className="mt-1 text-lg font-bold leading-snug">Match photo dimensions and file size</p>
              <p className="mt-1 text-sm text-white/85">Prepare a photo to meet exact upload requirements</p>
            </div>
          </div>
        </button>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink-muted)]">Quick Tools</h2>
          <div className="space-y-3">
            {QUICK_TOOLS.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
