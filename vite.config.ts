import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/**
 * Publishes pdf.js's font and character-map data alongside the app.
 *
 * `pdf.worker.mjs` is a single file, so it rides in on a `?url` import. These
 * are directories — 16 font programs and 169 character maps — which `?url`
 * cannot express, and nothing else was copying them. They are read fresh from
 * `node_modules` on every build rather than committed, for the same reason the
 * worker script is: they are pdfjs-dist's files, and a second copy in the
 * repository is a second copy to keep in step.
 *
 * `src/lib/pdf.ts` names the same paths. Renaming here without renaming there
 * puts the app back to drawing empty boxes where words should be.
 */
function pdfjsAssets(): Plugin {
  const sources = ['standard_fonts', 'cmaps']
  return {
    name: 'formready:pdfjs-assets',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve('dist')
      for (const name of sources) {
        const from = path.resolve('node_modules/pdfjs-dist', name)
        if (!fs.existsSync(from)) {
          // Loud, because the failure it prevents is silent: pages render with
          // their words missing and nothing anywhere reports an error.
          throw new Error(`pdfjs-dist/${name} not found. Run npm ci before building.`)
        }
        fs.cpSync(from, path.join(outDir, 'pdfjs', name), { recursive: true })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  build: {
    outDir: 'dist',
  },
})
