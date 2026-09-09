const KEY = 'formready.onboarded.v1'

/**
 * Whether the introduction has been seen.
 *
 * Storage can throw outright in a private window or with site data blocked, so
 * a failure is treated as "already seen": showing the introduction on every
 * launch would be far more annoying than never showing it.
 */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Nothing to do; the introduction simply won't be remembered.
  }
}
