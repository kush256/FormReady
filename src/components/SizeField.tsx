import { useState } from 'react'
import { NumberField } from './NumberField'

const KB = 1024
const MB = 1024 * 1024

interface Props {
  bytes: number
  onChange: (bytes: number) => void
  invalid?: boolean
  /** Distinguishes two size fields on one screen, for screen readers and tests. */
  label?: string
}

/**
 * A size input that speaks both units. Portals state limits in KB and in MB,
 * and asking someone to convert "5 MB" into 5120 by hand is a good way to get
 * a wrong number typed.
 */
export function SizeField({ bytes, onChange, invalid, label = 'Maximum size' }: Props) {
  const [unit, setUnit] = useState<'KB' | 'MB'>(bytes >= MB ? 'MB' : 'KB')
  const divisor = unit === 'MB' ? MB : KB
  const shown = Math.round((bytes / divisor) * 100) / 100

  function switchTo(next: 'KB' | 'MB') {
    setUnit(next)
  }

  return (
    <div className="flex gap-2">
      <NumberField
        value={shown}
        onChange={(v) => onChange(Math.round(v * divisor))}
        min={0}
        decimals={unit === 'MB'}
        invalid={invalid}
        ariaLabel={`${label} in ${unit}`}
        className="flex-1"
      />
      <div className="flex overflow-hidden rounded-[10px] border border-[var(--line-strong)]">
        {(['KB', 'MB'] as const).map((u) => (
          <button
            key={u}
            onClick={() => switchTo(u)}
            aria-pressed={unit === u}
            className={`px-3.5 font-mono text-sm font-semibold transition-colors ${
              unit === u
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface)] text-[var(--ink-2)] active:bg-[var(--surface-sunk)]'
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  )
}
