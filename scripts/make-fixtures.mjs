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

/**
 * A plain portrait: smooth background, soft shapes, almost no fine detail.
 *
 * This is the shape behind the complaint. Squeezed into 200×230 it encodes to
 * only a few kilobytes even at maximum quality — which is under the 20 KB floor
 * SSC states, so the form would reject it. A busy fixture cannot catch that,
 * because a busy photo clears the floor comfortably.
 */
const PLAIN_PORTRAIT = `
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#eef2f7'); g.addColorStop(1, '#dde5ee');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c9b9a8';
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.42, w * 0.17, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b6b80';
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.95, w * 0.3, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
`
await draw('test-photo-plain.jpg', 1500, 1500, PLAIN_PORTRAIT, {})
await draw('blue-signature.jpg', 900, 400, SIGNATURE, { ink: '#1B3F9B' })
await draw('black-signature.jpg', 900, 400, SIGNATURE, { ink: '#141414' })

/**
 * Same as draw(), but writes a PNG and leaves the background transparent.
 *
 * Phone screenshots arrive as PNGs with an alpha channel, and they were what
 * the Image to PDF failure was reported against.
 */
async function drawPng(name, width, height, script, args) {
  const dataUrl = await page.evaluate(
    ({ width, height, script, args }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      // eslint-disable-next-line no-new-func
      new Function('ctx', 'w', 'h', 'args', script)(ctx, width, height, args)
      return canvas.toDataURL('image/png')
    },
    { width, height, script, args },
  )
  fs.writeFileSync(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('wrote', name)
}

const SCREENSHOT = `
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(20,24,33,0.86)';
  ctx.fillRect(0, 120, w, h - 240);
  ctx.fillStyle = '#f4f6fb';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText(args.title, 60, 320);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(60, 420 + i * 96, w - 120 - Math.random() * 260, 44);
  }
`

// Phone screenshot proportions, with an alpha channel and no EXIF.
await drawPng('screenshot-1.png', 1080, 2400, SCREENSHOT, { title: 'Application' })
await drawPng('screenshot-2.png', 1080, 2400, SCREENSHOT, { title: 'Admit card' })

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

/**
 * A document whose first page is nothing like the rest: a flat cover, then
 * pages of dense photographic noise.
 *
 * Calibration reads one page to choose a quality, so a cheap cover makes it
 * far too optimistic about the rest. This is the shape that overshot the target
 * on the first pass and sent the compressor back to render every page a second
 * time — the bug where progress appeared to restart at zero.
 */
async function unevenPdf(name, pages) {
  const doc = await PDFDocument.create()
  const cover = fs.readFileSync(path.join(OUT, 'fixture-flat.jpg'))
  const dense = fs.readFileSync(path.join(OUT, 'fixture-noise.jpg'))

  const coverImage = await doc.embedJpg(cover)
  const first = doc.addPage([595, 842])
  first.drawImage(coverImage, { x: 0, y: 0, width: 595, height: 842 })

  const denseImage = await doc.embedJpg(dense)
  for (let i = 1; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawImage(denseImage, { x: 0, y: 0, width: 595, height: 842 })
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log('wrote', name, (bytes.byteLength / 1024 / 1024).toFixed(1), 'MB', `(${pages} pages)`)
}

// A flat cover encodes to almost nothing; pure noise is the most expensive
// thing a JPEG encoder can be handed.
await draw('fixture-flat.jpg', 1240, 1754, `
  ctx.fillStyle = '#e8eef7'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1b2330'; ctx.font = 'bold 90px sans-serif';
  ctx.fillText('COVER', 80, 300);
`)
await draw('fixture-noise.jpg', 1240, 1754, `
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.random() * 255;
    img.data[i + 1] = Math.random() * 255;
    img.data[i + 2] = Math.random() * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
`)

await textPdf('test-doc-a.pdf', 3, 'Document A')
await textPdf('test-doc-b.pdf', 2, 'Document B')
await textPdf('test-doc-big.pdf', 6, 'Big document')
await imagePdf('test-doc-heavy.pdf')

/**
 * A long, heavy document in the shape that crashed the app on a real phone:
 * tens of pages of high-entropy photography. Each page gets its own image so
 * the PDF can't dedupe them down to something small.
 */
async function hugePdf(name, pages) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const dataUrl = await page.evaluate(
      ({ seed }) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1000
        canvas.height = 1400
        const ctx = canvas.getContext('2d')
        const image = ctx.createImageData(canvas.width, canvas.height)
        const data = image.data
        // Pseudo-random noise compresses badly, which is the point.
        let state = seed * 2654435761
        for (let p = 0; p < data.length; p += 4) {
          state = (state * 1103515245 + 12345) & 0x7fffffff
          data[p] = state & 0xff
          data[p + 1] = (state >> 8) & 0xff
          data[p + 2] = (state >> 16) & 0xff
          data[p + 3] = 255
        }
        ctx.putImageData(image, 0, 0)
        // Soften slightly so it compresses like a scan rather than pure static.
        ctx.filter = 'blur(1.5px)'
        ctx.drawImage(canvas, 0, 0)
        ctx.filter = 'none'
        return canvas.toDataURL('image/jpeg', 0.82)
      },
      { seed: i + 1 },
    )
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
    const embedded = await doc.embedJpg(bytes)
    const pdfPage = doc.addPage([595, 842])
    pdfPage.drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 })
  }
  const out = await doc.save()
  fs.writeFileSync(path.join(OUT, name), out)
  console.log('wrote', name, (out.byteLength / 1024 / 1024).toFixed(1), 'MB', `(${pages} pages)`)
}

