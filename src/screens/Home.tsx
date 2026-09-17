import { useNavigate } from 'react-router-dom'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { PrivacyCard } from '../components/PrivacyCard'
import { BrandMark } from '../components/BrandMark'
import { ToolCard } from '../components/ToolCard'
import { QUICK_TOOLS } from '../lib/tools'
import { EXAMS } from '../lib/exams'
import { SmartPhotoIcon, ChevronRightIcon } from '../components/Icons'

export function Home() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-top flex items-center gap-3 px-5 pt-6 pb-3">
        <BrandMark size={38} />
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-[var(--ink)]">FormReady</h1>
          <p className="text-xs text-[var(--ink-2)]">Documents at the exact size your form wants</p>
        </div>
      </header>

      <main className="flex-1 space-y-6 px-5 py-2">
        <button
          onClick={() => navigate('/gov-exams')}
          className="relative block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#2E8BF0] to-[#1152C4] p-5 text-left text-white shadow-[var(--shadow-lift)] transition-transform active:scale-[0.99]"
        >
          {/* Soft depth, no illustration to go stale */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-white/[0.07]"
          />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Government Exams</p>
            <p className="mt-1.5 text-[19px] font-extrabold leading-snug tracking-tight">
              Applying for an exam?
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/85">
              Pick it once and get every photo, signature and document at the exact size it asks for.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold">
              {EXAMS.length} exams ready
              <ChevronRightIcon width={13} height={13} />
            </span>
          </div>
        </button>

        <button
          onClick={() => navigate('/smart-photo')}
          className="flex w-full items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-card)] active:bg-[var(--surface-sunk)]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <SmartPhotoIcon width={22} height={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold tracking-tight text-[var(--ink)]">Smart Photo</span>
            <span className="block text-xs text-[var(--ink-2)]">Your exam isn't listed? Type the size yourself</span>
          </span>
          <ChevronRightIcon width={17} height={17} className="shrink-0 text-[var(--ink-3)]" />
        </button>

        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)]">Quick Tools</h2>
          <div className="space-y-2.5">
            {QUICK_TOOLS.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>

        <PrivacyCard />
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
