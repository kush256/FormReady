export function PrivacyFooter({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 py-4 text-xs text-[var(--color-success)] ${className}`}>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
      </svg>
      <span>Processed privately on your device</span>
    </div>
  )
}
