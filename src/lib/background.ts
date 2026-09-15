import { Capacitor, registerPlugin } from '@capacitor/core'

interface BackgroundWorkPlugin {
  canNotify(): Promise<{ granted: boolean }>
  requestNotifications(): Promise<{ granted: boolean }>
  start(options: { title: string; text?: string; progress?: number }): Promise<void>
  stop(): Promise<void>
  notifyDone(options: { title: string; text?: string }): Promise<void>
}

const BackgroundWork = registerPlugin<BackgroundWorkPlugin>('BackgroundWork')

const native = () => Capacitor.isNativePlatform()

/**
 * Asks Android to keep this work running while the app is off screen.
 *
 * Everything below is best-effort on purpose. A foreground service is the only
 * thing that stops the system freezing a backgrounded app, but several of the
 * phone brands this app is built for ship battery managers that kill one
 * anyway, so nothing here is allowed to fail the job it is protecting: if the
 * service will not start, the compression carries on exactly as before and the
 * user simply has to stay on the screen.
 */
export async function keepWorking(title: string, text?: string, progress?: number): Promise<void> {
  if (!native()) return
  try {
    await BackgroundWork.start({ title, text, progress })
  } catch {
    // Reported through the screen's own copy, not as a failure of the work.
  }
}

export async function stopKeepingWorking(): Promise<void> {
  if (!native()) return
  try {
    await BackgroundWork.stop()
  } catch {
    // Nothing useful to do; the service goes when the process does.
  }
}

export async function notifyDone(title: string, text?: string): Promise<void> {
  if (!native()) return
  try {
    await BackgroundWork.notifyDone({ title, text })
  } catch {
    // A missing notification must never look like a missing file.
  }
}

/**
 * Asks for the notification permission, once, when it is about to be useful.
 *
 * Asked at the point a long job starts rather than on first launch, so the
 * request arrives with an obvious reason attached.
 */
export async function askToNotify(): Promise<boolean> {
  if (!native()) return false
  try {
    const { granted } = await BackgroundWork.canNotify()
    if (granted) return true
    return (await BackgroundWork.requestNotifications()).granted
  } catch {
    return false
  }
}
