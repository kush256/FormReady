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
  page.on('download', (d) => downloads.push(d.suggestedFilename()))

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
  await page.locator('button:has-text("Prepare photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const sp = await page.locator('main').innerText()
  check('Smart Photo hits 200×230', sp.includes('200×230 px'))
  check('Smart Photo meets every requirement', sp.includes('Meets every requirement'))
  const sizes = [...sp.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))
  check('Result is smaller than the source', sizes.length >= 2 && sizes[1] < sizes[0], JSON.stringify(sizes))
  check('Result is under the 50 KB cap', sizes[1] <= 50, `${sizes[1]}KB`)
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
  await pickFile(page, () => page.locator('button:has-text("Select PDFs")').click(), [`${A}/test-doc-a.pdf`, `${A}/test-doc-b.pdf`])
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

  // ---- Image to PDF ----
  await openTool(page, 'image-to-pdf')
  await page.waitForSelector('text=Add photos')
  await pickFile(page, () => page.locator('button:has-text("Select photos")').click(), [`${A}/test-photo-1.jpg`, `${A}/test-photo-2.jpg`])
  await page.waitForSelector('text=Create PDF (2 pages)')
  await page.locator('button:has-text("Create PDF")').click()
  await page.waitForSelector('text=Your PDF is ready', { timeout: 30000 })
  check('Image to PDF made 2 pages', (await page.locator('main').innerText()).includes('2 pages'))


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

  // ---- Privacy wording is present and explicit ----
  await page.goto(BASE)
  await page.waitForSelector('text=FormReady')
  const homeText = await page.locator('main').innerText()
  check('Home states files never leave the phone', homeText.includes('never leave this phone'))
  check('Home explains offline and no upload', homeText.includes('offline') && homeText.includes('Nothing is uploaded'))

  // ---- Dark mode renders ----
  const dark = await browser.newPage({ viewport: { width: 420, height: 900 }, colorScheme: 'dark' })
  await dark.goto(BASE)
  await dark.waitForSelector('text=FormReady')
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
