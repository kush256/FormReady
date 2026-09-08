import { useNavigate } from 'react-router-dom'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { ToolCard } from '../components/ToolCard'
import { QUICK_TOOLS } from '../lib/tools'
import { SmartPhotoIcon, ChevronRightIcon } from '../components/Icons'

export function Home() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-top px-5 pt-7 pb-3">
        <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--ink)]">FormReady</h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
          Photos, signatures and PDFs at the exact size your form asks for.
        </p>
      </header>

      <main className="flex-1 space-y-7 px-5 py-3">
        <button
          onClick={() => navigate('/smart-photo')}
          className="block w-full rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-press)] p-5 text-left text-white shadow-[var(--shadow-lift)] transition-transform active:scale-[0.99]"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <SmartPhotoIcon width={25} height={25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Smart Photo</p>
              <p className="mt-1 text-lg font-extrabold leading-snug tracking-tight">
                Match photo dimensions and file size
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-white/85">
                Prepare a photo to meet exact upload requirements
              </p>
            </div>
            <ChevronRightIcon width={18} height={18} className="mt-1 shrink-0 text-white/70" />
          </div>
        </button>

        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">Quick Tools</h2>
          <div className="space-y-2.5">
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
