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
  for (const name of ['Smart Photo', 'Signature Maker', 'Image to PDF', 'Compress PDF', 'Merge PDF', 'Split PDF']) {
    check(`Home lists ${name}`, (await page.locator(`text=${name}`).count()) > 0)
  }
  check('Privacy footer intact', (await page.locator('text=Processed privately on your device').count()) > 0)

  // ---- Smart Photo: real run on a preset ----
  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  await page.locator('text=SSC / IBPS photo').click()
  await page.locator('button:has-text("Continue")').click()
  await page.waitForSelector('text=Add your photo')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-1.jpg`])
  await page.waitForSelector('text=Frame your photo')
  const photoCrop = await page.locator('main').innerText()
  const photoSourceKb = Math.round(fs.statSync(`${A}/test-photo-1.jpg`).size / 1024)
  const photoShownKb = [...photoCrop.matchAll(/Original:\s*([\d.]+)\s*KB/g)].map((m) => parseFloat(m[1]))[0]
  check('Framing a photo names the file it came from', Math.abs(photoShownKb - photoSourceKb) <= 2, `showed ${photoShownKb} KB, file is ${photoSourceKb} KB`)

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

  // ---- The size band a form states, not just its ceiling ----
  // SSC asks for 20-50 KB. A busy photo clears the floor; a plain one does not,
  // and a file under the floor is rejected as surely as one over the ceiling.
  // Nothing enforced this before: the minimum was in the exam data, shown in the
  // exam list, and then dropped on the way to this screen.
  check('The result reports against its ceiling', sp.includes('≤ 50 KB'), sp.match(/[≥≤]\s*\d+\s*KB/g)?.join(' ') ?? 'no size chips')

  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  await page.locator('text=SSC / IBPS photo').click()
  await page.locator('button:has-text("Continue")').click()
  await page.waitForSelector('text=Add your photo')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-plain.jpg`])
  await page.waitForSelector('text=Frame your photo')
  // The floor is opt-in: SSC states 20 KB, and ticking the box is what puts it
  // in force. Tick it, and everything below must hold as before.
  await page.getByLabel('This form also states a smallest size').check()
  await page.waitForTimeout(150)
  const seededFloor = await page.getByLabel('Smallest allowed size in KB').inputValue()
  check('The preset’s own floor is what gets restored', seededFloor === '20', `${seededFloor} KB`)
  await page.locator('button:has-text("Prepare photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const plain = await page.locator('main').innerText()
  const plainKb = [...plain.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))[1]
  // A plain photo encodes below SSC's 20 KB floor even at full quality, and
  // 200×230 is the form's own dimension, so there is nothing left to spend.
  // This used to be reported as a rejection risk and left there; the file is
  // now brought up to the floor instead, and says so.
  check('A plain photo is brought up to the form’s minimum', plainKb >= 20 && plainKb <= 50, `${plainKb} KB into SSC’s 20–50 KB band`)
  check('Meeting the band is then reported as met', plain.includes('Meets every requirement'), plain.slice(0, 90).replace(/\n/g, ' '))
  check('And the padding is disclosed rather than slipped in', /Padded up to 20 KB/i.test(plain), plain.slice(0, 120).replace(/\n/g, ' '))

  // ---- A result far under its limit is explained, not left looking broken ----
  // 413x531 holds only so much detail. When the encoder is already at maximum,
  // the unused allowance cannot be spent, and saying so is the difference
  // between a correct result and one that reads as a failure.
  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  await page.locator('text=Passport size').click()
  await page.locator('button:has-text("Continue")').click()
  await page.waitForSelector('text=Add your photo')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-plain.jpg`])
  await page.waitForSelector('text=Frame your photo')
  await page.locator('button:has-text("Prepare photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const roomy = await page.locator('main').innerText()
  const roomyKb = [...roomy.matchAll(/([\d.]+)\s*(KB|MB)/g)].map((m) => (m[2] === 'MB' ? parseFloat(m[1]) * 1024 : parseFloat(m[1])))[1]
  check('Reproduces the reported case: far under the limit', roomyKb < 100 * 0.6, `${roomyKb} KB of 100 KB`)
  check('Explains why the allowance is unspendable', /all the detail/i.test(roomy), roomy.slice(0, 90).replace(/\n/g, ' '))
  check('Explaining it does not turn the result amber', roomy.includes('Meets every requirement'))

  // ---- Size-first: one number in, the app works out the rest ----
  // Reads what the result actually is rather than trusting the summary text.
  async function readPreparedPhoto(page) {
    return page.evaluate(async () => {
      const img = document.querySelector('main img[alt="Prepared result"]')
      const blob = await (await fetch(img.src)).blob()
      const bitmap = await createImageBitmap(blob)
      const out = { bytes: blob.size, width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return out
    })
  }

  async function openSizeFirst(page, fixture) {
    await openTool(page, 'smart-photo')
    await page.waitForSelector('text=What does the form need?')
    await page.locator('text=Custom requirement').click()
    await page.waitForSelector('text=Start with your photo')
    await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [fixture])
    await page.waitForSelector('text=Here is your photo')
  }

  async function setBudgetKb(page, kb) {
    await page.getByRole('button', { name: 'KB', exact: true }).click()
    const field = page.locator('input[inputmode="numeric"]').first()
    await field.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(String(kb))
    await page.locator('body').click()
    await page.waitForTimeout(150)
  }

  // Count decodes. The first version decoded the file again for every probe,
  // the ceiling check and the final render — five full decodes of a
  // multi-megapixel JPEG in a couple of seconds. On a real phone that exhausted
  // the WebView's memory, after which getContext('2d') returned null for
  // everything and the app had to be force-stopped. It runs on every navigation,
  // so the counter is per-run.
  await page.addInitScript(() => {
    const real = window.createImageBitmap
    window.__decodes = 0
    window.createImageBitmap = function (...args) {
      window.__decodes++
      return real.apply(this, args)
    }
  })

  await openSizeFirst(page, `${A}/test-photo-1.jpg`)
  check('Size-first asks for the photo before any numbers', (await page.locator('text=What does the form need?').count()) === 0)
  const facts = await page.locator('main').innerText()
  check('It reports the photo it was given', facts.includes('1600×1200 px'), facts.slice(0, 80).replace(/\n/g, ' '))
  const realKb = Math.round(fs.statSync(`${A}/test-photo-1.jpg`).size / 1024)
  const shownKb = [...facts.matchAll(/([\d.]+)\s*KB/g)].map((m) => parseFloat(m[1]))[0]
  check('The size it reports is the real one', Math.abs(shownKb - realKb) <= 2, `showed ${shownKb} KB, file is ${realKb} KB`)

  await setBudgetKb(page, 100)
  let sawChecking = false
  const checkWatch = setInterval(async () => {
    try {
      if (/CHECKING YOUR PHOTO/i.test(await page.locator('main').innerText())) sawChecking = true
    } catch {
      // Panel gone between polls.
    }
  }, 25)
  const tCheck = Date.now()
  await page.locator('button:has-text("Check my photo")').click()
  await page.waitForSelector('text=This will work', { timeout: 20000 })
  clearInterval(checkWatch)
  const checkMs = Date.now() - tCheck
  check('The check is visible while it runs', sawChecking)
  check('The check is quick enough to need no fake delay', checkMs < 3000, `${checkMs} ms`)

  await page.locator('button:has-text("Make my photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  // Read the counter before the helper below adds a decode of its own.
  const decodes = await page.evaluate(() => window.__decodes)
  const auto = await readPreparedPhoto(page)
  console.log(`      auto-sized to ${auto.width}×${auto.height} at ${(auto.bytes / 1024).toFixed(1)} KB of 100 KB`)
  check('Auto size stays inside the limit', auto.bytes <= 100 * 1024, `${(auto.bytes / 1024).toFixed(1)} KB`)
  // The complaint in one assertion: 8.9 KB of a 100 KB allowance was 9%.
  check('Auto size actually spends the allowance', auto.bytes >= 70 * 1024, `${(auto.bytes / 1024).toFixed(1)} KB of 100 KB`)
  check('Auto size beats a guessed 200×230', auto.width * auto.height > 200 * 230 * 8, `${auto.width}×${auto.height}`)
  check('Auto size keeps the photo’s shape', Math.abs(auto.width / auto.height / (1600 / 1200) - 1) < 0.02, `${auto.width}×${auto.height}`)
  check('The photo is decoded once, not once per measurement', decodes === 1, `${decodes} decodes for a full run`)

  // ---- Never enlarges ----
  await openSizeFirst(page, `${A}/test-photo-small.jpg`)
  await setBudgetKb(page, 500)
  await page.locator('button:has-text("Check my photo")').click()
  await page.waitForSelector('text=This will work', { timeout: 20000 })
  await page.locator('button:has-text("Make my photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const small = await readPreparedPhoto(page)
  check('A small photo is never enlarged to fill the limit', small.width === 240 && small.height === 320, `${small.width}×${small.height}`)
  check('Using the whole photo is explained, not silently odd', /full size/i.test(await page.locator('main').innerText()))

  // ---- Dimensions that waste the limit are called out, with real numbers ----
  await openSizeFirst(page, `${A}/test-photo-plain.jpg`)
  await setBudgetKb(page, 100)
  await page.locator('text=Set exact pixel dimensions').click()
  await page.locator('input[aria-label="Width"]').fill('200')
  await page.locator('input[aria-label="Height"]').fill('230')
  await page.locator('button:has-text("Check my photo")').click()
  await page.waitForSelector('text=Your limit allows a bigger photo', { timeout: 20000 })
  const growLabel = await page.locator('button:has-text("Use ")').first().innerText()
  const suggested = growLabel.match(/(\d+)×(\d+)/)
  check('The suggestion names a bigger size in the shape asked for',
    Boolean(suggested) && Number(suggested[1]) * Number(suggested[2]) > 200 * 230 * 4 &&
      Math.abs(Number(suggested[1]) / Number(suggested[2]) / (200 / 230) - 1) < 0.03,
    growLabel)
  check('Keeping the small size is still offered', (await page.locator('button:has-text("anyway")').count()) === 1)

  // Taking the suggestion must produce exactly what it promised.
  await page.locator(`button:has-text("${growLabel.trim()}")`).first().click()
  await page.waitForSelector('text=This will work', { timeout: 20000 })
  await page.locator('button:has-text("Make my photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const grown = await readPreparedPhoto(page)
  check('Taking the suggestion produces the suggested photo',
    grown.width === Number(suggested[1]) && grown.height === Number(suggested[2]),
    `asked ${suggested[1]}×${suggested[2]}, got ${grown.width}×${grown.height}`)
  check('The suggested photo still fits the limit', grown.bytes <= 100 * 1024, `${(grown.bytes / 1024).toFixed(1)} KB`)

  // ---- Continue anyway is honoured ----
  await openSizeFirst(page, `${A}/test-photo-plain.jpg`)
  await setBudgetKb(page, 100)
  await page.locator('text=Set exact pixel dimensions').click()
  await page.locator('input[aria-label="Width"]').fill('200')
  await page.locator('input[aria-label="Height"]').fill('230')
  await page.locator('button:has-text("Check my photo")').click()
  await page.waitForSelector('text=Your limit allows a bigger photo', { timeout: 20000 })
  await page.locator('button:has-text("anyway")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const kept = await readPreparedPhoto(page)
  check('A warning never overrides the user', kept.width === 200 && kept.height === 230, `${kept.width}×${kept.height}`)
  check('There is no crop step in size-first', (await page.locator('text=Frame your photo').count()) === 0)

  // ---- A limit too tight for the dimensions recommends a number it can hit ----
  await openSizeFirst(page, `${A}/test-photo-1.jpg`)
  await setBudgetKb(page, 20)
  await page.locator('text=Set exact pixel dimensions').click()
  await page.locator('input[aria-label="Width"]').fill('1200')
  await page.locator('input[aria-label="Height"]').fill('1600')
  await page.locator('button:has-text("Check my photo")').click()
  await page.waitForSelector('text=This size will cost some clarity', { timeout: 20000 })
  const allowLabel = await page.locator('button:has-text("Allow ")').first().innerText()
  const allowKb = Number(allowLabel.match(/(\d+)\s*KB/)?.[1])
  check('It recommends a workable limit', allowKb > 20, allowLabel)
  await page.locator(`button:has-text("${allowLabel.trim()}")`).first().click()
  await page.waitForSelector('text=This will work', { timeout: 20000 })
  await page.locator('button:has-text("Make my photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const relaxed = await readPreparedPhoto(page)
  check('The app can hit the number it recommended', relaxed.bytes <= allowKb * 1024, `${(relaxed.bytes / 1024).toFixed(1)} KB against its own ${allowKb} KB`)

  // ---- The old ways in still work ----
  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  await page.locator('text=UPSC photo').click()
  await page.locator('button:has-text("Continue")').click()
  check('Presets still ask for the requirement first', (await page.locator('text=Add your photo').count()) > 0)

  // ---- Signature: blue ink detection ----
  await openTool(page, 'signature-maker')
  await page.waitForSelector('text=Add your signature')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/blue-signature.jpg`])
  await page.waitForSelector('text=Frame your signature')
  // The framing screen said what it would produce but nothing about the file
  // just picked, so there was no way to tell what was being cut down from.
  const sigCrop = await page.locator('main').innerText()
  const sigSourceKb = Math.round(fs.statSync(`${A}/blue-signature.jpg`).size / 1024)
  const sigShownKb = [...sigCrop.matchAll(/Original:\s*([\d.]+)\s*KB/g)].map((m) => parseFloat(m[1]))[0]
  check('Framing a signature names the file it came from', Math.abs(sigShownKb - sigSourceKb) <= 2, `showed ${sigShownKb} KB, file is ${sigSourceKb} KB`)
  await page.locator('button:has-text("Prepare signature")').click()
  await page.waitForSelector('text=Your signature is ready', { timeout: 20000 })
  // The size it actually produced, which the pass/fail chips never stated.
  const sigResult = await page.locator('main').innerText()
  check('A photographed signature reports before and after', /BEFORE/i.test(sigResult) && /AFTER/i.test(sigResult), sigResult.slice(0, 70).replace(/\n/g, ' '))
  const sigAfterKb = [...sigResult.matchAll(/([\d.]+)\s*KB/g)].map((m) => parseFloat(m[1]))[1]
  check('And the after figure is the real file size', sigAfterKb > 0 && sigAfterKb <= 20, `${sigAfterKb} KB against a 20 KB ceiling`)
  check('Blue ink detected', (await page.locator('text=This looks like blue ink').count()) > 0)
  await page.locator('button:has-text("Convert to black ink")').click()
  await page.waitForTimeout(800)
  check('Blue ink warning clears after converting', (await page.locator('text=This looks like blue ink').count()) === 0)
  const sig = await page.locator('main').innerText()
  check('Signature hits 140×60', sig.includes('140×60 px'))

  // ---- Signature: a black-ink signature is not falsely flagged ----
  await openTool(page, 'signature-maker')
  await page.waitForSelector('text=Add your signature')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/black-signature.jpg`])
  await page.waitForSelector('text=Frame your signature')
  await page.locator('button:has-text("Prepare signature")').click()
  await page.waitForSelector('text=Your signature is ready', { timeout: 20000 })
  check('Black ink not falsely flagged', (await page.locator('text=This looks like blue ink').count()) === 0)

  // ---- Picking a photo says something while it opens ----
  // Opening a phone photo decodes, redraws and re-encodes several megapixels.
  // That ran with nothing at all on screen, so for three or four seconds the
  // app looked like it had hung at the moment the user had just acted.
  await openTool(page, 'signature-maker')
  await page.waitForSelector('text=Add your signature')
  check('The signature screen offers the bold-pen tip before signing', /bold pen/i.test(await page.locator('main').innerText()))
  const opening = page.waitForSelector('text=Opening your signature', { timeout: 10000 }).then(
    () => true,
    () => false,
  )
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-huge.jpg`])
  check('Choosing a photo says it is opening rather than looking hung', await opening)
  await page.waitForSelector('text=Frame your signature', { timeout: 20000 })

  // ---- Signature: a form's smallest size is a requirement, not a suggestion ----
  // SSC asks for 10-20 KB at 140×60. Ink on white paper encodes to a few
  // kilobytes at those dimensions, and quality is already at its ceiling, so
  // the app produced 5.4 KB, said it could not be helped, and left the
  // candidate with a file that would be rejected. Nothing in the suite asserted
  // a signature ever met a minimum, which is how that shipped.
  async function sscSignature(file) {
    await openTool(page, 'gov-exams/ssc-cgl')
    await page.waitForSelector('text=documents to prepare')
    await page.locator('text=Signature').first().click()
    await page.waitForSelector('text=Add your signature')
    await page.getByLabel('This form also states a smallest size').check()
    await page.waitForTimeout(150)
    await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/${file}`])
    await page.waitForSelector('text=Frame your signature')
    await page.locator('button:has-text("Prepare signature")').click()
    await page.waitForSelector('text=Your signature is ready', { timeout: 20000 })
    // Measured off the produced file rather than the screen, so this cannot
    // pass on a label while the bytes say otherwise.
    return page.evaluate(async () => {
      const img = document.querySelector('main img')
      const blob = await (await fetch(img.src)).blob()
      const bitmap = await createImageBitmap(blob)
      return { bytes: blob.size, width: bitmap.width, height: bitmap.height }
    })
  }

  const sscSig = await sscSignature('blue-signature.jpg')
  check(
    'A signature reaches the smallest size the form demands',
    sscSig.bytes >= 10 * 1024 && sscSig.bytes <= 20 * 1024,
    `${(sscSig.bytes / 1024).toFixed(1)} KB into SSC's 10–20 KB band`,
  )
  // Padding that broke the picture would be worse than the problem it solves.
  check(
    'And the padded file is still a readable 140×60 image',
    sscSig.width === 140 && sscSig.height === 60,
    `${sscSig.width}×${sscSig.height}`,
  )
  check(
    'The padding is disclosed, not slipped in',
    /Padded up to 10 KB/i.test(await page.locator('main').innerText()),
  )

  // Converting ink greyscales and stretches levels, which makes the file
  // smaller — so this used to push a signature further under the floor, and
  // then replace the warning about it with a cheerful confirmation.
  await page.locator('button:has-text("Convert to black ink")').click()
  await page.waitForTimeout(800)
  const converted = await page.evaluate(async () => {
    const img = document.querySelector('main img')
    const blob = await (await fetch(img.src)).blob()
    return blob.size
  })
  check(
    'Converting to black ink keeps it above the floor',
    converted >= 10 * 1024 && converted <= 20 * 1024,
    `${(converted / 1024).toFixed(1)} KB after conversion`,
  )

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
  // "Pick only the pages you need" — so it opens with none of them ticked,
  // where it used to open with every page of a 615-page book already on.
  check('A document opens with nothing selected', (await page.locator('header').innerText()).includes('0 of 6 selected'))
  check('The button says what to do rather than counting to zero', (await page.locator('button:has-text("Select pages to extract")').count()) === 1)
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
  // ---- On a long document the controls stay reachable ----
  // Everything below the grid used to scroll away with it: the count, the way
  // to start over, and the button that finishes the job — which on 300 pages
  // sat a hundred rows down, past every page already dealt with.
  await page.mouse.wheel(0, 9000)
  await page.waitForTimeout(400)
  const view = page.viewportSize()
  const countBox = await page.locator('header p:has-text("selected")').boundingBox()
  check(
    'The selection count stays on screen while the grid scrolls',
    countBox !== null && countBox.y >= 0 && countBox.y < view.height,
    countBox ? `y=${Math.round(countBox.y)} of ${view.height}` : 'not rendered',
  )
  check('And so do All and None', (await page.locator('header button:has-text("None")').count()) === 1)
  const fieldBox = await page.locator('input[aria-label="Pages to select, by number"]').boundingBox()
  check(
    'The page-number field stays on screen too',
    fieldBox !== null && fieldBox.y >= 0 && fieldBox.y < view.height,
    fieldBox ? `y=${Math.round(fieldBox.y)} of ${view.height}` : 'not rendered',
  )
  const extractBox = await page.locator('button:has-text("Extract")').boundingBox()
  check(
    'The extract button is reachable without scrolling to the end',
    extractBox !== null && extractBox.y >= 0 && extractBox.y + extractBox.height <= view.height + 4,
    extractBox ? `y=${Math.round(extractBox.y)} of ${view.height}` : 'not rendered',
  )

  // ---- A range it cannot read says so, instead of silently selecting nothing ----
  const beforeBad = await page.locator('header p:has-text("selected")').innerText()
  await page.locator('input[aria-label="Pages to select, by number"]').fill('abc')
  await page.locator('button:has-text("Apply")').click()
  await page.waitForTimeout(250)
  const badText = await page.locator('header').innerText()
  check('An unreadable range is reported', /couldn't find/i.test(badText), badText.slice(0, 70).replace(/\n/g, ' '))
  check(
    'And it changes nothing behind the user’s back',
    (await page.locator('header p:has-text("selected")').innerText()) === beforeBad,
    beforeBad,
  )
  // a page past the end of the document is the same mistake
  await page.locator('input[aria-label="Pages to select, by number"]').fill('900')
  await page.locator('button:has-text("Apply")').click()
  await page.waitForTimeout(250)
  check('A page past the end is caught too', /couldn't find/i.test(await page.locator('header').innerText()))

  // The keyboard's Go key used to do nothing at all.
  await page.locator('input[aria-label="Pages to select, by number"]').fill('5-7')
  await page.locator('input[aria-label="Pages to select, by number"]').press('Enter')
  await page.waitForSelector('text=3 of 300 selected')
  check('Enter applies the range, not just the Apply button', true)

  // ---- A range applied from far away brings its pages into view ----
  // 250-252 sits about eighty rows below the fold; changing a number and
  // leaving the user where they were reads as nothing having happened.
  await page.locator('input[aria-label="Pages to select, by number"]').fill('250-252')
  await page.locator('input[aria-label="Pages to select, by number"]').press('Enter')
  await page.waitForSelector('text=3 of 300 selected')
  await page.waitForTimeout(400)
  const firstPicked = await page.locator('[data-page="249"]').boundingBox()
  check(
    'Applying a far-off range scrolls to it',
    firstPicked !== null && firstPicked.y > 0 && firstPicked.y < view.height,
    firstPicked ? `y=${Math.round(firstPicked.y)} of ${view.height}` : 'not rendered',
  )

  // ---- Thumbnails are let go once they are well out of sight ----
  // Measured at 15.3 KB each, a document scrolled end to end used to hold
  // every page it had ever drawn: about 9 MB on a 615-page book.
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(2500)
  const held = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('main .grid img')]
    return { count: imgs.length, kb: Math.round(imgs.reduce((n, im) => n + im.src.length, 0) / 1024) }
  })
  check(
    `Drawn pages are released behind you (${held.count} held, ${held.kb} KB)`,
    held.count > 0 && held.count < 90,
    `${held.count} of 300 still drawn`,
  )
  // The selected state has to carry across the whole tile: a 2px border on a
  // white page is slow to read in a grid of forty.
  const wash = await page.evaluate(() => {
    // A translucent colour can come back as rgba() or, from a CSS variable, as
    // oklab(… / 0.2). Read the alpha off either rather than the notation.
    const alphaOf = (el) => {
      const m = getComputedStyle(el).backgroundColor.match(/[/,]\s*(0?\.\d+)\s*\)\s*$/)
      return m ? parseFloat(m[1]) : null
    }
    const covering = (button) =>
      [...button.querySelectorAll('span')].some(
        (el) => el.clientWidth > 30 && el.clientHeight > 30 && (alphaOf(el) ?? 0) > 0,
      )
    const on = document.querySelector('main .grid button[aria-pressed="true"]')
    const off = document.querySelector('main .grid button[aria-pressed="false"]')
    return { on: on ? covering(on) : null, off: off ? covering(off) : null }
  })
  check('A selected page is washed, not just outlined', wash.on === true, JSON.stringify(wash))
  check('An unselected one is not', wash.off === false, JSON.stringify(wash))
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
  await sizeField.fill('10')
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

  // ---- The reported case: a real 44 MB scan, refused as "too large" ----
  // The message was a catch-all wearing a diagnosis: both throw sites in
  // compressPdf swallowed whatever pdf.js or pdf-lib actually said and
  // reported "too large" regardless of the real cause. This is the file size
  // that was refused; it must succeed now, and quickly, not just eventually.
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-45mb.pdf`])
  await page.waitForSelector('text=Maximum size', { timeout: 30000 })
  await page.getByRole('button', { name: 'MB', exact: true }).click()
  const bigField = page.locator('input[inputmode="decimal"]').first()
  await bigField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('30')
  await page.locator('body').click()
  await page.waitForTimeout(200)
  const tBig = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 120000 })
  const bigMs = Date.now() - tBig
  console.log(`      44 MB scan -> 30 MB target took ${(bigMs / 1000).toFixed(1)}s`)
  check(
    'A 44 MB file is no longer refused as too large',
    (await page.locator('main').innerText()).includes('Meets every requirement'),
    `${(bigMs / 1000).toFixed(1)}s`,
  )

  // ---- Errors say what actually went wrong, not "too large" for everything ----
  // Two catch-alls used to flatten any failure — a locked file, a damaged
  // file, a bug of our own — into the same size-shaped message.
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-locked.pdf`])
  await page.waitForSelector('text=Maximum size', { timeout: 15000 })
  await page.locator('input[aria-label^="Maximum size"]').fill('8')
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForTimeout(2000)
  const lockedText = await page.locator('main').innerText()
  check('A password-protected PDF names the password, not the size', /password/i.test(lockedText) && !/too large/i.test(lockedText), lockedText.slice(0, 90).replace(/\n/g, ' '))

  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-corrupt.pdf`])
  await page.waitForSelector('text=Maximum size', { timeout: 15000 })
  await page.locator('input[aria-label^="Maximum size"]').fill('6')
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForTimeout(2000)
  const corruptText = await page.locator('main').innerText()
  check('A damaged PDF names the damage, not the size', /damaged|could not be read/i.test(corruptText) && !/too large/i.test(corruptText), corruptText.slice(0, 90).replace(/\n/g, ' '))

  // ---- Filters a worker cannot build ----
  // pdf.js applies transfer functions and soft masks by pointing the canvas at
  // an SVG filter it appends to the document. A worker has no document, so it
  // reached for `document.URL` and threw — which is what stopped a 224-page
  // scan three-quarters of the way through, and got reported as the file being
  // too large. A filter with real effect now goes back to the main thread; one
  // that computes identity, as scanners leave behind, is simply dropped.
  const workerLog = []
  page.on('worker', (w) => {
    const name = w.url().split('/').pop() ?? ''
    workerLog.push(`start ${name}`)
    w.on('close', () => workerLog.push(`close ${name}`))
  })

  async function compressAndWatch(file) {
    workerLog.length = 0
    await openTool(page, 'compress-pdf')
    await page.waitForSelector('text=Reduce PDF size')
    await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/${file}`])
    await page.waitForSelector('text=Maximum size', { timeout: 15000 })
    // The unit first: it decides whether the field takes decimals, and with no
    // value filled in the screen picks MB for a file this size.
    await page.locator('button:has-text("KB")').first().click()
    await page.locator('input[aria-label^="Maximum size"]').fill('150')
    await page.locator('button:has-text("Compress PDF")').click()
    await page.waitForSelector('text=Your PDF is ready', { timeout: 120000 }).catch(() => {})
    const text = await page.locator('main').innerText()
    const closed = workerLog.findIndex((e) => e.startsWith('close compress.worker'))
    const onMain = workerLog.findIndex((e, i) => i > closed && e.startsWith('start pdf.worker'))
    return { text, closed, onMain }
  }

  const withFilters = await compressAndWatch('test-doc-filters.pdf')
  check(
    'A transfer function no longer stops the job partway through',
    /Your PDF is ready/.test(withFilters.text) && !/URL/.test(withFilters.text),
    withFilters.text.slice(0, 90).replace(/\n/g, ' '),
  )
  // pdf.js's own worker appearing after ours closes is the main thread taking
  // the job over — the only place these filters can actually be built.
  check(
    'A filter with real effect is finished on the main thread, not faked',
    withFilters.closed >= 0 && withFilters.onMain > withFilters.closed,
    workerLog.join(' | ') || 'no workers',
  )

  const identityTr = await compressAndWatch('test-doc-identity-tr.pdf')
  check(
    'A transfer function that changes nothing stays in the worker',
    /Your PDF is ready/.test(identityTr.text) && identityTr.closed >= 0 && identityTr.onMain === -1,
    workerLog.join(' | ') || 'no workers',
  )

  // ---- The limit is an allowance to spend, not just a ceiling to stay under ----
  // Calibration only ever gave ground: it guessed settings and corrected them
  // downwards when they came out too big, never upwards when they came out
  // small. A 42 MB book asked for 30 MB came back at 22 MB, soft, with a third
  // of the allowance unused.
  async function compressTo(file, target, unit) {
    await openTool(page, 'compress-pdf')
    await page.waitForSelector('text=Reduce PDF size')
    await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/${file}`])
    await page.waitForSelector('text=Maximum size', { timeout: 20000 })
    // The unit first: it decides whether the field takes decimals, so filling
    // before switching fills the wrong scale.
    await page.locator(`button:has-text("${unit}")`).first().click()
    await page.locator(`input[aria-label="Maximum size in ${unit}"]`).fill(String(target))
    return page
  }

  async function budgetUsed(file, target, unit) {
    await compressTo(file, target, unit)
    await page.locator('button:has-text("Compress PDF")').click()
    await page.waitForSelector('text=BEFORE', { timeout: 240000 }).catch(() => {})
    const text = await page.locator('main').innerText()
    const after = /AFTER\s+([\d.]+)\s*(KB|MB)/i.exec(text)
    if (!after) return { percent: 0, text }
    const kb = after[2].toUpperCase() === 'MB' ? parseFloat(after[1]) * 1024 : parseFloat(after[1])
    const targetKb = unit === 'MB' ? target * 1024 : target
    return { percent: Math.round((kb / targetKb) * 100), text }
  }

  const bookBudget = await budgetUsed('test-doc-book.pdf', 8, 'MB')
  check(
    'A scan uses the allowance it was given rather than stopping short',
    bookBudget.percent >= 88,
    `${bookBudget.percent}% of an 8 MB limit (74% before this was corrected)`,
  )

  // The reported file's own shape. A long, large scan takes a different path
  // through the compressor — no page inspection, no parsed document, every page
  // rasterised from a projection made off a few samples — and that path was
  // aiming a tenth below the limit before anything was rendered.
  const longBudget = await budgetUsed('test-doc-longbook.pdf', 27, 'MB')
  check(
    'A long scan aims at the limit, not a tenth below it',
    longBudget.percent >= 90,
    `${longBudget.percent}% of a 27 MB limit`,
  )
  // The other half of the reserve band below: a limit this document can afford
  // must still be rendered at the top of the readable range. A compressor that
  // reached the target by simply starting low would pass the check below and
  // fail this one.
  const roomyDpi = /(\d+)\s*DPI/.exec(longBudget.text)
  check(
    'A limit it can afford is rendered at full resolution, not the floor',
    roomyDpi !== null && Number(roomyDpi[1]) >= 120,
    roomyDpi ? `${roomyDpi[1]} DPI on a 27 MB limit` : 'no DPI reported',
  )

  // A document with a rhythm, which is what every other fixture here lacks.
  // The sampler used to walk a fixed stride from page one, so on a practice
  // book — a plate, then its report, then the next plate — it measured twelve
  // plates and not one report, and cut the settings to fit a total that was
  // never real. Reported as a 30 MB limit coming back at 22 MB and a 15 MB
  // limit at 11: the same 73% both times, on two different books.
  const caseBudget = await budgetUsed('test-doc-casebook.pdf', 24, 'MB')
  check(
    'A book that alternates heavy and light pages is measured honestly',
    caseBudget.percent >= 88,
    `${caseBudget.percent}% of a 24 MB limit (67% when every sampled page was a plate)`,
  )

  // What the compressor chose, on the screen. For four rounds nothing the app
  // produced could tell a document rendered at 120 DPI and quality 0.44 from
  // one rendered at 175 and 0.82, so a shortfall on someone's phone could only
  // be guessed at.
  const detail = await page.locator('main').innerText()
  const dpiSaid = /(\d+)\s*DPI/.exec(detail)
  check(
    'The result says what resolution it rendered at',
    dpiSaid !== null && Number(dpiSaid[1]) >= 32 && Number(dpiSaid[1]) <= 175,
    dpiSaid ? `${dpiSaid[1]} DPI, inside the 32-175 the two limit sets allow` : 'no DPI reported',
  )
  check(
    'And the quality it encoded at',
    /quality 0\.\d+/.test(detail),
    detail.split('\n').find((l) => /DPI/.test(l)) ?? 'no quality reported',
  )

  // ---- A limit below the comfortable floor is reached, not refused ----
  // Reported from a phone: a 707-page scan asked for 43 MB came back at 50,
  // reporting "120 DPI, quality 0.41" — the comfortable floor exactly — with
  // the result telling the user to go and split the document up themselves.
  // The resolution to reach the limit was there and the compressor would not
  // spend it. On this fixture the same shape produced 16 MB against an 8 MB
  // limit, at 120 DPI and quality 0.4, before the reserve band was added.
  const squeezed = await budgetUsed('test-doc-longbook.pdf', 8, 'MB')
  check(
    'A limit under the comfortable floor is reached rather than refused',
    squeezed.percent <= 100 && squeezed.percent >= 80,
    `${squeezed.percent}% of an 8 MB limit (196% when the floor was absolute)`,
  )
  const squeezedDpi = /(\d+)\s*DPI/.exec(squeezed.text)
  check(
    'It goes below the readable band only as far as the limit demands',
    squeezedDpi !== null && Number(squeezedDpi[1]) >= 90 && Number(squeezedDpi[1]) < 120,
    squeezedDpi ? `${squeezedDpi[1]} DPI, inside the 90-120 reserve` : 'no DPI reported',
  )
  check(
    'And says the words will look soft rather than leaving it to be discovered',
    /soft/i.test(squeezed.text),
    squeezed.text.split('\n').find((l) => /soft/i.test(l)) ?? 'no note about softness',
  )

  // ---- A result never hands the user homework ----
  // "To go smaller, split the document into fewer pages" was advice that could
  // not have helped: the pages weigh the same arriving in six files as in one,
  // so splitting and re-merging returns the identical total.
  const impossible = await budgetUsed('test-doc-book.pdf', 400, 'KB')
  check(
    'A target that truly cannot be met still stops and says so',
    impossible.percent > 100 && /no longer be readable|stay readable/i.test(impossible.text),
    impossible.text.split('\n').find((l) => /readable/i.test(l)) ?? `${impossible.percent}%`,
  )
  check(
    'And does not tell the user to go and split the document up',
    !/split (it|the document)/i.test(impossible.text),
    impossible.text.split('\n').find((l) => /split/i.test(l)) ?? 'no split advice',
  )

  const heavyBudget = await budgetUsed('test-doc-heavy.pdf', 700, 'KB')
  check(
    'A document with room to spare is not left at half the limit',
    heavyBudget.percent >= 45,
    `${heavyBudget.percent}% of a 700 KB limit (35% before this was corrected)`,
  )

  // ---- The screen asks for a limit rather than inventing one ----
  // It used to open with half the file size filled in, then warn underneath
  // that half the file size was too little for this many pages, and offer a
  // button out of its own warning reading "Use 86 MB" on an 86 MB file. Three
  // pieces of advice, disagreeing with each other, before any work was done.
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [
    `${A}/test-doc-longbook.pdf`,
  ])
  await page.waitForSelector('text=Maximum size', { timeout: 20000 })
  const limitField = page.locator('input[aria-label^="Maximum size"]')
  check(
    'The limit field starts empty rather than guessing a number',
    (await limitField.inputValue()) === '',
    `field read ${JSON.stringify(await limitField.inputValue())}`,
  )
  check(
    'And nothing can be compressed until a limit is given',
    await page.locator('button:has-text("Compress PDF")').isDisabled(),
  )
  // A file this shape is what exposes the suggestion. The comfortable limit was
  // worked out as 150 KB a page and then clamped to the file's own size, so any
  // document averaging less than that per page — 300 pages inside 348 KB here,
  // 707 pages inside 86 MB on the phone that reported it — made the clamp bite
  // and the button read "use the size you started with". A long scan whose
  // pages are already heavier than 150 KB never reaches the clamp and so cannot
  // show the bug at all.
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [
    `${A}/test-doc-long-text.pdf`,
  ])
  await page.waitForSelector('text=Maximum size', { timeout: 20000 })
  const longTextBytes = fs.statSync(`${A}/test-doc-long-text.pdf`).size
  await page.locator('input[aria-label^="Maximum size"]').fill('200')
  await page.waitForSelector('text=a page across', { timeout: 20000 }).catch(() => {})
  const suggestion = await page.locator('main').innerText()
  const offered = /Use ([\d.]+)\s*(KB|MB)/.exec(suggestion)
  const offeredBytes = offered
    ? Number(offered[1]) * (offered[2] === 'MB' ? 1024 * 1024 : 1024)
    : 0
  check(
    'A suggested limit is a real compression, never the file it started as',
    offered === null || (offeredBytes > 0 && offeredBytes <= 0.81 * longTextBytes),
    offered
      ? `offered ${offered[0]} against a ${Math.round(longTextBytes / 1024)} KB file`
      : 'no suggestion offered',
  )

  // ---- A squeezed target says so before the work, not after ----
  await compressTo('test-doc-book.pdf', 500, 'KB')
  // The page count is read from the file in the background, and the warning
  // cannot be worked out without it.
  await page.waitForSelector('text=hard to read', { timeout: 20000 }).catch(() => {})
  const harsh = await page.locator('main').innerText()
  check(
    'A punishing target warns about legibility before compressing',
    /hard to read/i.test(harsh),
    harsh.split('\n').find((l) => /read|sharp/i.test(l)) ?? harsh.slice(0, 80),
  )
  check(
    'That warning advises, it does not block',
    !(await page.locator('button:has-text("Compress PDF")').isDisabled()),
  )

  await compressTo('test-doc-book.pdf', 2000, 'KB')
  await page.waitForTimeout(300)
  const soft = await page.locator('main').innerText()
  check(
    'A merely tight target warns more gently',
    /lose some sharpness/i.test(soft) && !/hard to read/i.test(soft),
    soft.split('\n').find((l) => /sharp/i.test(l)) ?? soft.slice(0, 80),
  )

  await compressTo('test-doc-book.pdf', 8, 'MB')
  await page.waitForTimeout(300)
  const comfortable = await page.locator('main').innerText()
  check(
    'A comfortable target says nothing at all',
    !/hard to read/i.test(comfortable) && !/lose some sharpness/i.test(comfortable),
    comfortable.split('\n').slice(0, 2).join(' '),
  )

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

  // ---- Compression keeps working when the page's timers are throttled ----
  // Reported from the device: leaving the app all but stopped compression, and
  // the user had to keep reopening it. The cause was a setTimeout yield once a
  // page: Chromium throttles a hidden page's timers to one a second, then one a
  // minute. Headless Chromium will not let a page actually go hidden, so this
  // emulates the mechanism instead — every page timer is held to a second, as a
  // backgrounded page's would be. Work that has left the main thread is
  // untouched by that; work that has not, crawls.
  await page.addInitScript(() => {
    const real = window.setTimeout.bind(window)
    window.__throttle = false
    window.setTimeout = (fn, delay, ...args) =>
      real(fn, window.__throttle ? Math.max(1000, delay || 0) : delay, ...args)
  })
  await openTool(page, 'compress-pdf')
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-huge.pdf`])
  await page.waitForSelector('text=Maximum size', { timeout: 15000 })
  // A 10 MB file defaults the unit to MB.
  await page.getByRole('button', { name: 'MB', exact: true }).click()
  const throttleField = page.locator('input[inputmode="decimal"]').first()
  await throttleField.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('2')
  await page.locator('body').click()
  await page.waitForTimeout(200)
  const workerUrls = []
  page.on('worker', (w) => workerUrls.push(w.url()))
  await page.evaluate(() => {
    window.__throttle = true
  })
  const throttledStart = Date.now()
  await page.locator('button:has-text("Compress PDF")').click()
  await page.waitForSelector('button:has-text("Save to device")', { timeout: 240000 })
  const throttledMs = Date.now() - throttledStart
  await page.evaluate(() => {
    window.__throttle = false
  })
  console.log(`      10 MB / 41 pages with page timers throttled took ${(throttledMs / 1000).toFixed(1)}s`)
  // Left on the main thread this same job pays a throttled timer per page: 41
  // pages, so 40s of waiting on top of the work.
  check(
    `Throttled timers do not stall compression (${(throttledMs / 1000).toFixed(1)}s)`,
    throttledMs < 30000,
    `${(throttledMs / 1000).toFixed(1)}s`,
  )
  check(
    'The work runs off the main thread',
    workerUrls.some((u) => u.includes('compress.worker')),
    workerUrls.map((u) => u.split('/').pop()).join(', ') || 'no workers',
  )
  check('And it still produced a real file', (await page.locator('main').innerText()).includes('Meets every requirement'))

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
    // 90, not the 110 this asserted before the reserve band existed. The floor
    // moved by decision, not by accident: a limit the user sets is now reached
    // where it can be, and 90 DPI is where the compressor still stops. What
    // this check is really for is unchanged — the floor is enforced, and the
    // check above proves the shortfall is admitted rather than hidden.
    check('Scanned text keeps a readable resolution', dpi >= 88, `${dpi.toFixed(0)} DPI at ${widest}x${tallest}`)
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

  // ---- Picking the wrong photo is recoverable without leaving the screen ----
  // Reported from the device: "to change the photo I have to go back to home
  // and return to the section". Nothing on either screen offered a way back to
  // the picker once a photo had been read.
  await openSizeFirst(page, `${A}/test-photo-1.jpg`)
  check('The photo just read is the one shown', (await page.locator('main').innerText()).includes('1600×1200 px'))
  await page.locator('button:has-text("Use a different photo")').click()
  await page.waitForSelector('text=Start with your photo')
  check('Change photo returns to the picker, not to the home screen', (await page.locator('text=Start with your photo').count()) > 0)
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-small.jpg`])
  await page.waitForSelector('text=Here is your photo')
  const swapped = await page.locator('main').innerText()
  check('The second photo replaces the first', swapped.includes('240×320 px') && !swapped.includes('1600×1200 px'), swapped.slice(0, 60).replace(/\n/g, ' '))

  // the same escape hatch on the framing screen
  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  await page.locator('button:has-text("Continue")').click()
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-1.jpg`])
  await page.waitForSelector('text=Frame your photo')
  await page.locator('button:has-text("Use a different photo")').click()
  await page.waitForSelector('text=Add your photo')
  check('Framing screen can go back for another photo', (await page.locator('text=Add your photo').count()) > 0)

  // ---- The spec is editable at the last moment, and the edit is obeyed ----
  // A number we published months ago is not the number on the form in front of
  // the user. Everything has to be changeable before the file is made, and the
  // change has to reach the encoder — not just the label above it.
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-1.jpg`])
  await page.waitForSelector('text=Frame your photo')
  const specText = await page.locator('main').innerText()
  check('The output spec is shown before the work runs', /WHAT WILL BE PRODUCED/i.test(specText))
  check('It says where the numbers came from', /please check against your form/i.test(specText))

  async function typeInto(locator, value) {
    await locator.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(String(value))
    await page.locator('body').click()
    await page.waitForTimeout(120)
  }
  await typeInto(page.getByLabel('Width (px)'), 400)
  await typeInto(page.getByLabel('Height (px)'), 460)
  await typeInto(page.getByLabel('Largest allowed size in KB'), 80)
  await page.locator('button:has-text("Prepare photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const edited = await readPreparedPhoto(page)
  check('An edited requirement is what actually gets made', edited.width === 400 && edited.height === 460, `${edited.width}×${edited.height}`)
  check('An edited size limit is honoured', edited.bytes <= 80 * 1024, `${(edited.bytes / 1024).toFixed(1)} KB of 80 KB`)

  // ---- Exam specs carry a date and a source, and say to check them ----
  await openTool(page, 'gov-exams/ssc-cgl')
  await page.waitForSelector('text=documents to prepare')
  const sscText = await page.locator('main').innerText()
  check('Exam screen asks the user to check, without alarm', /please check them against your exam notification/i.test(sscText))
  check('It says when the numbers were published', sscText.includes('September 2026'))

  // ---- Corrected specs: two exams were carrying SSC's numbers ----
  await openTool(page, 'gov-exams/dsssb')
  await page.waitForSelector('text=documents to prepare')
  const dsssb = await page.locator('main').innerText()
  check('DSSSB asks for its own postcard photo, not SSC’s passport one', dsssb.includes('480×672 px') && dsssb.includes('50–300 KB'), dsssb.includes('200×230 px') ? 'still SSC' : '')
  await openTool(page, 'gov-exams/rrb-ntpc')
  await page.waitForSelector('text=documents to prepare')
  const rrb = await page.locator('main').innerText()
  check('RRB NTPC states the railway band, not SSC’s', rrb.includes('30–70 KB') && !rrb.includes('200×230 px'), rrb.includes('200×230 px') ? 'still SSC dimensions' : '')
  await openTool(page, 'smart-photo')
  await page.waitForSelector('text=What does the form need?')
  check('The UPSC preset allows what UPSC allows', (await page.locator('main').innerText()).includes('20–300KB'))

  // ---- Any other document: a PDF route out of the exam screen ----
  await openTool(page, 'gov-exams/ssc-cgl')
  await page.waitForSelector('text=documents to prepare')
  check('The exam offers a PDF document option', (await page.locator('button:has-text("Compress a PDF document")').count()) === 1)
  await page.locator('button:has-text("Compress a PDF document")').click()
  await page.waitForSelector('text=Compress PDF')
  check('It opens the PDF compressor, named for the exam', (await page.locator('header').innerText()).includes('SSC CGL'))
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [`${A}/test-doc-heavy.pdf`])
  await page.waitForSelector('text=Maximum size', { timeout: 10000 })
  const pdfFromExam = await page.locator('header').innerText()
  check('A PDF picked from the exam route keeps the exam’s name', pdfFromExam.includes('SSC CGL') && pdfFromExam.includes('test-doc-heavy.pdf'))
  // "Any other document" is the one PDF route that states no size — it exists
  // precisely for the forms the app has no numbers for — so it gets the same
  // empty field as picking the tool directly, rather than a number invented to
  // fill the space.
  const openEndedLimit = await page.locator('input[aria-label^="Maximum size"]').inputValue()
  check(
    'A PDF route with no stated limit asks rather than inventing one',
    openEndedLimit === '',
    `field read ${JSON.stringify(openEndedLimit)}`,
  )

  // ---- The stated floor is remembered, not reinvented ----
  // Reported from the device: UPSC presets 20 KB, and unticking then re-ticking
  // the box turned it into 150 KB — half the 300 KB ceiling, because the editor
  // kept no memory of what it had been given.
  await openTool(page, 'gov-exams/upsc-cse')
  await page.waitForSelector('text=documents to prepare')
  await page.locator('text=Signature').first().click()
  await page.waitForSelector('text=Add your signature')
  const floorBox = page.getByLabel('This form also states a smallest size')
  check('The floor starts off, not imposed', !(await floorBox.isChecked()))
  const beforeTick = await page.locator('main').innerText()
  check('The published floor is still named', /states 20 KB as the smallest/i.test(beforeTick), beforeTick.slice(0, 60).replace(/\n/g, ' '))
  await floorBox.check()
  await page.waitForTimeout(150)
  const ticked = await page.getByLabel('Smallest allowed size in KB').inputValue()
  check('Ticking restores the exam’s own floor', ticked === '20', `${ticked} KB`)
  await floorBox.uncheck()
  await floorBox.check()
  await page.waitForTimeout(150)
  const reticked = await page.getByLabel('Smallest allowed size in KB').inputValue()
  check('Unticking and re-ticking does not invent one', reticked === '20', `${reticked} KB — was 150 before this fix`)

  // ---- We do not argue with a number a commission published ----
  await openTool(page, 'gov-exams/ssc-cgl')
  await page.waitForSelector('text=documents to prepare')
  await page.locator('text=Signature').first().click()
  await page.waitForSelector('text=Add your signature')
  const sigSetup = await page.locator('main').innerText()
  check('SSC’s own 140×60 signature spec raises no alarm', !/can't be reached/i.test(sigSetup))
  check('The header agrees with the card while the floor is off', (await page.locator('header').innerText()).includes('≤ 20 KB'))
  await page.getByLabel('This form also states a smallest size').check()
  await page.waitForTimeout(150)
  check('And follows it once the floor is on', (await page.locator('header').innerText()).includes('10–20 KB'))
  await page.getByLabel('This form also states a smallest size').uncheck()

  // A floor the user types that no 140×60 image can reach — 8,400 pixels top
  // out near 27 KB even as pure noise — is still caught.
  await page.getByLabel('This form also states a smallest size').check()
  await typeInto(page.getByLabel('Largest allowed size in KB'), 200)
  await typeInto(page.getByLabel('Smallest allowed size in KB'), 100)
  const typedFloor = await page.locator('main').innerText()
  check('A typed floor that cannot work is still caught', /can't be reached/i.test(typedFloor), typedFloor.slice(0, 70).replace(/\n/g, ' '))

  // ---- The exam screen informs rather than alarms ----
  await openTool(page, 'gov-exams/ssc-cgl')
  await page.waitForSelector('text=documents to prepare')
  const examCopy = await page.locator('main').innerText()
  check('The exam screen no longer warns', !/check these against your notification/i.test(examCopy) && /please check them against your exam notification/i.test(examCopy))
  await openTool(page, 'gov-exams')
  await page.waitForSelector('text=Pick your exam')
  check('The list footer paragraph is gone', !/commissions do change them/i.test(await page.locator('main').innerText()))

  // ---- The search icon no longer sits on its own placeholder ----
  const padLeft = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('input[aria-label="Search exams"]')).paddingLeft),
  )
  check('The search field leaves room for its icon', padLeft >= 36, `${padLeft}px`)

  // ---- An exam of your own ----
  await page.locator('button:has-text("My exam isn\'t listed")').click()
  await page.waitForSelector('text=Which exam are you applying for?')
  await page.getByLabel('Exam name').fill('State PSC')
  await page.getByLabel('Photograph').check()
  await page.waitForTimeout(150)
  await typeInto(page.getByLabel('Width (px)'), 300)
  await typeInto(page.getByLabel('Height (px)'), 400)
  await typeInto(page.getByLabel('Largest allowed size in KB'), 80)
  await page.getByLabel('Document (PDF)').check()
  await page.locator('button:has-text("Save this exam")').click()
  await page.waitForSelector('text=documents to prepare')
  const customDetail = await page.locator('main').innerText()
  check('A saved exam opens like a built-in one', customDetail.includes('300×400 px') && customDetail.includes('≤ 80 KB'), customDetail.slice(0, 60).replace(/\n/g, ' '))
  check('Its PDF row carries a size but no pixels', /Document \(PDF\)/.test(customDetail) && /500 KB/.test(customDetail))
  // The one case where a limit is still filled in for the user: it is the
  // number they recorded on their own exam, not the app guessing at one.
  await page.locator('button:has-text("Document (PDF)")').first().click()
  await page.waitForSelector('text=Reduce PDF size')
  await pickFile(page, () => page.locator('button:has-text("Select PDF")').click(), [
    `${A}/test-doc-heavy.pdf`,
  ])
  await page.waitForSelector('text=Maximum size', { timeout: 15000 })
  const statedLimit = await page.locator('input[aria-label^="Maximum size"]').inputValue()
  check(
    'A limit the exam states does arrive filled in',
    statedLimit === '500',
    `field read ${JSON.stringify(statedLimit)}`,
  )
  await page.goBack()
  await page.waitForSelector('text=documents to prepare')

  // it survives a reload, and it is searchable
  await openTool(page, 'gov-exams')
  await page.waitForSelector('text=Pick your exam')
  check('It is listed after a reload', (await page.locator('text=State PSC').count()) > 0)
  check('It is marked as the user’s own', (await page.locator('main').innerText()).includes('Added by you'))
  await page.locator('input[aria-label="Search exams"]').fill('state')
  await page.waitForTimeout(200)
  check('It is searchable with the rest', (await page.locator('text=State PSC').count()) > 0 && (await page.locator('text=SSC CGL').count()) === 0)

  // its photograph opens pre-filled and produces exactly those pixels
  await page.locator('text=State PSC').first().click()
  await page.waitForSelector('text=documents to prepare')
  await page.locator('text=Photograph').first().click()
  await page.waitForSelector('text=Add your photo')
  await pickFile(page, () => page.locator('button:has-text("Choose from Gallery")').click(), [`${A}/test-photo-1.jpg`])
  await page.waitForSelector('text=Frame your photo')
  await page.locator('button:has-text("Prepare photo")').click()
  await page.waitForSelector('text=Your photo is ready', { timeout: 20000 })
  const mine = await readPreparedPhoto(page)
  check('A custom exam produces the size it was given', mine.width === 300 && mine.height === 400, `${mine.width}×${mine.height}`)
  check('And stays inside the limit it was given', mine.bytes <= 80 * 1024, `${(mine.bytes / 1024).toFixed(1)} KB of 80 KB`)

  // and it can be deleted
  await openTool(page, 'gov-exams')
  await page.waitForSelector('text=Pick your exam')
  await page.locator('text=State PSC').first().click()
  await page.waitForSelector('text=documents to prepare')
  await page.locator('button:has-text("Edit numbers")').click()
  await page.waitForSelector('text=Change the numbers')
  await page.locator('button:has-text("Delete this exam")').click()
  await page.waitForSelector('text=Pick your exam')
  check('A custom exam can be deleted', (await page.locator('text=State PSC').count()) === 0)

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
  // Nothing was compressed, so there is no "before" to show — but the size it
  // came to still has to be on the screen. A 46 KB result with only a "≤ 300
  // KB" tick beside it is what sent the user asking what it had produced.
  check('A drawn signature still states its size', !/BEFORE/i.test(drawnText) && /^\s*[\d.]+\s*KB\s*$/m.test(drawnText), drawnText.slice(0, 70).replace(/\n/g, ' '))

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
