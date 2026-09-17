/**
 * Empty-state artwork.
 *
 * Drawn inline rather than shipped as image files: the app requests no network
 * permission, these have to stay crisp at any density, and they need to follow
 * the theme. Every colour comes from a token, so they work on both grounds.
 *
 * One shared language across the set: rounded document shapes, the brand blue
 * for the subject, green only where something is confirmed, and a soft tinted
 * shape behind to give the composition weight.
 */

interface Props {
  size?: number
  className?: string
}

const VIEW = '0 0 200 150'

function Frame({ size = 180, className = '', children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={(size * 150) / 200}
      viewBox={VIEW}
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

/** Soft shape that sits behind each subject so it doesn't float. */
function Backdrop() {
  return (
    <>
      <ellipse cx="100" cy="120" rx="74" ry="12" fill="var(--accent)" opacity="0.08" />
      <circle cx="152" cy="34" r="26" fill="var(--accent)" opacity="0.07" />
      <circle cx="44" cy="46" r="15" fill="var(--ok)" opacity="0.09" />
    </>
  )
}

/** Choosing or framing a photo. */
export function PhotoIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="58" y="26" width="84" height="94" rx="8" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="100" cy="62" r="18" fill="var(--accent)" opacity="0.9" />
      <path d="M74 112c4-16 13-24 26-24s22 8 26 24z" fill="var(--accent)" opacity="0.9" />
      {/* crop marks, the thing this screen is actually for */}
      <g stroke="var(--accent)" strokeWidth="3" strokeLinecap="round">
        <path d="M46 34v-8h8M154 34v-8h-8M46 112v8h8M154 112v8h-8" />
      </g>
      <g transform="translate(120 96)">
        <circle cx="14" cy="14" r="14" fill="var(--ok)" />
        <path d="M8 14.5l4 4 8-8.5" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Frame>
  )
}

/** Capturing a signature. */
export function SignatureIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="34" y="40" width="132" height="66" rx="8" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <path
        d="M52 84c8-22 14-30 19-28s3 20 9 22 11-18 17-16 4 16 10 17 10-8 16-14"
        stroke="var(--accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M52 96h74" stroke="var(--line-strong)" strokeWidth="2.5" strokeLinecap="round" />
      {/* pen */}
      <g transform="rotate(38 140 70)">
        <rect x="134" y="34" width="11" height="40" rx="3" fill="var(--accent)" />
        <path d="M134 74h11l-5.5 12z" fill="var(--ink-2)" />
      </g>
    </Frame>
  )
}

/** Photos waiting to become pages. */
export function PhotoStackIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="30" y="44" width="66" height="70" rx="7" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" transform="rotate(-8 63 79)" />
      <rect x="52" y="34" width="66" height="70" rx="7" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="72" cy="55" r="7" fill="var(--accent)" opacity="0.85" />
      <path d="M58 90l16-16 12 12 10-9 22 21H58z" fill="var(--accent)" opacity="0.75" />
      <g transform="translate(112 40)">
        <rect x="0" y="0" width="58" height="74" rx="7" fill="var(--accent)" opacity="0.12" stroke="var(--accent)" strokeWidth="2" />
        <path d="M29 22v30M14 37h30" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
      </g>
    </Frame>
  )
}

/** Two files becoming one. */
export function MergeIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="20" y="34" width="52" height="66" rx="7" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <rect x="20" y="34" width="52" height="66" rx="7" fill="var(--accent)" opacity="0.08" />
      <rect x="128" y="34" width="52" height="66" rx="7" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <rect x="128" y="34" width="52" height="66" rx="7" fill="var(--accent)" opacity="0.08" />
      <g stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M78 67h16M122 67h-16" />
        <path d="M88 60l7 7-7 7M112 60l-7 7 7 7" />
      </g>
      <rect x="86" y="52" width="28" height="30" rx="5" fill="var(--ok)" opacity="0.15" />
    </Frame>
  )
}

