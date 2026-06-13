import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionUser } from '@/lib/supabaseServer'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('folders')
    .select('id, name')
    .eq('user_id', user.id)
    .order('name')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('folders')
    .insert({ name: name.trim(), user_id: user.id })
    .select('id, name')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
