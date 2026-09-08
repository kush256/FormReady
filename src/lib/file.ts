import { Capacitor, registerPlugin } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

interface SaveFilePlugin {
  saveToDownloads(options: {
    fileName: string
    data: string
    mimeType: string
  }): Promise<{ uri: string; location: string }>
}

const SaveFile = registerPlugin<SaveFilePlugin>('SaveFile')

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

export interface SaveResult {
  /** Where the file landed, phrased for the user. */
  location: string
}

/**
 * Writes the file somewhere permanent the user can find again.
 *
 * On Android that is the public Downloads/FormReady folder via MediaStore, so
 * the file outlives the app's cache and appears in the Files app. In a browser
 * it falls back to a normal download.
 */
export async function saveToDevice(blob: Blob, filename: string): Promise<SaveResult> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob)
    const result = await SaveFile.saveToDownloads({
      fileName: filename,
      data,
      mimeType: blob.type || 'application/octet-stream',
    })
    return { location: result.location }
  }

  downloadInBrowser(blob, filename)
  return { location: 'Downloads' }
}

/** Opens the system share sheet. Separate from saving on purpose. */
export async function shareFile(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob)
    const written = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
    })
    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: `Share ${filename}`,
    })
    return
  }

  downloadInBrowser(blob, filename)
}

function downloadInBrowser(blob: Blob, filename: string) {
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
