import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  fullWidth?: boolean
  icon?: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-[var(--color-primary)] text-white active:bg-[var(--color-primary-hover)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-ink-muted)]',
  secondary: 'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border)] active:bg-black/5',
  ghost: 'bg-transparent text-[var(--color-primary)] active:bg-[var(--color-primary-soft)]',
  danger: 'bg-[var(--color-danger)] text-white active:opacity-90 disabled:bg-[var(--color-border)] disabled:text-[var(--color-ink-muted)]',
}

export function Button({ variant = 'primary', fullWidth, icon, className = '', children, ...rest }: Props) {
  return (
    <button
      className={`flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
