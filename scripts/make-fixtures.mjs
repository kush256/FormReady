/**
 * Generates the images and PDFs the end-to-end suite runs against, so the
 * tests are reproducible without checking binaries into the repo.
 *
 *   node scripts/make-fixtures.mjs
 */
import { chromium } from 'playwright'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('.fixtures')
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage()
await page.goto('about:blank')

async function draw(name, width, height, script, args) {
  const dataUrl = await page.evaluate(
    ({ width, height, script, args }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      // eslint-disable-next-line no-new-func
      new Function('ctx', 'w', 'h', 'args', script)(ctx, width, height, args)
      return canvas.toDataURL('image/jpeg', 0.95)
    },
    { width, height, script, args },
  )
  fs.writeFileSync(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('wrote', name)
}

const PHOTO = `
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, args.a); g.addColorStop(1, args.b);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let i = 0; i < 400; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 20, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#111'; ctx.font = '48px sans-serif'; ctx.fillText('TEST PHOTO', 20, 60);
`

const SIGNATURE = `
  ctx.fillStyle = '#FCFCFA'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = args.ink; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(90, 260);
  ctx.bezierCurveTo(170, 90, 250, 330, 330, 190);
  ctx.bezierCurveTo(400, 80, 450, 300, 520, 210);
  ctx.bezierCurveTo(590, 130, 650, 300, 760, 170);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(150, 300); ctx.lineTo(700, 292); ctx.stroke();
`

await draw('test-photo-1.jpg', 1600, 1200, PHOTO, { a: '#4a90d9', b: '#7bc47f' })
await draw('test-photo-2.jpg', 1200, 1600, PHOTO, { a: '#e07a5f', b: '#f2cc8f' })
await draw('blue-signature.jpg', 900, 400, SIGNATURE, { ink: '#1B3F9B' })
await draw('black-signature.jpg', 900, 400, SIGNATURE, { ink: '#141414' })

async function textPdf(name, pages, label) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`${label} — page ${i + 1}`, { x: 50, y: 780, size: 24, font })
    p.drawRectangle({ x: 50, y: 400, width: 495, height: 300, color: rgb(0.7, 0.8, 0.95) })
    for (let j = 0; j < 20; j++) {
      p.drawText(`Line ${j} of filler text on ${label} page ${i + 1}.`, { x: 50, y: 350 - j * 14, size: 10, font })
    }
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log('wrote', name, bytes.byteLength, 'bytes')
}

async function imagePdf(name) {
  const doc = await PDFDocument.create()
  const a = fs.readFileSync(path.join(OUT, 'test-photo-1.jpg'))
  const b = fs.readFileSync(path.join(OUT, 'test-photo-2.jpg'))
  for (let i = 0; i < 5; i++) {
    const embedded = await doc.embedJpg(i % 2 === 0 ? a : b)
    const p = doc.addPage([595, 842])
    p.drawImage(embedded, { x: 20, y: 20, width: 555, height: 800 })
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log('wrote', name, bytes.byteLength, 'bytes')
}

await textPdf('test-doc-a.pdf', 3, 'Document A')
await textPdf('test-doc-b.pdf', 2, 'Document B')
await textPdf('test-doc-big.pdf', 6, 'Big document')
await imagePdf('test-doc-heavy.pdf')

await browser.close()
