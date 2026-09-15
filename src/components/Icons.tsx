import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const SmartPhotoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M8 5l1.2-2h5.6L16 5" />
  </svg>
)

export const SignatureIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 17c2-1 3-3 4-6 1-3 2-5 3-4s0 5-1 7 1 3 3 1 3-5 4-3 1 3 3 2" />
    <path d="M3 20h18" />
  </svg>
)

export const ImageToPdfIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="12" height="14" rx="1.5" />
    <circle cx="7" cy="8" r="1.3" />
    <path d="M4.5 15l3-3 2 2 3-4 2.5 3" />
    <path d="M17 9h3.2c.4 0 .8.4.8.8V20a1 1 0 01-1 1h-6a1 1 0 01-1-1v-1" />
  </svg>
)

export const ResizeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 3H4a1 1 0 00-1 1v5" />
    <path d="M15 21h5a1 1 0 001-1v-5" />
    <path d="M21 3l-8 8" />
    <path d="M3 21l8-8" />
  </svg>
)

export const CompressPdfIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 2h9l4 4v15a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" />
    <path d="M15 2v4h4" />
    <path d="M9 12l-1.5 1.5L9 15" />
    <path d="M13 12l1.5 1.5L13 15" />
  </svg>
)

export const MergePdfIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="9" height="12" rx="1.2" />
    <rect x="12" y="8" width="9" height="12" rx="1.2" />
  </svg>
)

export const SplitPdfIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="8" height="18" rx="1.2" />
    <rect x="13" y="3" width="8" height="18" rx="1.2" strokeDasharray="3 3" />
  </svg>
)

export const CameraIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
)

export const GalleryIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5-4 4-3-3-6 6" />
  </svg>
)

export const CheckCircleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.3 2.3L16 10" />
  </svg>
)

export const WarningIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3l10 18H2L12 3z" />
    <path d="M12 10v4" />
    <path d="M12 17.5v.1" />
  </svg>
)

export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
  </svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const ReorderIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8h16M4 16h16" />
  </svg>
)

export const ShareIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 15V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6" />
  </svg>
)

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)

export const DownloadIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </svg>
)

export const UndoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
)

export const PenIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    <path d="M14.5 5.5l3 3" />
  </svg>
)