/** Text pages and photo pages in one file: the case where keeping text sharp matters. */
async function mixedPdf(name) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const photo = fs.readFileSync(path.join(OUT, 'test-photo-1.jpg'))
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      const p = doc.addPage([595, 842])
      p.drawText(`Text page ${i + 1}`, { x: 50, y: 780, size: 24, font })
      for (let j = 0; j < 30; j++) {
        p.drawText(`Line ${j} that must stay sharp and selectable after compression.`, {
          x: 50,
          y: 730 - j * 16,
          size: 11,
          font,
        })
      }
    } else {
      const embedded = await doc.embedJpg(photo)
      const p = doc.addPage([595, 842])
      p.drawImage(embedded, { x: 20, y: 20, width: 555, height: 800 })
    }
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log('wrote', name, bytes.byteLength, 'bytes')
}

/**
 * A long, text-heavy document — the shape that took 64 minutes to get nowhere.
 * Re-encoding pages like these makes them larger, so the compressor must work
 * that out from a sample rather than by rendering all of them.
 */
async function longTextPdf(name, pages) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`Chapter notes — page ${i + 1}`, { x: 50, y: 790, size: 16, font })
    for (let j = 0; j < 44; j++) {
      p.drawText(
        `${j + 1}. Dense line of body text on page ${i + 1} that a reader would want to stay sharp.`,
        { x: 50, y: 760 - j * 17, size: 9.5, font },
      )
    }
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log('wrote', name, (bytes.byteLength / 1024 / 1024).toFixed(1), 'MB', `(${pages} pages)`)
}

await mixedPdf('test-doc-mixed.pdf')
await longTextPdf('test-doc-long-text.pdf', 300)
await unevenPdf('test-doc-uneven.pdf', 24)

/**
 * A scanned book: every page is a photograph of text, with no text layer.
 *
 * This is the shape that came back unreadable. There is nothing to copy across
 * and nothing to keep sharp by leaving it alone — the words only survive if the
 * compressor refuses to drop below a legible resolution.
 */
async function scannedPdf(name, pages) {
  // 300 DPI A4 — what a scanner app actually hands you, and far more than a
  // screen needs. There is a lot to reclaim here, but not without limit.
  const scan = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2480
    canvas.height = 3508
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f7f5f0'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Faint paper grain, so it reads as a scan rather than clean vector text.
    for (let i = 0; i < 24000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2)
    }
    ctx.fillStyle = '#1a1a1a'
    ctx.font = '56px Georgia, serif'
    const line =
      'The collective gross body and the individual gross body are in essence'
    for (let i = 0; i < 40; i++) {
      ctx.fillText(line, 240, 360 + i * 76)
    }
    // Generously encoded, the way a scanner app leaves it: there is real
    // room to compress here, but not unlimited room.
    return canvas.toDataURL('image/jpeg', 0.96)
  })

  const doc = await PDFDocument.create()
  const image = await doc.embedJpg(Buffer.from(scan.split(',')[1], 'base64'))
  for (let i = 0; i < pages; i++) {
    const pg = doc.addPage([595, 842])
    pg.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log('wrote', name, (bytes.byteLength / 1024).toFixed(0), 'KB', `(${pages} scanned pages)`)
}

await scannedPdf('test-doc-scan.pdf', 10)
await hugePdf('test-doc-huge.pdf', 41)

await browser.close()
