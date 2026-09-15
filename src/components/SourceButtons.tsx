import { CameraIcon, GalleryIcon } from './Icons'

export function SourceButtons({
  onCamera,
  onGallery,
  galleryLabel = 'Choose from Gallery',
}: {
  onCamera: () => void
  onGallery: () => void
  galleryLabel?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={onCamera}
        className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-6 active:bg-black/[0.02]"
      >
        <CameraIcon width={26} height={26} className="text-[var(--accent)]" />
        <span className="text-sm font-medium text-[var(--ink)]">Take Photo</span>
      </button>
      <button
        onClick={onGallery}
        className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-6 active:bg-black/[0.02]"
      >
        <GalleryIcon width={26} height={26} className="text-[var(--accent)]" />
        <span className="text-sm font-medium text-[var(--ink)]">{galleryLabel}</span>
      </button>
    </div>
  )
}
