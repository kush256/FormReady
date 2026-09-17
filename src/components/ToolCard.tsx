import { useNavigate } from 'react-router-dom'
import type { ToolDef } from '../lib/tools'
import { ChevronRightIcon } from './Icons'
import { SpecChip } from './SpecChip'

export function ToolCard({ tool }: { tool: ToolDef }) {
  const navigate = useNavigate()
  const Icon = tool.icon
  return (
    <button
      onClick={() => navigate(tool.path)}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 text-left shadow-[var(--shadow-card)] transition-colors active:bg-[var(--surface-sunk)]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon width={21} height={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{tool.name}</span>
        {/*
          Wraps rather than truncating. A row carrying a spec chip has less
          room than one without, and Signature Maker's line was cut mid-word
          to "Prepare form signatu…" while the space below it sat empty.
        */}
        <span className="block text-xs leading-snug text-[var(--ink-2)]">{tool.description}</span>
      </span>
      {tool.spec && <SpecChip icon={false}>{tool.spec}</SpecChip>}
      <ChevronRightIcon width={17} height={17} className="shrink-0 text-[var(--ink-3)]" />
    </button>
  )
}
