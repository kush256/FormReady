import { NumberField } from './NumberField'
import { SizeField } from './SizeField'
import { Notice } from './Notice'
import { validateRequirement, type ImageRequirement } from '../lib/requirements'

interface Props {
  value: ImageRequirement
  onChange: (next: ImageRequirement) => void
  format?: 'jpeg' | 'png'
  /** Where these numbers came from, named so the user knows what to check against. */
  source?: string
  /** When the built-in numbers were last checked against published guidance. */
  checked?: string
  /**
   * The smallest size the form itself states, where it states one.
   *
   * Kept apart from `value.minKb` so that turning the floor off and on again
   * gives back the published number. Deriving it from the ceiling instead
   * turned UPSC's 20 KB into 150 KB on the second tick.
   */
  publishedMinKb?: number
  /** Names the authority in the line about the floor, e.g. "UPSC Civil Services". */
  publishedBy?: string
}

const KB = 1024

/**
 * The output spec, shown and editable at the last moment before the work runs.
 *
 * Every number in this app that came from us rather than from the user is a
 * guess about a document we cannot see: commissions move these between
 * notifications, and a stale figure produces a file that is rejected without
 * saying why. So the numbers are never final until the user has looked at them —
 * they sit on the screen where the photo is framed, with the source named, and
 * anything can be changed before a single pixel is encoded.
 *
 * What it does *not* do is argue with them. A commission publishes its band
 * after its own research; when our arithmetic disagrees with a number a board
 * printed, our arithmetic is what is suspect. Validation therefore runs only
 * once the user has changed something, or on the two cases that are wrong
 * whoever typed them.
 */
export function SpecEditor({
  value,
  onChange,
  format = 'jpeg',
  source,
  checked,
  publishedMinKb,
  publishedBy,
}: Props) {
  const issue = shouldValidate(value, publishedMinKb) ? validateRequirement(value, format) : null

  function set(patch: Partial<ImageRequirement>) {
    onChange({ ...value, ...patch })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            What will be produced
          </span>
          <span className="font-mono text-[11px] text-[var(--ink-3)] tabular-nums">
            {value.width}×{value.height}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {(
            [
              ['Width (px)', 'width'],
              ['Height (px)', 'height'],
            ] as const
          ).map(([label, key]) => (
            <label key={key}>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{label}</span>
              <div className="mt-1">
                <NumberField
                  value={value[key]}
                  min={20}
                  ariaLabel={label}
                  onChange={(v) => set({ [key]: v } as Partial<ImageRequirement>)}
                  className="px-2 text-sm"
                />
              </div>
            </label>
          ))}
        </div>

        <div className="mt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            Largest allowed
          </span>
          <div className="mt-1">
            <SizeField
              label="Largest allowed size"
              bytes={Math.round(value.maxKb * KB)}
              onChange={(bytes) => set({ maxKb: Math.max(1, Math.round(bytes / KB)) })}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={value.minKb !== undefined}
              aria-label="This form also states a smallest size"
              onChange={(e) =>
                set({
                  // Back to the published figure, not to a fresh guess.
                  minKb: e.target.checked
                    ? (publishedMinKb ?? Math.max(1, Math.round(value.maxKb / 2)))
                    : undefined,
                })
              }
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-sm font-semibold text-[var(--ink)]">The form also states a smallest size</span>
          </label>
          {value.minKb !== undefined ? (
            <div className="mt-2">
              <SizeField
                label="Smallest allowed size"
                bytes={Math.round(value.minKb * KB)}
                onChange={(bytes) => set({ minKb: Math.max(1, Math.round(bytes / KB)) })}
              />
            </div>
          ) : (
            publishedMinKb !== undefined && (
              // Off by default, but the published floor stays in view rather
              // than disappearing with the tick.
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">
                {publishedBy ?? 'This form'} states {publishedMinKb} KB as the smallest it accepts. Tick to check
                against it.
              </p>
            )
          )}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[var(--ink-3)]">
        {source ? `From ${source}` : 'A starting point'}
        {checked ? `, ${checked}` : ''}. Please check against your form and edit anything that differs.
      </p>

      {issue && (
        <Notice
          title={issue.title}
          actions={issue.fixes.map((fix) => ({ label: fix.label, onClick: () => onChange(fix.requirement) }))}
        >
          {issue.detail}
        </Notice>
      )}
    </div>
  )
}

/**
 * Whether this spec is ours to question.
 *
 * A floor the user switched on themselves, or any dimension or ceiling they
 * typed, can be checked freely. A floor a board published is reported as it
 * stands — with one exception on each side: a floor at or above the ceiling
 * satisfies nothing, and dimensions outside what a canvas can sensibly produce
 * fail whoever entered them.
 */
function shouldValidate(value: ImageRequirement, publishedMinKb?: number): boolean {
  if (value.minKb === undefined) return true
  if (value.minKb >= value.maxKb) return true
  return value.minKb !== publishedMinKb
}
