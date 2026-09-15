/**
 * The reassurance a first-time user needs before handing over a document.
 *
 * The footer states this in three words on every screen; this states it in
 * full, once, where someone deciding whether to trust the app will read it.
 */
export function PrivacyCard() {
  return (
    <div className="flex gap-3 rounded-2xl border border-[var(--ok)]/25 bg-[var(--ok-soft)] p-4">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 text-[var(--ok)]"
        aria-hidden="true"
      >
        <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
      </svg>
      <div>
        <p className="text-sm font-bold text-[var(--ok)]">Your files never leave this phone</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">
          Every photo and PDF is processed on your device, whether you are online or offline. Nothing is uploaded to a
          server, nothing is stored anywhere else, and nothing is shared with anyone.
        </p>
      </div>
    </div>
  )
}
