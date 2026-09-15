import type { ReactNode } from 'react'

interface Props {
  illustration: ReactNode
  title: string
  description: string
  /** The primary way out of the empty state. */
  action?: ReactNode
  /** A quieter second option, such as a different source. */
  secondary?: ReactNode
}

/**
 * A screen with nothing in it yet. The picture carries the explanation, so the
 * text can stay short and the action is the obvious next thing to touch.
 */
export function EmptyState({ illustration, title, description, action, secondary }: Props) {
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <div className="mb-1">{illustration}</div>
      <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-[30ch] text-sm leading-relaxed text-[var(--ink-2)]">{description}</p>
      {action && <div className="mt-5 w-full">{action}</div>}
      {secondary && <div className="mt-2.5 w-full">{secondary}</div>}
    </div>
  )
}
