import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

/** Opens the native camera (or a browser camera-capture input) and returns a File. */
export async function captureFromCamera(): Promise<File | null> {
  if (Capacitor.isNativePlatform()) {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 95,
      saveToGallery: false,
    })
    if (!photo.webPath) return null
    const res = await fetch(photo.webPath)
    const blob = await res.blob()
    return new File([blob], `camera-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
  }
  return pickFiles({ accept: 'image/*', multiple: false, capture: true }).then((f) => f[0] ?? null)
}

export interface PickFilesOptions {
  accept: string
  multiple?: boolean
  capture?: boolean
}

/** Opens a native file/gallery/document picker via a hidden <input type=file>. */
export function pickFiles(opts: PickFilesOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = opts.accept
    if (opts.multiple) input.multiple = true
    if (opts.capture) input.capture = 'environment'
    input.style.position = 'fixed'
    input.style.top = '-1000px'
    document.body.appendChild(input)

    const cleanup = () => {
      input.remove()
      window.removeEventListener('focus', onFocusFallback)
    }
    // If the user cancels the picker, no 'change' fires on some browsers;
    // resolve empty on window refocus as a fallback.
    const onFocusFallback = () => {
      setTimeout(() => {
        if (document.body.contains(input)) {
          cleanup()
          resolve([])
        }
      }, 500)
    }

    input.addEventListener(
      'change',
      () => {
        const files = input.files ? Array.from(input.files) : []
        cleanup()
        resolve(files)
      },
      { once: true },
    )
    window.addEventListener('focus', onFocusFallback, { once: true })
    input.click()
  })
}

export function pickImages(multiple = false): Promise<File[]> {
  return pickFiles({ accept: 'image/*', multiple })
}

export function pickPdfs(multiple = false): Promise<File[]> {
  return pickFiles({ accept: 'application/pdf', multiple })
}
