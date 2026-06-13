// Dev utility: screenshot a page of the running dev server.
//   node scripts/screenshot.mjs <url> <outPath> [waitMs]
import puppeteer from 'puppeteer-core'

const [url = 'http://localhost:3000', out = 'shot.png', waitMs = '6000'] = process.argv.slice(2)

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const { existsSync } = await import('fs')
const executablePath = EDGE_PATHS.find(p => existsSync(p))
if (!executablePath) throw new Error('No Edge/Chrome found')

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--window-size=1440,900', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise(r => setTimeout(r, parseInt(waitMs, 10)))
await page.screenshot({ path: out })
await browser.close()
console.log(`saved ${out}`)