/** One file becoming separate pages. */
export function SplitIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="22" y="36" width="54" height="68" rx="7" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <g fill="var(--accent)" opacity="0.6">
        <rect x="32" y="50" width="34" height="4" rx="2" />
        <rect x="32" y="60" width="34" height="4" rx="2" />
        <rect x="32" y="70" width="22" height="4" rx="2" />
      </g>
      <path d="M86 70h24" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="6 6" />
      <rect x="118" y="26" width="44" height="54" rx="6" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
      <rect x="134" y="62" width="44" height="54" rx="6" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray="5 5" />
    </Frame>
  )
}

/** A file being squeezed to fit. */
export function CompressIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="64" y="34" width="72" height="82" rx="8" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <g fill="var(--accent)" opacity="0.65">
        <rect x="78" y="52" width="44" height="5" rx="2.5" />
        <rect x="78" y="64" width="44" height="5" rx="2.5" />
        <rect x="78" y="76" width="30" height="5" rx="2.5" />
      </g>
      <g stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M40 75h16M32 68l7 7-7 7" />
        <path d="M160 75h-16M168 68l-7 7 7 7" />
      </g>
      <g transform="translate(112 88)">
        <circle cx="14" cy="14" r="14" fill="var(--ok)" />
        <path d="M8 14.5l4 4 8-8.5" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Frame>
  )
}

/** Nothing matched a search. */
export function SearchEmptyIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="52" y="30" width="60" height="76" rx="7" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <g fill="var(--ink-3)" opacity="0.35">
        <rect x="64" y="46" width="36" height="4.5" rx="2.2" />
        <rect x="64" y="57" width="36" height="4.5" rx="2.2" />
        <rect x="64" y="68" width="22" height="4.5" rx="2.2" />
      </g>
      <circle cx="124" cy="78" r="24" fill="var(--surface)" stroke="var(--accent)" strokeWidth="4" />
      <path d="M142 96l14 14" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
      <path d="M116 78h16" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" />
    </Frame>
  )
}

/** Exams, each asking for a different set. */
export function ExamIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <rect x="42" y="22" width="82" height="102" rx="8" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
      <rect x="42" y="22" width="82" height="24" rx="8" fill="var(--accent)" />
      <rect x="42" y="38" width="82" height="8" fill="var(--accent)" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(56 ${60 + i * 22})`}>
          <circle cx="7" cy="7" r="7" fill="var(--ok)" opacity={i === 2 ? 0.25 : 1} />
          {i !== 2 && (
            <path d="M3.5 7.2l2.4 2.4 4.6-5" stroke="var(--surface)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          )}
          <rect x="20" y="4" width="42" height="6" rx="3" fill="var(--ink-3)" opacity="0.35" />
        </g>
      ))}
      <g transform="translate(122 74)">
        <rect x="0" y="0" width="52" height="40" rx="6" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
        <rect x="10" y="11" width="32" height="5" rx="2.5" fill="var(--accent)" />
        <rect x="10" y="23" width="20" height="5" rx="2.5" fill="var(--accent)" opacity="0.5" />
      </g>
    </Frame>
  )
}

/** Files staying put. */
export function PrivacyIllustration(props: Props) {
  return (
    <Frame {...props}>
      <Backdrop />
      <path
        d="M100 22l40 14v34c0 26-17 44-40 52-23-8-40-26-40-52V36z"
        fill="var(--surface)"
        stroke="var(--ok)"
        strokeWidth="3"
      />
      <rect x="80" y="52" width="40" height="46" rx="5" fill="var(--ok)" opacity="0.14" />
      <g fill="var(--ok)">
        <rect x="89" y="63" width="22" height="4.5" rx="2.2" />
        <rect x="89" y="74" width="22" height="4.5" rx="2.2" />
        <rect x="89" y="85" width="13" height="4.5" rx="2.2" />
      </g>
      {/* no wire out: the point of the picture */}
      <g stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" opacity="0.4">
        <path d="M28 122h24M148 122h24" strokeDasharray="5 7" />
      </g>
    </Frame>
  )
}
