import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let email = ''
  let note = ''
  try {
    const body = await req.json()
    email = String(body.email ?? '').trim().toLowerCase()
    note = String(body.note ?? '').trim().slice(0, 500)
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.from('access_requests').insert({ email, note: note || null })
  if (error) {
    console.error('[request-access] insert failed:', error.message)
    return NextResponse.json({ error: 'Something went wrong — try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
