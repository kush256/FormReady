import { Capacitor, registerPlugin } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

interface SaveFilePlugin {
  beginWrite(options: { fileName: string; mimeType: string }): Promise<{ token: string }>
  writeChunk(options: { token: string; data: string }): Promise<{ bytesWritten: number }>
  finishWrite(options: { token: string }): Promise<{ uri: string; location: string }>
  abortWrite(options: { token: string }): Promise<void>
}

const SaveFile = registerPlugin<SaveFilePlugin>('SaveFile')

/**
 * How much of a file we turn into text at a time.
 *
 * A base64 string is four bytes of text for every three bytes of file, and it
 * is copied again as it crosses the bridge into Java. Converting a whole
 * document at once therefore costs several times its own size in memory, which
 * is what killed the app when a 171 MB merge was saved. Chunking caps the peak
 * regardless of how big the document is.
 *
 * The size must be a multiple of three so each chunk encodes to base64 with no
 * padding, and can be decoded on its own.
 */
const CHUNK_BYTES = 3 * 1024 * 1024

function chunkToBase64(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma === -1 ? '' : result.slice(comma + 1))
    }
    reader.onerror = () => reject(new Error('Could not read the finished file.'))
    reader.readAsDataURL(chunk)
  })
}

export interface SaveResult {
  /** Where the file landed, phrased for the user. */
  location: string
}

/** Reports how much of the file has reached storage, as a 0..1 fraction. */
export type WriteProgress = (fraction: number) => void

/**
 * Writes the file somewhere permanent the user can find again.
 *
 * On Android that is the public Downloads/FormReady folder via MediaStore, so
 * the file outlives the app's cache and appears in the Files app. In a browser
 * it falls back to a normal download.
 */
export async function saveToDevice(
  blob: Blob,
  filename: string,
  onProgress?: WriteProgress,
): Promise<SaveResult> {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(blob, filename)
    onProgress?.(1)
    return { location: 'Downloads' }
  }

  const { token } = await SaveFile.beginWrite({
    fileName: filename,
    mimeType: blob.type || 'application/octet-stream',
  })

  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const end = Math.min(offset + CHUNK_BYTES, blob.size)
      const data = await chunkToBase64(blob.slice(offset, end))
      await SaveFile.writeChunk({ token, data })
      onProgress?.(end / blob.size)
    }
    const result = await SaveFile.finishWrite({ token })
    return { location: result.location }
  } catch (error) {
    await SaveFile.abortWrite({ token }).catch(() => {})
    throw error
  }
}

/**
 * Opens the system share sheet. Separate from saving on purpose.
 *
 * The file has to exist on disk before it can be shared, so it is streamed
 * into the app's cache the same way, a chunk at a time.
 */
export async function shareFile(
  blob: Blob,
  filename: string,
  onProgress?: WriteProgress,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser(blob, filename)
    onProgress?.(1)
    return
  }

  let uri = ''
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    const end = Math.min(offset + CHUNK_BYTES, blob.size)
    const data = await chunkToBase64(blob.slice(offset, end))
    if (offset === 0) {
      const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })
      uri = written.uri
    } else {
      await Filesystem.appendFile({ path: filename, data, directory: Directory.Cache })
    }
    onProgress?.(end / blob.size)
  }

  if (blob.size === 0) {
    const written = await Filesystem.writeFile({ path: filename, data: '', directory: Directory.Cache })
    uri = written.uri
  }

  await Share.share({
    title: filename,
    url: uri,
    dialogTitle: `Share ${filename}`,
  })
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
