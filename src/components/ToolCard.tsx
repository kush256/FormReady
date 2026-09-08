import { useNavigate } from 'react-router-dom'
import type { ToolDef } from '../lib/tools'
import { ChevronRightIcon } from './Icons'

export function ToolCard({ tool }: { tool: ToolDef }) {
  const navigate = useNavigate()
  const Icon = tool.icon
  return (
    <button
      onClick={() => navigate(tool.path)}
      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-sm active:bg-black/[0.02]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        <Icon width={22} height={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">{tool.name}</span>
        <span className="block truncate text-xs text-[var(--color-ink-muted)]">{tool.description}</span>
      </span>
      <ChevronRightIcon width={18} height={18} className="shrink-0 text-[var(--color-ink-muted)]" />
    </button>
  )
}
