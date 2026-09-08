import type { ReactNode } from 'react'
import { WarningIcon } from './Icons'

export interface NoticeAction {
  label: string
  onClick: () => void
}

const tones = {
  warn: {
    box: 'border-[var(--warn)]/35 bg-[var(--warn-soft)]',
    title: 'text-[var(--warn)]',
  },
  danger: {
    box: 'border-[var(--danger)]/35 bg-[var(--danger-soft)]',
    title: 'text-[var(--danger)]',
  },
}

/**
 * An error the user can act on. Says what is wrong, why, and offers the
 * nearest workable alternative as a button rather than leaving them to guess
 * at new numbers.
 */
export function Notice({
  tone = 'warn',
  title,
  children,
  actions = [],
}: {
  tone?: keyof typeof tones
  title: string
  children?: ReactNode
  actions?: NoticeAction[]
}) {
  const style = tones[tone]
  return (
    <div className={`rounded-2xl border p-4 ${style.box}`}>
      <p className={`flex items-center gap-2 text-sm font-bold ${style.title}`}>
        <WarningIcon width={16} height={16} />
        {title}
      </p>
      {children && <div className="mt-1.5 text-xs leading-relaxed text-[var(--ink-2)]">{children}</div>}
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--ink)] active:bg-[var(--surface-sunk)]"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
