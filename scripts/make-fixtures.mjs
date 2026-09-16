/**
 * Generates the images and PDFs the end-to-end suite runs against, so the
 * tests are reproducible without checking binaries into the repo.
 *
 *   node scripts/make-fixtures.mjs
 */
import { chromium } from 'playwright'
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setGraphicsState,
} from 'pdf-lib'
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

// Already small. Proves the app never enlarges: given a generous limit there is
// nothing to spend it on, and inventing pixels is not an improvement.
await draw('test-photo-small.jpg', 240, 320, PHOTO, { a: '#7a5c9e', b: '#d6a2ad' })

// What a phone camera actually hands over, and the only fixture past the 2400px
// cap in image.ts — so the only one that takes the slow path through
// loadCappedImage: decode, redraw, re-encode. That path ran with nothing on
// screen, which is the several seconds the app spent looking hung.
await draw('test-photo-huge.jpg', 4032, 3024, PHOTO, { a: '#2d6cdf', b: '#e8c547' })
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

/**
 * A scan where one page carries a transfer function, and one a soft mask.
 *
 * Both are ordinary things for a scanner or a design tool to leave behind, and
 * both make pdf.js ask its filter factory for an SVG filter — which is the one
 * thing a worker, having no document, cannot produce. This is the shape of the
 * file that failed on page 156 of 224: unremarkable everywhere else.
 */
async function filterPdf(name, pages, { trPage, smaskPage = -1, exponent = 2 }) {
  const doc = await PDFDocument.create()

  // pdf.js drops a transfer function named /Identity before it ever reaches the
  // filter factory, but not one spelled out as a function — so `exponent: 1` is
  // a curve that computes identity the long way, which is what a scanner leaves
  // behind, and `exponent: 2` is a gamma curve that really does change the page.
  const curve = doc.context.register(
    doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: exponent }),
  )
  const trState = doc.context.register(doc.context.obj({ Type: 'ExtGState', TR: curve }))

  // A luminosity mask: a grey form, so the page under it is half faded.
  const maskContent = doc.context.stream('0.5 g 0 0 595 842 re f')
  const maskForm = doc.context.register(
    doc.context.obj({
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 595, 842],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceGray' },
      Length: maskContent.getContentsSize(),
    }),
  )
  doc.context.assign(maskForm, maskContent)
  const smaskState = doc.context.register(
    doc.context.obj({
      Type: 'ExtGState',
      SMask: { Type: 'Mask', S: 'Luminosity', G: maskForm },
    }),
  )

  for (let i = 0; i < pages; i++) {
    // Photographic, and different on every page, so rasterising is plainly
    // worth it and the compressor renders rather than copying the file through.
    const dataUrl = await page.evaluate(
      ({ seed }) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1000
        canvas.height = 1400
        const ctx = canvas.getContext('2d')
        const image = ctx.createImageData(canvas.width, canvas.height)
        const data = image.data
        let state = seed * 2654435761
        for (let p = 0; p < data.length; p += 4) {
          state = (state * 1103515245 + 12345) & 0x7fffffff
          data[p] = state & 0xff
          data[p + 1] = (state >> 8) & 0xff
          data[p + 2] = (state >> 16) & 0xff
          data[p + 3] = 255
        }
        ctx.putImageData(image, 0, 0)
        ctx.filter = 'blur(1.5px)'
        ctx.drawImage(canvas, 0, 0)
        ctx.filter = 'none'
        return canvas.toDataURL('image/jpeg', 0.82)
      },
      { seed: i + 1 },
    )
    const image = await doc.embedJpg(Buffer.from(dataUrl.split(',')[1], 'base64'))

    const pg = doc.addPage([595, 842])
    if (i === trPage) {
      pg.node.setExtGState(PDFName.of('FrTr'), trState)
      pg.pushOperators(pushGraphicsState(), setGraphicsState('FrTr'))
    } else if (i === smaskPage) {
      pg.node.setExtGState(PDFName.of('FrSm'), smaskState)
      pg.pushOperators(pushGraphicsState(), setGraphicsState('FrSm'))
    }
    pg.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
    if (i === trPage || i === smaskPage) pg.pushOperators(popGraphicsState())
  }

  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log(
    'wrote',
    name,
    (bytes.byteLength / 1024).toFixed(0),
    'KB',
    `(${pages} pages; transfer function on ${trPage + 1}${smaskPage >= 0 ? `, soft mask on ${smaskPage + 1}` : ''})`,
  )
}

