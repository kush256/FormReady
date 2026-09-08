import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  fullWidth?: boolean
  icon?: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white shadow-[var(--shadow-card)] active:bg-[var(--accent-press)] disabled:bg-[var(--line)] disabled:text-[var(--ink-3)] disabled:shadow-none',
  secondary:
    'bg-[var(--surface)] text-[var(--ink)] border border-[var(--line-strong)] active:bg-[var(--surface-sunk)] disabled:text-[var(--ink-3)]',
  ghost: 'bg-transparent text-[var(--accent)] active:bg-[var(--accent-soft)]',
  danger: 'bg-[var(--danger)] text-white active:opacity-90 disabled:bg-[var(--line)] disabled:text-[var(--ink-3)]',
}

export function Button({ variant = 'primary', fullWidth, icon, className = '', children, ...rest }: Props) {
  return (
    <button
      className={`flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold tracking-tight transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
