import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const admin = getSupabaseAdmin()
  const { data } = await admin.from('folders').select('id, name').order('name')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('folders')
    .insert({ name: name.trim() })
    .select('id, name')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
