/** Wraps a Uint8Array's bytes into a Blob, working around TS's stricter BlobPart typing. */
export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([buffer], { type })
}
