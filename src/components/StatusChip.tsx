import { CheckCircleIcon, WarningIcon } from './Icons'

export function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
        ok
          ? 'bg-[var(--ok-soft)] text-[var(--ok)]'
          : 'bg-[var(--warn-soft)] text-[var(--warn)]'
      }`}
    >
      {ok ? <CheckCircleIcon width={14} height={14} /> : <WarningIcon width={14} height={14} />}
      {label}
    </span>
  )
}
