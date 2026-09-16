import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/**
 * Which commit this build came from, stamped in at build time.
 *
 * Added after three rounds of fixes to the compressor produced an identical
 * result on a real phone while every measurement here said otherwise. There
 * was no way to tell from the app itself which build was actually installed,
 * so there was no way to tell a fix that had not worked from a fix that had
 * not arrived. Now there is.
 */
function buildStamp(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    // A build from a tarball or a shallow checkout has no git to ask.
    return 'local'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD__: JSON.stringify(buildStamp()),
  },
  build: {
    outDir: 'dist',
  },
})
