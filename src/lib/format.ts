export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  // Drop trailing zeros so round numbers read as "1 MB", not "1.00 MB".
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 100) / 100} MB`
}

export function kbToBytes(kb: number): number {
  return Math.round(kb * 1024)
}
