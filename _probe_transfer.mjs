import { chromium } from 'playwright'
const BASE='http://localhost:4173'
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})
const p=await b.newPage()
await p.goto(BASE)
const result = await p.evaluate(async () => {
  const mod = await import('/assets/' + [...document.querySelectorAll('script')].map(s=>s.src).find(()=>true))
  return 'n/a'
})
console.log('skip, using direct pdfjs import instead')
await b.close()
