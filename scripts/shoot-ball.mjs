// Dev utility: high-res close-up of the hero basketball canvas.
//   node scripts/shoot-ball.mjs <url> <outPath> [waitMs]
import puppeteer from 'puppeteer-core'
import { existsSync } from 'fs'

const [url = 'http://localhost:3001', out = 'ball.png', waitMs = '8000'] = process.argv.slice(2)
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const executablePath = EDGE_PATHS.find(p => existsSync(p))

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise(r => setTimeout(r, parseInt(waitMs, 10)))

// The ball lives in a canvas; clip to its bounding box with padding.
const box = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
})
if (!box) { console.log('no canvas found'); await browser.close(); process.exit(1) }

const pad = 20
await page.screenshot({
  path: out,
  clip: {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  },
})
await browser.close()
console.log(`saved ${out}`)
