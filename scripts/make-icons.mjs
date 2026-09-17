/**
 * Draws the FormReady mark at every size Android and the web need.
 *
 * The supplied artwork was 106x128, far too small for a 432px adaptive icon,
 * so the mark is redrawn here as vector art and rasterised per density.
 *
 *   node scripts/make-icons.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const RES = path.resolve('android/app/src/main/res')
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const BLUE_LIGHT = '#2E8BF0'
const BLUE_DARK = '#1152C4'
const GREEN = '#21C55D'

const densities = [
  { name: 'mdpi', full: 48, fg: 108 },
  { name: 'hdpi', full: 72, fg: 162 },
  { name: 'xhdpi', full: 96, fg: 216 },
  { name: 'xxhdpi', full: 144, fg: 324 },
  { name: 'xxxhdpi', full: 192, fg: 432 },
]

const splashTargets = [
  ['drawable-land-hdpi/splash.png', 800, 480],
  ['drawable-land-mdpi/splash.png', 480, 320],
  ['drawable-land-xhdpi/splash.png', 1280, 720],
  ['drawable-land-xxhdpi/splash.png', 1600, 960],
  ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
  ['drawable-port-hdpi/splash.png', 480, 800],
  ['drawable-port-mdpi/splash.png', 320, 480],
  ['drawable-port-xhdpi/splash.png', 720, 1280],
  ['drawable-port-xxhdpi/splash.png', 960, 1600],
  ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ['drawable/splash.png', 480, 320],
]

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage()
await page.goto('about:blank')

/**
 * @param mode  'full' square tile, 'round' circular tile, 'foreground'
 *              (transparent, inset for the adaptive-icon safe zone), or
 *              'mark' (transparent, edge to edge) for splash and web use.
 */
async function render(width, height, mode, colors) {
  const dataUrl = await page.evaluate(
    ({ width, height, mode, colors }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      function roundRect(x, y, w, h, r) {
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + w, y, x + w, y + h, r)
        ctx.arcTo(x + w, y + h, x, y + h, r)
        ctx.arcTo(x, y + h, x, y, r)
        ctx.arcTo(x, y, x + w, y, r)
        ctx.closePath()
      }

      // The mark: a shield holding a document, with a confirmation badge.
      function drawMark(cx, cy, s) {
        const top = cy - s * 0.46
        const bottom = cy + s * 0.47
        const halfW = s * 0.34

        ctx.beginPath()
        ctx.moveTo(cx, top)
        ctx.lineTo(cx + halfW, top + s * 0.13)
        ctx.lineTo(cx + halfW, cy + s * 0.06)
        ctx.quadraticCurveTo(cx + halfW, cy + s * 0.32, cx, bottom)
        ctx.quadraticCurveTo(cx - halfW, cy + s * 0.32, cx - halfW, cy + s * 0.06)
        ctx.lineTo(cx - halfW, top + s * 0.13)
        ctx.closePath()
        ctx.fillStyle = '#ffffff'
        ctx.fill()

        // Document inside the shield.
        const docW = s * 0.34
        const docH = s * 0.4
        const docX = cx - docW / 2
        const docY = cy - s * 0.24
        roundRect(docX, docY, docW, docH, s * 0.05)
        ctx.fillStyle = colors.blueDark
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        const lineH = Math.max(1, s * 0.035)
        for (let i = 0; i < 3; i++) {
          const w = i === 2 ? docW * 0.42 : docW * 0.62
          roundRect(docX + docW * 0.19, docY + docH * (0.22 + i * 0.24), w, lineH, lineH / 2)
          ctx.fill()
        }

        // Confirmation badge, overlapping the lower right of the shield.
        const br = s * 0.185
        const bx = cx + s * 0.26
        const by = cy + s * 0.28
        ctx.beginPath()
        ctx.arc(bx, by, br * 1.22, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fillStyle = colors.green
        ctx.fill()

        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = Math.max(1.4, s * 0.055)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(bx - br * 0.44, by + br * 0.02)
        ctx.lineTo(bx - br * 0.09, by + br * 0.36)
        ctx.lineTo(bx + br * 0.47, by - br * 0.35)
        ctx.stroke()
      }

      const shortest = Math.min(width, height)

      if (mode === 'full' || mode === 'round') {
        if (mode === 'round') {
          ctx.save()
          ctx.beginPath()
          ctx.arc(width / 2, height / 2, shortest / 2, 0, Math.PI * 2)
          ctx.clip()
        }
        const g = ctx.createLinearGradient(0, 0, width, height)
        g.addColorStop(0, colors.blueLight)
        g.addColorStop(1, colors.blueDark)
        ctx.fillStyle = g
        if (mode === 'round') {
          ctx.fillRect(0, 0, width, height)
        } else {
          roundRect(0, 0, width, height, shortest * 0.22)
          ctx.fill()
        }
        drawMark(width / 2, height / 2, shortest * 0.6)
        if (mode === 'round') ctx.restore()
      } else if (mode === 'foreground') {
        // Adaptive icons show only the inner 72 of the 108-unit layer, so the
        // mark has to be measured against that circle rather than the canvas.
        // The badge is the part that reaches furthest out: its outer edge sits
        // at 0.608s from the centre, which touches the mask at s = 0.548. 0.48
        // fills the visible area while keeping the check clear of the edge.
        drawMark(width / 2, height / 2, shortest * 0.48)
      } else if (mode === 'splash') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        const tile = shortest * 0.26
        const g = ctx.createLinearGradient(
          width / 2 - tile / 2,
          height / 2 - tile / 2,
          width / 2 + tile / 2,
          height / 2 + tile / 2,
        )
        g.addColorStop(0, colors.blueLight)
        g.addColorStop(1, colors.blueDark)
        ctx.fillStyle = g
        roundRect(width / 2 - tile / 2, height / 2 - tile / 2, tile, tile, tile * 0.22)
        ctx.fill()
        drawMark(width / 2, height / 2, tile * 0.6)
      }

      return canvas.toDataURL('image/png')
    },
    { width, height, mode, colors },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

const colors = { blueLight: BLUE_LIGHT, blueDark: BLUE_DARK, green: GREEN }

for (const d of densities) {
  const dir = path.join(RES, `mipmap-${d.name}`)
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await render(d.full, d.full, 'full', colors))
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await render(d.full, d.full, 'round', colors))
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await render(d.fg, d.fg, 'foreground', colors))
  console.log('icons', d.name)
}

for (const [rel, w, h] of splashTargets) {
  fs.writeFileSync(path.join(RES, rel), await render(w, h, 'splash', colors))
}
console.log('splash screens written')

fs.mkdirSync(path.resolve('store-assets'), { recursive: true })
fs.writeFileSync(path.resolve('store-assets/icon-512.png'), await render(512, 512, 'full', colors))
console.log('store icon written')

await browser.close()
