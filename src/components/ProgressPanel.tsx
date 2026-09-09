import { Button } from './Button'
import { formatBytes } from '../lib/format'

interface Props {
  label: string
  /** 0..1. Omit for work whose length genuinely isn't known. */
  fraction?: number
  detail?: string
  /** Current output size, counted down against the target. */
  currentBytes?: number
  targetBytes?: number
  onCancel?: () => void
}

/**
 * Replaces the bare spinner. Where we know the numbers we show them, because
 * "312 KB, from 2.4 MB, target 500 KB" tells the user the work is progressing
 * in a way a rotating circle never does.
 */
export function ProgressPanel({ label, fraction, detail, currentBytes, targetBytes, onCancel }: Props) {
  const pct = fraction === undefined ? undefined : Math.round(Math.min(1, Math.max(0, fraction)) * 100)

  return (
    <div className="flex flex-col gap-5 py-8">
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{label}</p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums">
          {pct === undefined ? '…' : `${pct}%`}
        </p>
        {currentBytes !== undefined && (
          <p className="mt-1 text-xs text-[var(--ink-2)]">
            <span className="font-mono tabular-nums">{formatBytes(currentBytes)}</span> written
            {targetBytes !== undefined && (
              <>
                {' · '}
                <span className="font-mono tabular-nums">{formatBytes(targetBytes)}</span> target
              </>
            )}
          </p>
        )}
      </div>

      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
            style={{ width: pct === undefined ? '35%' : `${pct}%` }}
          />
        </div>
        {detail && <p className="mt-2 text-center text-xs text-[var(--ink-2)]">{detail}</p>}
      </div>

      {onCancel && (
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
