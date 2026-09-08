import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('Could not read output file.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Saves a blob to the device and opens the native share/save sheet.
 * On native Android this writes to app cache then hands the file URI to
 * the Share plugin (covers "Save to Downloads" and "Share to..." both).
 * In a plain browser (dev/testing) it falls back to a normal download.
 */
export async function saveAndShare(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob)
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    })
    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: `Save or share ${filename}`,
    })
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}
