/**
 * End-to-end suite. Drives the built app in a real browser against generated
 * files, checking that dimensions, size caps, page counts and the ink check
 * all still hold.
 *
 *   node scripts/make-fixtures.mjs
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/e2e.mjs
 */
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const A = path.resolve('.fixtures')
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const failures = []
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name} ${extra}`)
  if (!ok) failures.push(name)
}

async function openTool(page, hash) {
  await page.goto(BASE)
  await page.waitForSelector('text=FormReady')
  await page.goto(`${BASE}/#/${hash}`)
}

/** The introduction is shown once; skip past it for the rest of the suite. */
async function completeOnboarding(page) {
  await page.goto(BASE)
  await page.waitForSelector('text=FormReady')
  if ((await page.locator('button:has-text("Skip")').count()) > 0) {
    await page.locator('button:has-text("Skip")').click()
    await page.waitForSelector('text=Quick Tools')
  }
}

async function pickFile(page, trigger, files) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger()])
  await chooser.setFiles(files)
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE })
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
  // Saving falls back to a browser download outside Capacitor; capture it.
  const downloads = []
  const savedTo = new Map()
  page.on('download', async (d) => {
    downloads.push(d.suggestedFilename())
    const dest = path.join(A, `saved-${d.suggestedFilename()}`)
    try {
      await d.saveAs(dest)
      savedTo.set(d.suggestedFilename(), dest)
    } catch {
      // A download that cannot be written is caught by the checks that use it.
    }
  })

  // ---- Onboarding shows on first launch ----
  await page.goto(BASE)
  await page.waitForSelector('text=FormReady')
  check('First launch shows the introduction', (await page.locator('text=Every form wants a different size').count()) > 0)
  await page.locator('button:has-text("Next")').click()
  await page.waitForTimeout(150)
  check('Introduction advances', (await page.locator('text=Pick your exam, get every document').count()) > 0)
  await page.locator('button:has-text("Next")').click()
  await page.waitForTimeout(150)
  check('Introduction ends on privacy', (await page.locator('text=Nothing ever leaves your phone').count()) > 0)
  await page.locator('button:has-text("Get started")').click()
  await page.waitForSelector('text=Quick Tools')
  check('Introduction leads to home', (await page.locator('text=Quick Tools').count()) > 0)
  await page.reload()
  await page.waitForSelector('text=Quick Tools')
  check('Introduction is not shown again', (await page.locator('text=Every form wants a different size').count()) === 0)

  // ---- Home ----
  await page.goto(BASE)
  await page.waitForSelector('text=FormReady')
  for (const name of ['Smart Photo', 'Signature Maker', 'Image to PDF', 'Resize Photo', 'Compress PDF', 'Merge PDF', 'Split PDF']) {
    check(`Home lists ${name}`, (await page.locator(`text=${name}`).count()) > 0)
  }
  check('Privacy footer intact', (await page.locator('text=Processed privately on your device').count()) > 0)

  // ---- Smart Photo: impossible requirement is caught before any work ----
  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  await page.locator('text=Custom requirement').click()
  const nums = page.locator('input[inputmode="numeric"]')
  await nums.nth(0).fill('3000')
  await nums.nth(1).fill('4000')
  await nums.nth(2).fill('20')
  await page.waitForTimeout(200)
  check("Impossible combo blocked up front", (await page.locator("text=isn't possible").count()) > 0)
  const continueDisabled = await page.locator('button:has-text("Continue")').isDisabled()
  check('Continue disabled while impossible', continueDisabled)
  // one-tap fix offered
  const fix = page.locator('button:has-text("Shrink to")')
  check('Offers a shrink fix', (await fix.count()) > 0)
  await fix.click()
  await page.waitForTimeout(200)
  check('Fix clears the error', (await page.locator("text=isn't possible").count()) === 0)

  // ---- Smart Photo: real run on a preset ----
  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  await page.locator('text=SSC / IBPS photo').click()
  await page.locator('button:has-text("Continue")').click()
  await page.waitForSelector('text=Add your photo')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-1.jpg`])
  await page.waitForSelector('text=Frame your photo')

  // Watch the preparing screen. It used to show a frozen bar and an ellipsis
  // with no number, which reads as a hang.
  let sawPanel = false
  let sawFrozen = false
  const prepWatch = setInterval(async () => {
    try {
      const panel = await page.locator('main').innerText()
      if (!/PREPARING YOUR PHOTO/i.test(panel)) return
      sawPanel = true
      if (panel.includes('…')) sawFrozen = true
    } catch {
      // Panel gone between polls; the run finished.
    }
  }, 25)

  await page.locator('button:has-text("Prepare photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  clearInterval(prepWatch)
  check('Preparing shows a real percentage, not a frozen bar', !sawFrozen, sawPanel ? 'panel observed' : 'panel too brief to observe')
  const sp = await page.locator('main').innerText()
  check('Smart Photo hits 200×230', sp.includes('200×230 px'))
  check('Smart Photo meets every requirement', sp.includes('Meets every requirement'))
  const sizes = [...sp.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))
  check('Result is smaller than the source', sizes.length >= 2 && sizes[1] < sizes[0], JSON.stringify(sizes))
  check('Result is under the 50 KB cap', sizes[1] <= 50, `${sizes[1]}KB`)
  // The cap is a ceiling, not a goal. A photo that could have been encoded at
  // full quality inside the allowance must not come back at a few kilobytes
  // with the rest of the budget thrown away.
  // 14 KB was the old ceiling-capped result; 39 KB is what the allowance buys.
  check('Photo uses the quality its limit allows', sizes[1] >= 25, `${sizes[1]} KB of a 50 KB allowance`)
  check('Save and Share are separate', (await page.locator('button:has-text("Save to device")').count()) === 1 && (await page.locator('button:has-text("Share")').count()) === 1)
  await page.locator('button:has-text("Save to device")').click()
  await page.waitForSelector('text=Saved to', { timeout: 10000 })
  check('Save confirms a destination', (await page.locator('text=Saved to').count()) > 0)

  // ---- Signature: blue ink detection ----
  await openTool(page, 'signature-maker')
  await page.waitForSelector('text=Add your signature')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/blue-signature.jpg`])
  await page.waitForSelector('text=Frame your signature')
  await page.locator('button:has-text("Prepare signature")').click()
  await page.waitForSelector('text=Your signature is ready', { timeout: 20000 })
  check('Blue ink detected', (await page.locator('text=Blue ink detected').count()) > 0)
  await page.locator('button:has-text("Convert to black ink")').click()
  await page.waitForTimeout(800)
  check('Blue ink warning clears after converting', (await page.locator('text=Blue ink detected').count()) === 0)
  const sig = await page.locator('main').innerText()
  check('Signature hits 140×60', sig.includes('140×60 px'))

  // ---- Signature: a black-ink signature is not falsely flagged ----
  await openTool(page, 'signature-maker')
  await page.waitForSelector('text=Add your signature')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/black-signature.jpg`])
  await page.waitForSelector('text=Frame your signature')
  await page.locator('button:has-text("Prepare signature")').click()
  await page.waitForSelector('text=Your signature is ready', { timeout: 20000 })
  check('Black ink not falsely flagged', (await page.locator('text=Blue ink detected').count()) === 0)

  // ---- Compress PDF: image-heavy, with timing ----
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-heavy.pdf`])
  await page.waitForSelector('text=Maximum size')
  await page.locator('input[inputmode="numeric"], input[inputmode="decimal"]').first().fill('200')
  const t0 = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 90000 })
  const heavyMs = Date.now() - t0
  const cp = await page.locator('main').innerText()
  const cpSizes = [...cp.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))
  check('Image PDF compressed smaller', cpSizes.length >= 2 && cpSizes[1] < cpSizes[0], JSON.stringify(cpSizes))
  console.log(`      image-heavy 848KB -> 200KB target took ${heavyMs}ms`)

  // ---- Mixed document: text pages must survive untouched ----
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-mixed.pdf`])
  await page.waitForSelector('text=Maximum size')
  await page.locator('input[inputmode="numeric"], input[inputmode="decimal"]').first().fill('150')
  const t1 = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 60000 })
  const mixedMs = Date.now() - t1
  const mixedText = await page.locator('main').innerText()
  console.log(`      mixed 503KB doc took ${mixedMs}ms`)
  check('Text pages kept sharp in a mixed doc', mixedText.includes('text pages kept sharp'), mixedText.match(/\d+ text pages kept sharp/)?.[0] ?? '')

  // ---- Merge ----
  await openTool(page, 'merge-pdf')
  await page.waitForSelector('text=Combine PDFs')
  await pickFile(page, () => page.locator('button:has-text("Select PDFs")').first().click(), [`${A}/test-doc-a.pdf`, `${A}/test-doc-b.pdf`])
  await page.waitForSelector('text=pages total')
  await page.locator('button:has-text("Merge (")').click()
  await page.waitForSelector('text=Your merged PDF is ready', { timeout: 20000 })
  check('Merge produced 5 pages', (await page.locator('main').innerText()).includes('5 pages'))

  // ---- Split ----
  await openTool(page, 'split-pdf')
  await page.waitForSelector('text=Extract PDF pages')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-big.pdf`])
  await page.waitForSelector('text=of 6 selected', { timeout: 30000 })
  await page.locator('input[placeholder*="1-3"]').fill('2-4')
  await page.locator('button:has-text("Apply")').click()
  await page.waitForSelector('text=3 of 6 selected')
  await page.locator('button:has-text("Extract 3 pages")').click()
  await page.waitForSelector('text=Your PDF is ready', { timeout: 20000 })
  check('Split extracted 3 pages', (await page.locator('main').innerText()).includes('3 pages'))

  // ---- Split opens a long document immediately, without rendering it all ----
  await openTool(page, 'split-pdf')
  await page.waitForSelector('text=Extract PDF pages')
  const splitStart = Date.now()
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-long-text.pdf`])
  await page.waitForSelector('text=of 300 selected', { timeout: 30000 })
  const splitOpenMs = Date.now() - splitStart
  check(`300-page PDF opens in under 6s (${splitOpenMs} ms)`, splitOpenMs < 6000, `${splitOpenMs} ms`)
  await page.waitForSelector('main .grid img', { timeout: 15000 })
  await page.waitForTimeout(1500)
  const renderedThumbs = await page.locator('main .grid img').count()
  check(
    `Only on-screen pages are drawn (${renderedThumbs} of 300)`,
    renderedThumbs > 0 && renderedThumbs < 60,
    `${renderedThumbs} images`,
  )
  await page.locator('input[placeholder*="1-3"]').fill('5-7')
  await page.locator('button:has-text("Apply")').click()
  await page.waitForSelector('text=3 of 300 selected')
  await page.locator('button:has-text("Extract 3 pages")').click()
  await page.waitForSelector('text=Your PDF is ready', { timeout: 30000 })
  check('Split works on a long document', (await page.locator('main').innerText()).includes('3 pages'))

  // ---- Image to PDF ----
  await openTool(page, 'image-to-pdf')
  await page.waitForSelector('text=Photos into one PDF')
  await pickFile(page, () => page.locator('button:has-text("Select photos")').click(), [`${A}/test-photo-1.jpg`, `${A}/test-photo-2.jpg`])
  await page.waitForSelector('text=Create PDF (2 pages)')
  await page.locator('button:has-text("Create PDF")').click()
  await page.waitForSelector('text=Your PDF is ready', { timeout: 30000 })
  check('Image to PDF made 2 pages', (await page.locator('main').innerText()).includes('2 pages'))

  // ---- Image to PDF from phone screenshots (PNG with an alpha channel) ----
  await openTool(page, 'image-to-pdf')
  await page.waitForSelector('text=Photos into one PDF')
  await pickFile(page, () => page.locator('button:has-text("Select photos")').click(), [
    `${A}/screenshot-1.png`,
    `${A}/screenshot-2.png`,
  ])
  await page.waitForSelector('text=Create PDF (2 pages)', { timeout: 20000 })
  await page.locator('button:has-text("Create PDF")').click()
  await page.waitForSelector('text=Your PDF is ready', { timeout: 40000 })
  const pngPdfText = await page.locator('main').innerText()
  check('Image to PDF accepts PNG screenshots', pngPdfText.includes('2 pages'))
  check('Image to PDF reports no failure on PNGs', !pngPdfText.includes('Could not create'))

  // ---- One unreadable file does not lose the whole batch ----
  await openTool(page, 'image-to-pdf')
  await page.waitForSelector('text=Photos into one PDF')
  await pickFile(page, () => page.locator('button:has-text("Select photos")').click(), [
    `${A}/test-photo-1.jpg`,
    `${A}/test-doc-a.pdf`,
  ])
  await page.waitForSelector('text=Create PDF (1 page)', { timeout: 20000 })
  check('Unreadable file is skipped, not fatal', (await page.locator('text=Skipped 1 file').count()) > 0)


  // ---- Size field: clearing and retyping (the "stuck at 10 KB" bug) ----
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-heavy.pdf`])
  await page.waitForSelector('text=Maximum size')
  const sizeField = page.locator('input[inputmode="numeric"], input[inputmode="decimal"]').first()
  await sizeField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  const afterClear = await sizeField.inputValue()
  check('Size field can be cleared', afterClear === '', JSON.stringify(afterClear))
  await page.keyboard.type('700')
  const typed = await sizeField.inputValue()
  check('Size field accepts a retyped value', typed === '700', typed)

  // ---- Unit toggle: people read limits in MB too ----
  await page.getByRole('button', { name: 'MB', exact: true }).click()
  await page.waitForTimeout(150)
  const mbField = page.locator('input[inputmode="decimal"]').first()
  await mbField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('2')
  await page.locator('body').click()
  await page.waitForTimeout(200)
  check('MB unit is selectable', (await page.locator('button[aria-pressed="true"]:has-text("MB")').count()) > 0)

  // ---- Wrong values are refused with an explanation ----
  await page.getByRole('button', { name: 'KB', exact: true }).click()
  const kbField = page.locator('input[inputmode="numeric"]').first()
  await kbField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('0')
  await page.locator('body').click()
  await page.waitForTimeout(250)
  check('Zero target is refused', (await page.locator('text=too small').count()) > 0)
  check('Compress blocked on a zero target', await page.locator('button:has-text("Compress PDF")').isDisabled())

  await kbField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('99999')
  await page.locator('body').click()
  await page.waitForTimeout(250)
  check('Target larger than the file is refused', (await page.locator('text=already that small').count()) > 0)

  // ---- Large document: the case that crashed on device ----
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-huge.pdf`])
  await page.waitForSelector('text=Maximum size')
  // A 10 MB file defaults the unit to MB, so aim at 2 MB in that unit.
  await page.getByRole('button', { name: 'MB', exact: true }).click()
  const hugeField = page.locator('input[inputmode="decimal"]').first()
  await hugeField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('2')
  await page.locator('body').click()
  await page.waitForTimeout(200)
  const tHuge = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  // Progress must appear and report pages, not sit blank.
  await page.waitForSelector('text=Page ', { timeout: 60000 })
  check('Large file reports page progress', (await page.locator('text=Page ').count()) > 0)
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 180000 })
  const hugeMs = Date.now() - tHuge
  const hugeText = await page.locator('main').innerText()
  console.log(`      10 MB / 41 pages -> 2 MB target took ${(hugeMs / 1000).toFixed(1)}s`)
  check('Large file compressed without crashing', hugeText.includes('smaller') || hugeText.includes('ready'))
  const hugeSizes = [...hugeText.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))
  check('Large file actually shrank', hugeSizes.length >= 2 && hugeSizes[1] < hugeSizes[0], JSON.stringify(hugeSizes))

  // ---- Tight target: the reported "restarted at zero" case ----
  // A limit the first pass cannot reach on its own used to trigger a second
  // render of every page, which reset the page counter to 1 and, on a phone,
  // ran out of memory and lost the first pass entirely.
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-uneven.pdf`])
  await page.waitForSelector('text=Maximum size')
  await page.getByRole('button', { name: 'KB', exact: true }).click()
  const tightField = page.locator('input[inputmode="numeric"]').first()
  await tightField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('400')
  await page.locator('body').click()
  await page.waitForTimeout(200)

  const tTight = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()

  // Watch the progress panel for the whole run. Within one stage the page
  // counter must only ever climb: a drop means that stage started the document
  // over, which is the whole document being rendered a second time.
  const seen = []
  let regressions = 0
  let lastLabel = ''
  let lastPage = 0
  const watch = setInterval(async () => {
    try {
      const panel = await page.locator('main').innerText()
      const m = panel.match(/Page (\d+) of (\d+)/)
      if (!m) return
      // The label is uppercased by CSS, and innerText returns it as rendered.
      const label = (panel.match(/(TRYING LOSSLESS FIRST|CHECKING PAGES|COMPRESSING|FINE-TUNING[^\n]*)/i) ?? [''])[0]
      const current = Number(m[1])
      if (label === lastLabel && current < lastPage) regressions++
      lastLabel = label
      lastPage = current
      seen.push(`${label}:${current}`)
    } catch {
      // The panel is gone; the run finished between polls.
    }
  }, 100)

  await page.waitForSelector('button:has-text("Save to device")', { timeout: 180000 })
  clearInterval(watch)
  const tightMs = Date.now() - tTight
  const tightText = await page.locator('main').innerText()
  console.log(`      uneven 2.1 MB / 24 pages -> 400 KB target took ${(tightMs / 1000).toFixed(1)}s`)
  check('Tight target never renders the document twice', regressions === 0, `${regressions} restarts over ${seen.length} samples`)
  check('Tight target still produces a file', tightText.includes('ready') || tightText.includes('smaller'))
  const tightSizes = [...tightText.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))
  check('Tight target lands under the limit', tightSizes.length >= 2 && tightSizes[1] <= 400, JSON.stringify(tightSizes))

  // ---- Scanned book: the words have to stay readable ----
  // Every page is a photograph of text. Asked for a size it cannot reach, the
  // compressor used to drop to 32 DPI and hand back dissolved letters. It must
  // now hold a legible resolution and say it stopped, rather than obey the
  // number and destroy the document.
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-scan.pdf`])
  await page.waitForSelector('text=Maximum size')
  await page.getByRole('button', { name: 'KB', exact: true }).click()
  const scanField = page.locator('input[inputmode="numeric"]').first()
  await scanField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  // 10 KB a page: real compression is possible here, but not this much.
  await page.keyboard.type('100')
  await page.locator('body').click()
  await page.waitForTimeout(200)
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 180000 })
  const scanText = await page.locator('main').innerText()
  // Either honest answer is fine — "it would blur the words" or "re-encoding
  // would not have helped". What must never happen is silently obeying the
  // number by destroying the text.
  check(
    'Impossible scan target is admitted, not faked',
    /readable|blur|larger, not smaller/i.test(scanText),
    scanText.slice(0, 140).replace(/\n/g, ' '),
  )

  await page.locator('button:has-text("Save to device")').click()
  await page.waitForTimeout(1500)
  const savedScan = [...savedTo.entries()].find(([n]) => n.includes('scan'))
  check('Compressed scan was saved', Boolean(savedScan), [...savedTo.keys()].join(', '))

  if (savedScan) {
    // Read the pixel size of the image actually placed on the page. This is
    // the number that decides whether a reader can make out the words, and it
    // is the number that was wrong: 268x379 for a whole A4 sheet.
    const { PDFDocument: PDFDoc, PDFName } = await import('pdf-lib')
    const outBytes = fs.readFileSync(savedScan[1])
    const outDoc = await PDFDoc.load(outBytes, { ignoreEncryption: true })
    const first = outDoc.getPage(0)
    const xobjects = first.node.Resources()?.lookup(PDFName.of('XObject'))
    let widest = 0
    let tallest = 0
    if (xobjects) {
      for (const key of xobjects.keys()) {
        const img = xobjects.lookup(key)
        const w = img?.dict?.get(PDFName.of('Width'))?.asNumber?.()
        const h = img?.dict?.get(PDFName.of('Height'))?.asNumber?.()
        if (w && w > widest) widest = w
        if (h && h > tallest) tallest = h
      }
    }
    // An A4 page is 8.27in wide, so width in pixels / 8.27 is the DPI.
    const dpi = widest / 8.27
    console.log(`      scanned page rendered at ${widest}x${tallest} px (~${dpi.toFixed(0)} DPI)`)
    check('Scanned text keeps a readable resolution', dpi >= 110, `${dpi.toFixed(0)} DPI at ${widest}x${tallest}`)
  }

  // ---- Long text document: must bail out fast, not grind through 300 pages ----
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-long-text.pdf`])
  await page.waitForSelector('text=Maximum size')
  await page.getByRole('button', { name: 'KB', exact: true }).click()
  const longField = page.locator('input[inputmode="numeric"]').first()
  await longField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('120')
  await page.locator('body').click()
  await page.waitForTimeout(200)
  const tLong = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 120000 })
  const longMs = Date.now() - tLong
  const longText = await page.locator('main').innerText()
  console.log(`      300-page text doc resolved in ${(longMs / 1000).toFixed(1)}s`)
  check('Long text doc resolves quickly, not by rendering every page', longMs < 25000, `${(longMs / 1000).toFixed(1)}s`)
  check('Explains that re-encoding would not help', longText.includes("can't get smaller") || longText.includes('already packed efficiently'))

  // ---- Government Exams: pick an exam, open a document pre-filled ----
  await openTool(page, 'gov-exams')
  await page.waitForSelector('text=Pick your exam')
  check('Exam list shows the targeted exams', (await page.locator('text=SSC CGL').count()) > 0 && (await page.locator('text=NEET UG').count()) > 0)
  await page.locator('input[aria-label="Search exams"]').fill('neet')
  await page.waitForTimeout(200)
  check('Search narrows the list', (await page.locator('text=SSC CGL').count()) === 0 && (await page.locator('text=NEET UG').count()) > 0)
  await page.locator('text=NEET UG').first().click()
  await page.waitForSelector('text=documents to prepare')
  const examText = await page.locator('main').innerText()
  check('Exam lists all its documents', examText.includes('Passport photograph') && examText.includes('Postcard photograph') && examText.includes('Left thumb impression'))
  check('Each document shows its spec', examText.includes('276×354 px') && examText.includes('10–200 KB'))

  // a signature document routes to the signature tool, pre-filled
  await page.locator('text=Signature').first().click()
  await page.waitForSelector('text=Add your signature')
  const sigHeader = await page.locator('header').innerText()
  check('Signature opens pre-filled from the exam', sigHeader.includes('NEET UG') && sigHeader.includes('280×120'))

  // a photo document routes to Smart Photo, skipping the requirement step
  await openTool(page, 'gov-exams/ssc-cgl')
  await page.waitForSelector('text=documents to prepare')
  await page.locator('text=Photograph').first().click()
  await page.waitForSelector('text=Add your photo')
  const photoHeader = await page.locator('header').innerText()
  check('Photo opens pre-filled and skips the size step', photoHeader.includes('SSC CGL') && photoHeader.includes('200×230'))
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-1.jpg`])
  await page.waitForSelector('text=Frame your photo')
  await page.locator('button:has-text("Prepare photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  check('Exam-driven photo meets the exam spec', (await page.locator('main').innerText()).includes('Meets every requirement'))

  // ---- Resize Photo: a size limit applies to PNG as well as JPEG ----
  await openTool(page, 'resize-photo')
  await page.waitForSelector('text=Resize Photo')
  await page.getByRole('button', { name: 'PNG', exact: true }).click()
  const pngLimit = page.locator('input[type="checkbox"]').first()
  check('Size limit is offered for PNG', await pngLimit.isEnabled())
  await pngLimit.check()
  const pngKb = page.getByLabel('Maximum size in KB')
  await pngKb.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('60')
  await page.locator('body').click()
  await page.locator('button:has-text("Continue")').click()
  await page.waitForSelector('text=Add your photo')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-1.jpg`])
  await page.waitForSelector('text=Frame your photo')
  await page.locator('button:has-text("Resize photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 30000 })
  const pngResult = await page.locator('main').innerText()
  check('PNG honours the size limit', pngResult.includes('Meets every requirement'), pngResult.split('\n')[0])
  check('PNG result is still a PNG', pngResult.includes('PNG'))
  check('PNG explains how it reached the size', pngResult.includes('Colours were reduced'))
  const pngBytes = await page.evaluate(() => {
    const img = document.querySelector('main img[alt="Prepared result"]')
    return img ? fetch(img.src).then((r) => r.blob()).then((b) => b.size) : 0
  })
  check(`PNG landed under 60 KB (${Math.round(pngBytes / 1024)} KB)`, pngBytes > 0 && pngBytes <= 60 * 1024, `${pngBytes} bytes`)

  // ---- Signing on the screen ----
  await openTool(page, 'signature-maker')
  await page.waitForSelector('text=Add your signature')
  await page.locator('button:has-text("Sign on this screen")').click()
  await page.waitForSelector('text=Sign here')
  const pad = page.locator('canvas[aria-label^="Signature pad"]')
  check('Signature pad is shown', (await pad.count()) === 1)
  const padBox = await pad.boundingBox()
  await page.mouse.move(padBox.x + padBox.width * 0.15, padBox.y + padBox.height * 0.6)
  await page.mouse.down()
  for (let i = 1; i <= 24; i++) {
    const t = i / 24
    await page.mouse.move(
      padBox.x + padBox.width * (0.15 + 0.7 * t),
      padBox.y + padBox.height * (0.6 - 0.28 * Math.sin(t * Math.PI * 2)),
    )
  }
  await page.mouse.up()
  await page.waitForTimeout(150)
  check('Drawing enables the finish button', await page.locator('button:has-text("Use this signature")').isEnabled())
  await page.locator('button:has-text("Undo")').click()
  await page.waitForTimeout(100)
  check('Undo empties the pad', await page.locator('button:has-text("Use this signature")').isDisabled())
  await page.mouse.move(padBox.x + padBox.width * 0.2, padBox.y + padBox.height * 0.55)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(
      padBox.x + padBox.width * (0.2 + 0.6 * (i / 20)),
      padBox.y + padBox.height * (0.55 + 0.2 * Math.sin(i / 3)),
    )
  }
  await page.mouse.up()
  await page.locator('button:has-text("Use this signature")').click()
  await page.waitForSelector('text=Your signature is ready', { timeout: 20000 })
  const drawnText = await page.locator('main').innerText()
  check('Drawn signature meets the spec', drawnText.includes('140×60 px') && drawnText.includes('20 KB'))
  check('Drawn signature reads as black ink', drawnText.includes('Black ink'))

  // ---- Privacy wording is present and explicit ----
  await page.goto(BASE)
  await page.waitForSelector('text=FormReady')
  const homeText = await page.locator('main').innerText()
  check('Home states files never leave the phone', homeText.includes('never leave this phone'))
  check('Home explains offline and no upload', homeText.includes('offline') && homeText.includes('Nothing is uploaded'))

  // ---- Empty states are illustrated, not blank ----
  for (const [hash, marker] of [
    ['image-to-pdf', 'Photos into one PDF'],
    ['merge-pdf', 'Combine PDFs'],
    ['split-pdf', 'Extract PDF pages'],
    ['compress-pdf', 'Reduce PDF size'],
  ]) {
    await openTool(page, hash)
    await page.waitForSelector(`text=${marker}`)
    const svgCount = await page.locator('main svg[role="presentation"]').count()
    check(`${hash} empty state is illustrated`, svgCount > 0)
  }

  // ---- Dark mode renders ----
  const dark = await browser.newPage({ viewport: { width: 420, height: 900 }, colorScheme: 'dark' })
  await completeOnboarding(dark)
  const bg = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('Dark mode has a dark ground', bg === 'rgb(15, 17, 22)', bg)
  const titleColour = await dark.evaluate(() => getComputedStyle(document.querySelector('h1')).color)
  check('Dark mode text is light', titleColour === 'rgb(238, 240, 244)', titleColour)
  await dark.close()

  check('Save produced a real file', downloads.length > 0, downloads.join(', '))

  await browser.close()
  console.log('\n====================')
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S):`, failures)
    process.exit(1)
  }
  console.log('ALL CHECKS PASSED')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