/**
 * A book scan, in the shape that came back softer than it needed to be.
 *
 * The reported case was a 224-page radiology text: ordinary scanned pages,
 * generously encoded, with a limit that left real room to work in. What makes
 * it useful here is that room — its pages sit well above the compressor's
 * legibility floor, so a limit set above that floor is one the compressor can
 * either spend or leave sitting unused.
 */
async function bookScanPdf(name, pages, { width = 1400, height = 1980, quality = 0.9 } = {}) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const dataUrl = await page.evaluate(
      ({ n, width, height, quality }) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const u = width / 1400
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fbfaf7'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        // Light grain only. Heavy speckle encodes like noise and pins the page
        // against the floor, which is the opposite of the case being modelled.
        for (let g = 0; g < Math.round(4000 * u * u); g++) {
          ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`
          ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2)
        }
        ctx.fillStyle = '#141414'
        ctx.font = `bold ${Math.round(34 * u)}px Georgia, serif`
        ctx.fillText(`Chapter note ${n}`, 110 * u, 150 * u)
        ctx.font = `${Math.round(25 * u)}px Georgia, serif`
        const line =
          'This radiograph demonstrates a large right-sided effusion with an air-fluid'
        for (let l = 0; l < 44; l++) {
          ctx.fillText(line, 110 * u, (230 + l * 38) * u)
        }
        return canvas.toDataURL('image/jpeg', quality)
      },
      { n: i + 1, width, height, quality },
    )
    const image = await doc.embedJpg(Buffer.from(dataUrl.split(',')[1], 'base64'))
    const pg = doc.addPage([595, 842])
    pg.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log(
    'wrote',
    name,
    (bytes.byteLength / 1024).toFixed(0),
    'KB',
    `(${pages} book-scan pages, ${(bytes.byteLength / 1024 / pages).toFixed(0)} KB each)`,
  )
}

/**
 * A practice book: a plate, then its report, then the next plate.
 *
 * Every other fixture here has pages that all weigh about the same, which is
 * the one shape that cannot expose a biased sampler. A real case book
 * alternates — an X-ray, then a page of solid text — and the reported 224-page
 * radiology book is exactly that. Its two-page rhythm against a sampler walking
 * in even strides is what made a 30 MB limit come back at 22 MB and a 15 MB
 * limit at 11: the same 73% both times.
 */
async function alternatingPdf(name, pages) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const plate = i % 2 === 0
    const dataUrl = await page.evaluate(
      ({ n, plate }) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1400
        canvas.height = 1980
        const ctx = canvas.getContext('2d')
        if (plate) {
          // A radiograph: dark, smooth gradients, fine grain. Expensive to encode.
          const grad = ctx.createRadialGradient(700, 990, 80, 700, 990, 1100)
          grad.addColorStop(0, '#d8d8d8')
          grad.addColorStop(0.55, '#6a6a6a')
          grad.addColorStop(1, '#0a0a0a')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = image.data
          let state = (n + 1) * 2654435761
          for (let p = 0; p < data.length; p += 4) {
            state = (state * 1103515245 + 12345) & 0x7fffffff
            const noise = ((state >> 8) & 0x3f) - 32
            data[p] = Math.max(0, Math.min(255, data[p] + noise))
            data[p + 1] = Math.max(0, Math.min(255, data[p + 1] + noise))
            data[p + 2] = Math.max(0, Math.min(255, data[p + 2] + noise))
          }
          ctx.putImageData(image, 0, 0)
        } else {
          // The report facing it: mostly white paper, cheap to encode.
          ctx.fillStyle = '#fcfcfa'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#c2185b'
          ctx.font = 'bold 30px Helvetica, Arial, sans-serif'
          ctx.fillText('SUMMARY, INVESTIGATIONS & MANAGEMENT', 110, 140)
          ctx.fillStyle = '#1a1a1a'
          ctx.font = '25px Georgia, serif'
          const line = 'This radiograph demonstrates a large right-sided effusion with an'
          for (let l = 0; l < 40; l++) ctx.fillText(line, 110, 220 + l * 38)
        }
        return canvas.toDataURL('image/jpeg', plate ? 0.45 : 0.4)
      },
      { n: i, plate },
    )
    const image = await doc.embedJpg(Buffer.from(dataUrl.split(',')[1], 'base64'))
    const pg = doc.addPage([595, 842])
    pg.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
  }
  const bytes = await doc.save()
  fs.writeFileSync(path.join(OUT, name), bytes)
  console.log(
    'wrote',
    name,
    (bytes.byteLength / 1024 / 1024).toFixed(1),
    'MB',
    `(${pages} pages, alternating plate and report)`,
  )
}

await alternatingPdf('test-doc-casebook.pdf', 120)
await bookScanPdf('test-doc-book.pdf', 24)
// The reported file's actual shape, and the only one that takes its path: past
// 60 pages the compressor stops inspecting pages, and past 24 MB it stops
// holding a parsed document, so every page is rasterised from a projection made
// off a handful of samples. Nothing shorter exercises that.
await bookScanPdf('test-doc-longbook.pdf', 120, { width: 1654, height: 2339, quality: 0.5 })
await filterPdf('test-doc-filters.pdf', 6, { trPage: 3, smaskPage: 4 })
await filterPdf('test-doc-identity-tr.pdf', 4, { trPage: 2, exponent: 1 })
await scannedPdf('test-doc-scan.pdf', 10)
await hugePdf('test-doc-huge.pdf', 41)

/**
 * A file broken in a way that has nothing to do with size, so the message a
 * user sees can be checked against the real cause rather than "too large" by
 * default. Truncating mid-object breaks the xref table every reader needs to
 * find anything at all — pdf.js reports this as InvalidPDFException, not an
 * allocation failure.
 */
async function corruptedPdf(name) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 40; i++) {
    const pg = doc.addPage([400, 400])
    pg.drawText(`This will not survive. Page ${i + 1}.`, { x: 40, y: 200, size: 16, font })
  }
  const bytes = await doc.save()
  // Enough of the file survives to clear the app's own minimum-target check,
  // but the xref table every reader needs is gone.
  const truncated = bytes.slice(0, Math.max(8 * 1024, Math.floor(bytes.byteLength * 0.6)))
  fs.writeFileSync(path.join(OUT, name), truncated)
  console.log('wrote', name, (truncated.byteLength / 1024).toFixed(1), 'KB (truncated, deliberately unreadable)')
}

/**
 * The standard 40-bit RC4 security handler (PDF 1.7 spec, Algorithm 3.2–3.4),
 * built from Node's own crypto rather than a dependency, since pdf-lib cannot
 * write an encrypted file at all. Deliberately minimal: the one page's
 * content stream is empty, so nothing on the page itself ever needs to be
 * RC4-encrypted — only the /O and /U values have to be right, which is what
 * makes pdf.js demand a password before it will read anything.
 */
async function encryptedPdf(name, userPassword) {
  const crypto = await import('node:crypto')
  const PAD = Buffer.from([
    0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00,
    0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
  ])
  const pad = (pw) => {
    const buf = Buffer.alloc(32)
    const pwBuf = Buffer.from(pw, 'latin1').subarray(0, 32)
    pwBuf.copy(buf)
    PAD.copy(buf, pwBuf.length, 0, 32 - pwBuf.length)
    return buf
  }
  // Node's OpenSSL 3 disables RC4 in its default provider, and this file
  // needs no other cipher, so the (tiny) algorithm is written out directly.
  const rc4 = (key, data) => {
    const s = new Uint8Array(256)
    for (let i = 0; i < 256; i++) s[i] = i
    let j = 0
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) & 0xff
      ;[s[i], s[j]] = [s[j], s[i]]
    }
    const out = Buffer.alloc(data.length)
    let i = 0
    j = 0
    for (let k = 0; k < data.length; k++) {
      i = (i + 1) & 0xff
      j = (j + s[i]) & 0xff
      ;[s[i], s[j]] = [s[j], s[i]]
      out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff]
    }
    return out
  }
  const md5 = (buf) => crypto.default.createHash('md5').update(buf).digest()

  const fileId = crypto.default.randomBytes(16)
  const paddedUser = pad(userPassword)
  const ownerKey = md5(pad(userPassword)).subarray(0, 5) // owner password == user password here; only the refusal matters
  const O = rc4(ownerKey, paddedUser)
  const P = Buffer.alloc(4)
  P.writeInt32LE(-3904, 0) // an unremarkable permission set
  const fileKey = md5(Buffer.concat([paddedUser, O, P, fileId])).subarray(0, 5)
  const U = rc4(fileKey, PAD)

  const hex = (buf) => `<${buf.toString('hex')}>`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << >> >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    `<< /Filter /Standard /V 1 /R 2 /O ${hex(O)} /U ${hex(U)} /P ${P.readInt32LE(0)} >>`,
  ]

  let out = '%PDF-1.4\n%' + '~'.repeat(20000) + '\n'
  const offsets = [0]
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 5 0 R /ID [${hex(fileId)} ${hex(fileId)}] >>\nstartxref\n${xrefStart}\n%%EOF`

  fs.writeFileSync(path.join(OUT, name), Buffer.from(out, 'latin1'))
  console.log('wrote', name, 'requires a password this app is never given')
}

await corruptedPdf('test-doc-corrupt.pdf')
await encryptedPdf('test-doc-locked.pdf', 'sc4nn3r')
// Matches the reported failure (a 42 MB scanned book) closely enough to be
// the regression test for it, cheap enough (~10s) to generate every run.
await hugePdfBatched('test-doc-45mb.pdf', 180, 45)

/**
 * The reported case, and the search for where compressing genuinely stops
 * working on this machine. Image-heavy, since that's what makes a real PDF
 * this large — a book of dense text alone would never reach these sizes.
 * Rendered in batches so the browser tab isn't asked to hold hundreds of
 * full-resolution canvases in memory at once, which would just move the
 * problem this fixture exists to find.
 */
async function hugePdfBatched(name, pages, targetMb) {
  const doc = await PDFDocument.create()
  const BATCH = 20
  const t0 = Date.now()
  for (let start = 0; start < pages; start += BATCH) {
    const count = Math.min(BATCH, pages - start)
    const dataUrls = await page.evaluate(
      ({ count, start }) => {
        const out = []
        for (let i = 0; i < count; i++) {
          const canvas = document.createElement('canvas')
          canvas.width = 1000
          canvas.height = 1400
          const ctx = canvas.getContext('2d')
          const image = ctx.createImageData(canvas.width, canvas.height)
          const data = image.data
          let state = (start + i + 1) * 2654435761
          for (let p = 0; p < data.length; p += 4) {
            state = (state * 1103515245 + 12345) & 0x7fffffff
            data[p] = state & 0xff
            data[p + 1] = (state >> 8) & 0xff
            data[p + 2] = (state >> 16) & 0xff
            data[p + 3] = 255
          }
          ctx.putImageData(image, 0, 0)
          ctx.filter = 'blur(1.5px)'
          ctx.drawImage(canvas, 0, 0)
          ctx.filter = 'none'
          out.push(canvas.toDataURL('image/jpeg', 0.82))
          canvas.width = 0
          canvas.height = 0
        }
        return out
      },
      { count, start },
    )
    for (const dataUrl of dataUrls) {
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
      const embedded = await doc.embedJpg(bytes)
      const pdfPage = doc.addPage([595, 842])
      pdfPage.drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 })
    }
    console.log(
      `  ${name}: ${start + count}/${pages} pages (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
    )
  }
  const out = await doc.save()
  fs.writeFileSync(path.join(OUT, name), out)
  console.log(
    'wrote',
    name,
    (out.byteLength / 1024 / 1024).toFixed(1),
    'MB',
    `(${pages} pages, target ~${targetMb}MB, ${((Date.now() - t0) / 1000).toFixed(0)}s)`,
  )
}

// ~250 KB/page measured from test-doc-huge.pdf (41 pages -> 10 MB).
await browser.close()
