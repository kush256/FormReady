/** The FormReady mark: a shield holding a document, with a confirmation badge. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const id = `fr-brand-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2E8BF0" />
          <stop offset="1" stopColor="#1152C4" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${id})`} />
      <path d="M32 13.5 45 18v18.5c0 8.2-5.6 14.5-13 17-7.4-2.5-13-8.8-13-17V18z" fill="#fff" />
      <rect x="25.5" y="22.5" width="13" height="15" rx="2" fill="#1152C4" />
      <g fill="#fff">
        <rect x="28" y="26" width="8" height="1.6" rx="0.8" />
        <rect x="28" y="29.5" width="8" height="1.6" rx="0.8" />
        <rect x="28" y="33" width="5" height="1.6" rx="0.8" />
      </g>
      <circle cx="42" cy="42" r="9.5" fill="#fff" />
      <circle cx="42" cy="42" r="7.6" fill="#21C55D" />
      <path
        d="M38.3 42.2l2.6 2.6 4.9-5.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
