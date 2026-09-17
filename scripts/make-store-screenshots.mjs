/**
 * Captures the phone screenshots the Play listing needs.
 *
 * Play wants at least two, portrait, at least 320px on the short edge. These
 * come out at 1080x1920 — a 360x640 layout at 3x, which is what the app
 * actually looks like on a phone rather than a browser window pretending.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/make-store-screenshots.mjs
 */
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const OUT = path.resolve('store-assets/screenshots')
const A = path.resolve('.fixtures')
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
})

let n = 0
async function shot(name) {
  n++
  const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  console.log(path.relative(process.cwd(), file))
}

async function pick(trigger, files) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger()])
  await chooser.setFiles(files)
}

// The introduction is shown once and is not what a listing should lead with.
await page.goto(BASE)
await page.waitForSelector('text=FormReady')
if ((await page.locator('button:has-text("Skip")').count()) > 0) {
  await page.locator('button:has-text("Skip")').click()
  await page.waitForSelector('text=Quick Tools')
}

await shot('home')

await page.goto(`${BASE}/#/gov-exams`)
await page.waitForSelector('text=SSC CGL')
await page.waitForTimeout(400)
await shot('exams')

await page.goto(`${BASE}/#/gov-exams/ssc-cgl`)
await page.waitForSelector('text=to prepare')
await page.waitForTimeout(400)
await shot('exam-detail')

// A real signature, prepared to a real exam's spec.
await page.goto(`${BASE}/#/signature-maker`)
await page.waitForSelector('text=Add your signature')
await pick(() => page.locator('button:has-text("Choose from Gallery")').click(), [
  path.join(A, 'black-signature.jpg'),
])
await page.waitForSelector('text=Frame your signature')
await page.locator('button:has-text("Prepare signature")').click()
await page.waitForSelector('text=Your signature is ready', { timeout: 60000 })
await page.waitForTimeout(400)
await shot('signature-result')

await page.goto(`${BASE}/#/compress-pdf`)
await page.waitForSelector('text=Compress')
await page.waitForTimeout(300)
await shot('compress-pdf')

await browser.close()
