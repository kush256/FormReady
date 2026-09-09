import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { ChevronRightIcon, SearchIcon } from '../components/Icons'
import { EXAMS, searchExams } from '../lib/exams'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/Button'
import { SearchEmptyIllustration } from '../components/Illustrations'

/** Distinct tints so exams are told apart at a glance rather than by reading. */
const TINTS = [
  { bg: '#E8F0FE', fg: '#1B4FD8' },
  { bg: '#E7F6EE', fg: '#12794A' },
  { bg: '#FDF0E4', fg: '#A65212' },
  { bg: '#F1ECFD', fg: '#5B36C4' },
  { bg: '#FDECEF', fg: '#B02542' },
  { bg: '#E6F5F7', fg: '#0F6E7C' },
]

const DARK_TINTS = [
  { bg: '#16233C', fg: '#8FB4FA' },
  { bg: '#12291F', fg: '#63CD89' },
  { bg: '#2B1F12', fg: '#E2A75F' },
  { bg: '#211A38', fg: '#B49BF5' },
  { bg: '#2C161C', fg: '#F08CA0' },
  { bg: '#122A2E', fg: '#5EC0CD' },
]

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean)
  return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')
}

export function GovExams() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchExams(query), [query])

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title="Government Exams" subtitle={`${EXAMS.length} exams`} />

      <main className="flex-1 space-y-5 px-5 py-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">Pick your exam</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
            Every document that exam asks for, already set to the right size.
          </p>
        </div>

        <div className="relative">
          <SearchIcon
            width={17}
            height={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-3)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SSC, UPSC, NEET…"
            aria-label="Search exams"
            className="fr-field pl-10 font-sans"
          />
        </div>

        {results.length === 0 ? (
          <EmptyState
            illustration={<SearchEmptyIllustration size={190} />}
            title="No exam called that yet"
            description="Open Smart Photo instead and type the numbers straight from your form."
            action={
              <Button fullWidth variant="secondary" onClick={() => navigate('/smart-photo')}>
                Open Smart Photo
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {results.map((exam, i) => {
              const light = TINTS[i % TINTS.length]
              const dark = DARK_TINTS[i % DARK_TINTS.length]
              return (
                <li key={exam.id}>
                  <button
                    onClick={() => navigate(`/gov-exams/${exam.id}`)}
                    className="flex w-full items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 text-left shadow-[var(--shadow-card)] active:bg-[var(--surface-sunk)]"
                  >
                    <span
                      className="fr-tint flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold tracking-tight"
                      style={
                        {
                          '--tint-bg-light': light.bg,
                          '--tint-fg-light': light.fg,
                          '--tint-bg-dark': dark.bg,
                          '--tint-fg-dark': dark.fg,
                        } as CSSProperties
                      }
                    >
                      {initials(exam.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">
                        {exam.name}
                      </span>
                      <span className="block truncate text-xs text-[var(--ink-2)]">{exam.authority}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--ink-3)] tabular-nums">
                      {exam.documents.length} docs
                    </span>
                    <ChevronRightIcon width={17} height={17} className="shrink-0 text-[var(--ink-3)]" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-xs leading-relaxed text-[var(--ink-3)]">
          Sizes follow recent notifications, but commissions do change them. Always confirm against the notification
          for your cycle — every number stays editable.
        </p>
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
