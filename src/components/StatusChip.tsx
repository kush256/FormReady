import { CheckCircleIcon, WarningIcon } from './Icons'

export function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
        ok
          ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
          : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
      }`}
    >
      {ok ? <CheckCircleIcon width={14} height={14} /> : <WarningIcon width={14} height={14} />}
      {label}
    </span>
  )
}
