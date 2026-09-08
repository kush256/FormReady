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
  const nums = page.locator('input[type=number]')
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
  await page.locator('input[type=number]').fill('200')
  const t0 = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 90000 })
  const heavyMs = Date.now() - t0
  const cp = await page.locator('main').innerText()
  const cpSizes = [...cp.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))
  check('Image PDF compressed smaller', cpSizes.length >= 2 && cpSizes[1] < cpSizes[0], JSON.stringify(cpSizes))
  console.log(`      image-heavy 848KB -> 200KB target took ${heavyMs}ms`)

  // ---- Compress PDF: text-only doc should stay sharp, and be fast ----
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-big.pdf`])
  await page.waitForSelector('text=Maximum size')
  await page.locator('input[type=number]').fill('4')
  const t1 = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 60000 })
  const textMs = Date.now() - t1
  console.log(`      text-only 5KB doc took ${textMs}ms`)
  check('Text-only compression is quick', textMs < 8000, `${textMs}ms`)

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
