import { useState } from 'react'

interface Props {
  value: number | null
  onChange: (value: number) => void
  /**
   * Makes empty a state the field can rest in rather than one it corrects.
   *
   * Without it, clearing the field snaps to the minimum on blur, which is
   * right where a number is always required. Where the screen would rather ask
   * than assume — Compress PDF no longer guesses a limit — a blank field has
   * to survive being left blank. Callers that do not pass this are unaffected.
   */
  onEmpty?: () => void
  min?: number
  max?: number
  decimals?: boolean
  invalid?: boolean
  ariaLabel?: string
  className?: string
}

/**
 * A numeric field you can actually edit.
 *
 * Clamping on every keystroke makes a field impossible to clear: deleting the
 * last digit produces an empty string, which snaps straight back to the
 * minimum, so a user trying to replace 10 with 700 gets stuck. This keeps the
 * text the user is typing, reports valid numbers as they appear, and only
 * clamps when the field loses focus.
 */
export function NumberField({
  value,
  onChange,
  onEmpty,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  decimals = false,
  invalid,
  ariaLabel,
  className = '',
}: Props) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [editing, setEditing] = useState(false)
  const [lastValue, setLastValue] = useState(value)

  // Follow external changes (a preset chip, a suggested fix) unless the user
  // is mid-edit, where overwriting their keystrokes would be maddening.
  if (!editing && value !== lastValue) {
    setLastValue(value)
    setText(value === null ? '' : String(value))
  }

  return (
    <input
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      value={text}
      aria-label={ariaLabel}
      aria-invalid={invalid ? 'true' : 'false'}
      className={`fr-field ${className}`}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const cleaned = decimals
          ? e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
          : e.target.value.replace(/\D/g, '')
        setText(cleaned)
        if (cleaned === '' || cleaned === '.') {
          onEmpty?.()
          return
        }
        const parsed = Number(cleaned)
        if (Number.isFinite(parsed)) onChange(parsed)
      }}
      onBlur={() => {
        setEditing(false)
        if (onEmpty && (text === '' || text === '.')) {
          setText('')
          onEmpty()
          return
        }
        const parsed = text === '' || text === '.' ? min : Number(text)
        const clamped = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min))
        const rounded = decimals ? Math.round(clamped * 100) / 100 : Math.round(clamped)
        setText(String(rounded))
        onChange(rounded)
      }}
    />
  )
}
