// Diagnostic: inspect recent videos rows + the 'videos' storage bucket.
//   node scripts/diag-storage.mjs
import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
const envPath = new URL('../.env.local', import.meta.url)
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  if (!(k in process.env)) process.env[k] = v
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log('=== RECENT VIDEOS (newest 8) ===')
const { data: vids, error: vErr } = await admin
  .from('videos')
  .select('id, file_name, video_url, created_at')
  .order('created_at', { ascending: false })
  .limit(8)
if (vErr) console.log('videos query error:', vErr.message)
else for (const v of vids) {
  console.log(`- ${v.created_at}  ${v.file_name}`)
  console.log(`    video_url: ${v.video_url ?? 'NULL'}`)
}

console.log('\n=== BUCKETS ===')
const { data: buckets, error: bErr } = await admin.storage.listBuckets()
if (bErr) console.log('listBuckets error:', bErr.message)
else for (const b of buckets) console.log(`- ${b.name}  public=${b.public}`)

console.log('\n=== FILES in "videos" bucket (newest 10) ===')
const { data: files, error: fErr } = await admin.storage.from('videos').list('', {
  limit: 10, sortBy: { column: 'created_at', order: 'desc' },
})
if (fErr) console.log('list error:', fErr.message)
else if (!files?.length) console.log('(no files)')
else for (const f of files) {
  const size = f.metadata?.size
  console.log(`- ${f.name}  size=${size != null ? (size / 1024 / 1024).toFixed(2) + ' MB' : '?'}`)
}

// Try fetching the most recent video_url to see if it actually serves bytes
const withUrl = vids?.find(v => v.video_url)
if (withUrl) {
  console.log('\n=== FETCH TEST of newest saved video_url ===')
  try {
    const res = await fetch(withUrl.video_url, { method: 'HEAD' })
    console.log(`HEAD ${res.status} ${res.statusText}  content-length=${res.headers.get('content-length')}  content-type=${res.headers.get('content-type')}`)
  } catch (e) {
    console.log('fetch failed:', e.message)
  }
}
