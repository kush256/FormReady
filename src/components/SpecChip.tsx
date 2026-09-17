import { CheckCircleIcon, WarningIcon } from './Icons'

export type SpecState = 'neutral' | 'ok' | 'warn' | 'bad'

const styles: Record<SpecState, string> = {
  neutral: 'bg-[var(--surface-sunk)] text-[var(--ink-2)] border-[var(--line)]',
  ok: 'bg-[var(--ok-soft)] text-[var(--ok)] border-transparent',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-transparent',
  bad: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent',
}

/**
 * The requirement, shown as one small object that turns green once it's met.
 * This is the app's signature element — it appears wherever a spec is stated
 * or verified, so the same string the form asked for is the string the user
 * sees confirmed.
 */
export function SpecChip({
  children,
  state = 'neutral',
  icon = true,
}: {
  children: React.ReactNode
  state?: SpecState
  icon?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] font-medium tabular-nums whitespace-nowrap ${styles[state]}`}
    >
      {icon && state === 'ok' && <CheckCircleIcon width={12} height={12} />}
      {icon && (state === 'warn' || state === 'bad') && <WarningIcon width={12} height={12} />}
      {children}
    </span>
  )
}
